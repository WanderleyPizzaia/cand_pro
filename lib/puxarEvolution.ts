import { query, queryOne, Agente } from "./db";
import { buscarMensagensPagina, type MsgEvolution } from "./evolution";
import { capturarEleitor } from "./eleitores";
import { distribuir } from "./atendimentoCrm";
import { estaPausado } from "./atendimento";
import { saudacaoBot } from "./botSaudacao";
import { responderIA } from "./responder";

// ============================================================
// Busca ativa (plano B do webhook): consulta a Evolution e importa o que
// chegou desde a última mensagem conhecida. Existe porque o webhook depende
// do servidor da Evolution avisar — quando ele engasga, o sistema ficava mudo.
// É idempotente (dedup por wa_id), então conviver com o webhook não duplica.
// ============================================================

const PAGINAS_POR_CICLO = 3; // 50 mensagens por página
// Janela sempre varrida, para não perder mensagem que a Evolution registra
// fora de ordem (recebida antiga aparecendo depois de uma enviada recente).
const JANELA_BUSCA_SEG = 30 * 60;
// Só responde mensagens recentes: importar histórico não deve disparar IA.
const JANELA_RESPOSTA_SEG = 15 * 60;
// Primeira vez para um número novo: pega as últimas horas, não a vida inteira.
// (O histórico anterior à conexão vive na Evolution só se ela tiver sincronizado;
// para trazer o resto existe o botão "Sincronizar" no cartão do agente.)
const PRIMEIRA_CARGA_SEG = 6 * 60 * 60;

export type ResultadoPuxada = {
  agente: string;
  agenteId: number;
  novas: number;
  respondidas: number;
  erro?: string;
};

// `responder: false` importa as mensagens sem acionar a IA (modo diagnóstico).
export type OpcoesPuxada = { responder?: boolean };

export async function puxarNovasDoAgente(
  agente: Agente,
  opts: OpcoesPuxada = {}
): Promise<ResultadoPuxada> {
  const r: ResultadoPuxada = {
    agente: agente.candidato,
    agenteId: agente.id,
    novas: 0,
    respondidas: 0,
  };
  if (!agente.instancia || agente.provedor === "meta") return r;

  // Marca d'água: a mensagem mais nova que já temos deste número.
  const marca = await queryOne<{ t: string | null }>(
    "SELECT EXTRACT(EPOCH FROM MAX(criado_em))::bigint::text t FROM mensagens WHERE agente_id = $1",
    [agente.id]
  );
  const agora = Math.floor(Date.now() / 1000);
  // Varre SEMPRE a janela recente, mesmo que já exista mensagem mais nova no
  // banco: uma recebida pode chegar à Evolution depois de uma enviada mais
  // recente (foi o que aconteceu). A duplicação é impossível (dedup por wa_id).
  const corte = Math.min(
    marca?.t ? Number(marca.t) : agora - PRIMEIRA_CARGA_SEG,
    agora - JANELA_BUSCA_SEG
  );

  // A Evolution devolve das mais NOVAS para as mais antigas: para na 1ª página
  // que já tem mensagem anterior à marca d'água.
  const novas: MsgEvolution[] = [];
  for (let pagina = 1; pagina <= PAGINAS_POR_CICLO; pagina++) {
    const p = await buscarMensagensPagina(agente.instancia, pagina, agente.apikey);
    if (!p.ok) {
      r.erro = p.erro;
      break;
    }
    if (p.msgs.length === 0) break;
    const recentes = p.msgs.filter((m) => m.timestamp > corte);
    novas.push(...recentes);
    if (recentes.length < p.msgs.length) break; // a página já passou da marca
    if (pagina >= (p.pages || 1)) break;
  }
  if (novas.length === 0) return r;

  // Insere em lote, ignorando o que já existe (wa_id do WhatsApp).
  const linhas: string[] = [];
  const vals: any[] = [];
  let k = 1;
  for (const m of novas) {
    linhas.push(
      `($${k++}, $${k++}, $${k++}, $${k++}, $${k++}, to_timestamp($${k++}), $${k++}, $${k++})`
    );
    vals.push(
      agente.id,
      m.numero,
      m.nome,
      m.fromMe ? "out" : "in",
      m.texto,
      m.timestamp,
      m.waId,
      m.status
    );
  }
  // RETURNING diz QUAIS entraram de fato — as que já existiam não voltam.
  // É isso que garante que a IA não responda duas vezes a mesma mensagem.
  const inseridas = await query<{ wa_id: string | null }>(
    `INSERT INTO mensagens
       (agente_id, contato, contato_nome, direcao, texto, criado_em, wa_id, status)
     VALUES ${linhas.join(", ")}
     ON CONFLICT (wa_id) WHERE wa_id IS NOT NULL DO NOTHING
     RETURNING wa_id`,
    vals
  );
  r.novas = inseridas.length;
  if (r.novas === 0) return r; // tudo já tinha chegado pelo webhook
  if (opts.responder === false) return r; // modo diagnóstico: só importa

  // Responde só as RECEBIDAS recentes que ACABARAM de entrar, uma por contato.
  const novasIds = new Set(inseridas.map((x) => x.wa_id).filter(Boolean));
  const recebidas = novas.filter(
    (m) => !m.fromMe && novasIds.has(m.waId) && m.timestamp > agora - JANELA_RESPOSTA_SEG
  );
  const porContato = new Map<string, MsgEvolution>();
  for (const m of recebidas) {
    const atual = porContato.get(m.numero);
    if (!atual || m.timestamp > atual.timestamp) porContato.set(m.numero, m);
  }

  for (const m of porContato.values()) {
    try {
      await distribuir(agente.id, m.numero).catch(() => {});
      await capturarEleitor(agente, m.numero, m.nome).catch(() => {});
      if (!agente.ativo) continue; // agente desligado: só registra
      if (await saudacaoBot(agente, m.numero, m.nome)) {
        r.respondidas++;
        continue;
      }
      if (await estaPausado(agente.id, m.numero)) continue; // humano assumiu
      const resp = await responderIA(agente, {
        numero: m.numero,
        nome: m.nome,
        waId: m.waId,
      });
      if (resp.ok) r.respondidas++;
    } catch (e) {
      r.erro = (e as Error).message;
    }
  }
  return r;
}

// Roda a busca para todos os números Evolution cadastrados.
export async function puxarTodos(opts: OpcoesPuxada = {}): Promise<ResultadoPuxada[]> {
  const agentes = await query<Agente>(
    `SELECT * FROM agentes
      WHERE provedor <> 'meta' AND instancia IS NOT NULL AND instancia <> ''
      ORDER BY id`
  );
  const out: ResultadoPuxada[] = [];
  for (const a of agentes) out.push(await puxarNovasDoAgente(a, opts));
  return out;
}
