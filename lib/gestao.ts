import { query, queryOne, execute, Agente, quotaEfetiva, disparosUsadosHoje } from "./db";
import { perguntarGestao } from "./ia";
import { enviarTexto, atrasoDigitando } from "./evolution";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Monta um bloco de DADOS REAIS do agente/candidato para a IA responder a equipe.
export async function coletarStatsAgente(agente: Agente): Promise<string> {
  const id = agente.id;
  const num = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR");

  const contatos =
    (await queryOne<{ c: number }>("SELECT COUNT(*) c FROM pessoas WHERE agente_id = $1", [id]))?.c ?? 0;
  const contatosHoje =
    (await queryOne<{ c: number }>(
      `SELECT COUNT(*) c FROM pessoas WHERE agente_id = $1
        AND (criado_em AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date`,
      [id]
    ))?.c ?? 0;
  const cidades = await query<{ cidade: string; c: number }>(
    `SELECT cidade, COUNT(*) c FROM pessoas
      WHERE agente_id = $1 AND cidade IS NOT NULL AND cidade <> ''
      GROUP BY cidade ORDER BY c DESC LIMIT 5`,
    [id]
  );
  const msg = await queryOne<{ total: number; inbound: number; outbound: number }>(
    `SELECT COUNT(*) total,
            COUNT(*) FILTER (WHERE direcao='in') inbound,
            COUNT(*) FILTER (WHERE direcao='out') outbound
       FROM mensagens WHERE agente_id = $1`,
    [id]
  );
  const recebidasHoje =
    (await queryOne<{ c: number }>(
      `SELECT COUNT(*) c FROM mensagens WHERE agente_id = $1 AND direcao='in'
        AND (criado_em AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date`,
      [id]
    ))?.c ?? 0;
  const disparosHoje = await disparosUsadosHoje(id);
  const quota = quotaEfetiva(agente);
  const ultimaCampanha = await queryOne<{ titulo: string | null; enviados: number; total: number; quando: string }>(
    `SELECT titulo, enviados, total, to_char(criado_em AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI') quando
       FROM campanhas WHERE agente_id = $1 ORDER BY id DESC LIMIT 1`,
    [id]
  );

  const topCidades = cidades.length
    ? cidades.map((c) => `${c.cidade} (${num(c.c)})`).join(", ")
    : "sem cidade cadastrada ainda";

  return [
    `Candidato: ${agente.candidato}`,
    `Contatos/eleitores na base: ${num(contatos)} (novos hoje: ${num(contatosHoje)})`,
    `Top cidades: ${topCidades}`,
    `Mensagens trocadas: ${num(msg?.total)} (recebidas: ${num(msg?.inbound)}, enviadas: ${num(msg?.outbound)}; recebidas hoje: ${num(recebidasHoje)})`,
    `Disparos de campanha hoje: ${num(disparosHoje)} de ${num(quota)} da cota diária`,
    ultimaCampanha
      ? `Última campanha: "${ultimaCampanha.titulo || "sem título"}" — ${num(ultimaCampanha.enviados)}/${num(ultimaCampanha.total)} enviados em ${ultimaCampanha.quando}`
      : `Última campanha: nenhuma ainda`,
  ].join("\n");
}

// Responde uma pergunta da equipe NO GRUPO, com dados reais, na voz do candidato.
export async function responderGrupoGestao(
  agente: Agente,
  grupoJid: string,
  pergunta: string,
  nomeQuemPerguntou?: string | null
): Promise<{ ok: boolean; erro?: string }> {
  if (!agente.instancia) return { ok: false, erro: "Agente sem instância (Evolution) para responder ao grupo." };

  const contexto = await coletarStatsAgente(agente);
  const resp = await perguntarGestao(agente.persona || "", contexto, pergunta, agente.ia_key);
  if (!resp.ok || !resp.texto) return { ok: false, erro: resp.erro || "Falha ao gerar resposta de gestão" };

  await dormir(atrasoDigitando(resp.texto));
  const envio = await enviarTexto(agente.instancia, grupoJid, resp.texto, agente.apikey, atrasoDigitando(resp.texto));

  // Log da interação de gestão (separado do atendimento de eleitor).
  await execute(
    `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, origem, wa_id, status)
     VALUES ($1, $2, $3, $4, $5, 'gestao', $6, $7)`,
    [
      agente.id,
      grupoJid,
      nomeQuemPerguntou || "grupo",
      envio.ok ? "out" : "erro",
      envio.ok ? resp.texto : `Falha no envio (grupo): ${envio.erro}`,
      envio.waId || null,
      envio.ok ? "sent" : null,
    ]
  );
  return { ok: envio.ok, erro: envio.erro };
}
