import { query, queryOne, execute, type Agente } from "./db";
import { enviarMidiaAgente } from "./meta";
import { ehInstagram, enviarTextoInstagram, origemPublica, urlPublicaGaleria } from "./instagram";

// ============================================================
// Galeria do agente: arquivos prontos (santinho, plano de governo) que a IA
// pode mandar na conversa. A IA nunca gera arquivo: só escolhe um da lista,
// escrevendo o marcador [[ENVIAR:id]] na resposta. O sistema tira o marcador
// do texto (ele nunca chega ao eleitor) e manda o arquivo pelo canal do agente.
// Vale só com config.ferramentas.enviar_material ligado ("Enviar material de
// campanha"); o teste da tela usa a galeria mesmo desligada.
// ============================================================

// A Vercel recusa corpo acima de ~4,5 MB e o base64 cresce 1/3: 3 MB de arquivo.
export const GALERIA_MAX_BYTES = 3 * 1024 * 1024;
export const GALERIA_MAX_ARQUIVOS = 10;
// Anti-loop: o mesmo arquivo para o mesmo contato no máximo 2 vezes por dia.
const REENVIOS_DIA = 2;

export type TipoArquivo = "imagem" | "documento";

export type ArquivoGaleria = {
  id: number;
  nome: string;
  quando: string;
  legenda: string | null;
  tipo: TipoArquivo;
  mime: string;
  nome_arquivo: string | null;
  url: string | null;
  tamanho: number | null;
  criado_em: string;
};

export const MIMES_GALERIA: Record<string, { tipo: TipoArquivo; ext: string }> = {
  "image/jpeg": { tipo: "imagem", ext: "jpg" },
  "image/png": { tipo: "imagem", ext: "png" },
  "application/pdf": { tipo: "documento", ext: "pdf" },
};

// Endereço do arquivo dentro do sistema (bolhas da conversa e miniaturas).
export const urlArquivo = (id: number) => `/api/galeria/${id}`;

export function galeriaLigada(agente: Pick<Agente, "config">): boolean {
  return agente.config?.ferramentas?.enviar_material === true;
}

// Lista sem o conteúdo (o base64 é pesado e só sai no envio).
export async function listarArquivos(agenteId: number): Promise<ArquivoGaleria[]> {
  return query<ArquivoGaleria>(
    `SELECT id, nome, quando, legenda, tipo, mime, nome_arquivo, url, tamanho,
            to_char(criado_em, 'DD/MM/YYYY') AS criado_em
       FROM agente_arquivos WHERE agente_id = $1 AND removido_em IS NULL ORDER BY id`,
    [agenteId]
  );
}

// Quantas vezes cada arquivo já foi para este contato hoje (fuso SP).
export async function enviadosHoje(agenteId: number, contato: string): Promise<Map<number, number>> {
  const linhas = await query<{ media: string; n: number }>(
    `SELECT media, COUNT(*)::int n FROM mensagens
      WHERE agente_id = $1 AND contato = $2 AND origem = 'ia' AND direcao = 'out'
        AND media LIKE '/api/galeria/%'
        AND (criado_em AT TIME ZONE 'America/Sao_Paulo')::date
            = (now() AT TIME ZONE 'America/Sao_Paulo')::date
      GROUP BY media`,
    [agenteId, contato]
  );
  const m = new Map<number, number>();
  for (const l of linhas) {
    const id = Number(l.media.split("/").pop());
    if (id) m.set(id, l.n);
  }
  return m;
}

// Trecho do prompt de sistema que ensina a IA a usar a galeria.
export function instrucoesGaleria(
  arquivos: Pick<ArquivoGaleria, "id" | "nome" | "quando">[],
  jaEnviados: Map<number, number> = new Map()
): string {
  if (!arquivos.length) return "";
  const linhas = arquivos.map((a) => {
    const aviso = jaEnviados.get(a.id)
      ? " (já foi enviado a este contato hoje: só mande de novo se ele pedir)"
      : "";
    return `- ${a.nome}, marcador [[ENVIAR:${a.id}]]. Situação: ${a.quando}${aviso}`;
  });
  return (
    "\n\nARQUIVOS QUE VOCÊ PODE ENVIAR NESTA CONVERSA:\n" +
    linhas.join("\n") +
    `\nPara enviar um deles, escreva o marcador exato (ex.: [[ENVIAR:${arquivos[0].id}]]) sozinho na última linha da resposta. ` +
    "No máximo um arquivo por resposta, e só quando a situação descrita acontecer. " +
    'Junto, escreva uma frase curta avisando que está mandando (ex.: "Segue aqui 👇"). ' +
    "Nunca diga que vai mandar um arquivo sem escrever o marcador, e nunca prometa arquivo que não está nesta lista."
  );
}

const RE_MARCADOR = /\[\[\s*ENVIAR\s*:\s*([^\]]+?)\s*\]\]/gi;

// Tira da resposta todo marcador (nenhum pode vazar para o eleitor) e devolve
// o primeiro pedido: o id, ou o nome quando a IA escreve o nome no lugar.
export function extrairMarcador(texto: string): { texto: string; alvo: string | null } {
  let alvo: string | null = null;
  const limpo = (texto || "")
    .replace(RE_MARCADOR, (_m, a: string) => {
      if (alvo === null) alvo = a.trim();
      return "";
    })
    // Sobra de marcador malformado ("[[ENVIAR:3]", "[[santinho]]").
    .replace(/\[\[[^\]\n]*\]{0,2}/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { texto: limpo, alvo };
}

export function resolverArquivo<T extends Pick<ArquivoGaleria, "id" | "nome">>(
  alvo: string | null,
  arquivos: T[]
): T | null {
  if (!alvo) return null;
  const id = Number(alvo);
  if (Number.isInteger(id) && id > 0) return arquivos.find((a) => a.id === id) || null;
  const chave = alvo.toLowerCase();
  return arquivos.find((a) => a.nome.trim().toLowerCase() === chave) || null;
}

// Manda o arquivo ao contato e registra na conversa (com a mídia apontando
// para /api/galeria/<id>, sem duplicar o base64 em cada mensagem).
export async function enviarArquivoDaGaleria(
  agente: Agente,
  contato: string,
  contatoNome: string | null,
  arquivoId: number
): Promise<{ ok: boolean; erro?: string }> {
  const a = await queryOne<ArquivoGaleria & { conteudo: string | null }>(
    `SELECT id, nome, legenda, tipo, mime, nome_arquivo, url, conteudo
       FROM agente_arquivos WHERE id = $1 AND agente_id = $2 AND removido_em IS NULL`,
    [arquivoId, agente.id]
  );
  if (!a) return { ok: false, erro: "Arquivo não existe mais na galeria" };
  const vezes = (await enviadosHoje(agente.id, contato)).get(a.id) || 0;
  if (vezes >= REENVIOS_DIA) return { ok: false, erro: "reenvio_limite" };
  let midia = a.url || a.conteudo || "";
  if (!midia) return { ok: false, erro: "Arquivo vazio" };

  // Instagram: baixa a imagem por link público (assinado, só deste arquivo) e
  // não aceita documento no Direct: o PDF vai como link em texto.
  let r: { ok: boolean; waId?: string | null; erro?: string };
  if (ehInstagram(contato)) {
    const origem = await origemPublica();
    if (!a.url && !origem) return { ok: false, erro: "Endereço público do sistema desconhecido" };
    midia = a.url || (await urlPublicaGaleria(origem, a.id));
    r =
      a.tipo === "imagem"
        ? await enviarMidiaAgente(agente, contato, { tipo: "imagem", mime: a.mime, midia, nomeArquivo: a.nome })
        : await enviarTextoInstagram(agente, contato, `📄 ${a.nome}: ${midia}`);
  } else {
    r = await enviarMidiaAgente(agente, contato, {
      tipo: a.tipo,
      mime: a.mime,
      midia,
      nomeArquivo: a.nome_arquivo || `${a.nome}.${MIMES_GALERIA[a.mime]?.ext || "pdf"}`,
      legenda: a.legenda || undefined,
    });
  }
  await execute(
    `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, origem, wa_id, status, media, media_tipo)
     VALUES ($1, $2, $3, $4, $5, 'ia', $6, $7, $8, $9)`,
    [
      agente.id,
      contato,
      contatoNome,
      r.ok ? "out" : "erro",
      r.ok ? `📎 ${a.nome}` : `Falha ao enviar "${a.nome}": ${r.erro}`,
      r.waId || null,
      r.ok ? "sent" : null,
      r.ok ? urlArquivo(a.id) : null,
      r.ok ? a.tipo : null,
    ]
  );
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}
