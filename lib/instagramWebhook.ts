// ============================================================
// Eventos do Direct do Instagram (webhook da Meta, ou repassados pelo n8n).
// Mesmas regras do fluxo do n8n que ele substitui:
//  - reenvio da Meta (mesmo mid) é descartado;
//  - mensagens em sequência são agrupadas: só a ÚLTIMA dispara a resposta,
//    que lê a conversa inteira (uma chamada à IA);
//  - eco (mensagem enviada PELA conta) que não foi o sistema que mandou =
//    alguém da equipe respondeu pelo app: a IA pausa naquela conversa;
//    "#pausa" / "#bot" (ou "/ia") controlam na mão;
//  - comentários ainda não são tratados aqui (ficam no n8n).
// ============================================================
import { query, queryOne, execute, Agente } from "./db";
import { getConfig } from "./config";
import { PREFIXO_IG, agentePorContaInstagram, perfilInstagram } from "./instagram";
import { responderIA } from "./responder";
import { distribuir } from "./atendimentoCrm";
import { estaPausado, pausar, retomar, alternar, contemComando } from "./atendimento";
import { capturarEleitor } from "./eleitores";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type EventoIG = {
  tipo: "dm" | "eco";
  contaId: string; // conta do candidato (entry.id)
  usuarioId: string; // IGSID de quem conversa com a conta
  mid: string;
  texto: string;
};

export type ResumoIG = { dms: number; ecos: number; duplicadas: number; ignoradas: number; comentarios: number };

// Payload da Meta -> eventos (mesma leitura do "Normalizar eventos" do n8n).
export function extrairEventosIG(body: any): { eventos: EventoIG[]; comentarios: number } {
  const eventos: EventoIG[] = [];
  let comentarios = 0;
  if (body?.object !== "instagram") return { eventos, comentarios };
  for (const entry of Array.isArray(body.entry) ? body.entry : []) {
    const contaId = String(entry?.id || "");
    for (const ev of Array.isArray(entry?.messaging) ? entry.messaging : []) {
      const m = ev?.message;
      const pb = ev?.postback;
      if (!m && !pb) continue; // leitura, reação etc.
      if (m && (m.is_deleted || m.is_unsupported)) continue;
      const eco = !!(m && m.is_echo);
      const usuario = String((eco ? ev?.recipient?.id : ev?.sender?.id) || "");
      if (!usuario || (!eco && usuario === contaId)) continue;

      let texto = "";
      if (pb) texto = String(pb.title || pb.payload || "").trim();
      else {
        texto = String(m.text || "").trim();
        const anexos = (Array.isArray(m.attachments) ? m.attachments : []).map((a: any) => a?.type).filter(Boolean);
        if (anexos.includes("story_mention")) texto = `[a pessoa mencionou o perfil em um story] ${texto}`.trim();
        else if (anexos.length) texto = `${texto} [a pessoa enviou: ${anexos.join(", ")}]`.trim();
        if (m.reply_to?.story) texto = `[respondendo a um story] ${texto}`.trim();
      }
      if (!eco && !texto) continue;
      const mid = String(m?.mid || pb?.mid || `${usuario}:${ev?.timestamp || Date.now()}`);
      eventos.push({ tipo: eco ? "eco" : "dm", contaId, usuarioId: usuario, mid, texto });
    }
    for (const ch of Array.isArray(entry?.changes) ? entry.changes : [])
      if (ch?.field === "comments" || ch?.field === "live_comments") comentarios++;
  }
  return { eventos, comentarios };
}

async function segundos(chave: string, padrao: number): Promise<number> {
  const v = Number((await getConfig(chave)) || "");
  return Number.isFinite(v) && v >= 0 ? v : padrao;
}

// Nome para a conversa: o que já foi gravado, ou o perfil (nome / @usuário).
async function nomeDoContato(ag: Agente, contato: string, igsid: string) {
  const antes = await queryOne<{ contato_nome: string | null }>(
    `SELECT contato_nome FROM mensagens
      WHERE agente_id = $1 AND contato = $2 AND COALESCE(contato_nome,'') <> ''
      ORDER BY id DESC LIMIT 1`,
    [ag.id, contato]
  );
  if (antes?.contato_nome) return { exibir: antes.contato_nome, nome: null, usuario: null };
  const p = await perfilInstagram(ag, igsid);
  const usuario = p.username ? `@${p.username}` : null;
  return { exibir: p.nome || usuario || "Instagram", nome: p.nome, usuario };
}

// Uma DM: registra, espera o agrupamento e (se for a última) responde.
async function tratarDM(ag: Agente, ev: EventoIG, r: ResumoIG) {
  const contato = PREFIXO_IG + ev.usuarioId;
  const quem = await nomeDoContato(ag, contato, ev.usuarioId);
  const ins = await queryOne<{ id: number }>(
    `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, wa_id)
     VALUES ($1, $2, $3, 'in', $4, $5)
     ON CONFLICT (wa_id) WHERE wa_id IS NOT NULL DO NOTHING RETURNING id`,
    [ag.id, contato, quem.exibir, ev.texto, ev.mid]
  );
  if (!ins) {
    r.duplicadas++;
    return;
  }
  r.dms++;
  try {
    await distribuir(ag.id, contato);
  } catch (e) {
    console.error("[instagram] distribuir", (e as Error).message);
  }
  if (!ag.ig_ativo) return; // IA desligada no Instagram: só registra

  // Agrupamento: quem escreve em rajada recebe UMA resposta, da última mensagem.
  await dormir((await segundos("INSTAGRAM_AGRUPAR_SEG", 8)) * 1000);
  const ultima = await queryOne<{ id: number }>(
    "SELECT id FROM mensagens WHERE agente_id = $1 AND contato = $2 AND direcao = 'in' ORDER BY id DESC LIMIT 1",
    [ag.id, contato]
  );
  if (ultima && ultima.id !== ins.id) return;
  if (await estaPausado(ag.id, contato)) return;

  // Relê o agente: pode ter sido desligado enquanto esperava.
  const atual = await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [ag.id]);
  if (!atual?.ig_ativo) return;
  await responderIA(atual, { numero: contato, nome: quem.exibir });
  await capturarEleitor(atual, contato, quem.nome, quem.usuario).catch(() => {});
}

// Eco: mensagem que saiu da conta. Se não foi o sistema, foi alguém da equipe.
async function tratarEco(ag: Agente, ev: EventoIG, r: ResumoIG) {
  const contato = PREFIXO_IG + ev.usuarioId;
  const nosso = async () =>
    !!(await queryOne("SELECT 1 FROM mensagens WHERE wa_id = $1 LIMIT 1", [ev.mid]));
  if (await nosso()) return;
  // O eco pode chegar antes de o sistema gravar o que acabou de enviar.
  await dormir((await segundos("INSTAGRAM_ESPERA_ECO_SEG", 4)) * 1000);
  if (await nosso()) return;

  r.ecos++;
  const t = ev.texto.trim().toLowerCase();
  if (t.startsWith("#pausa")) await pausar(ag.id, contato, "comando");
  else if (t.startsWith("#bot")) await retomar(ag.id, contato);
  else if (contemComando(ev.texto)) await alternar(ag.id, contato);
  else await pausar(ag.id, contato); // humano respondeu pelo app: IA dá licença
  await execute(
    `INSERT INTO mensagens (agente_id, contato, direcao, texto, wa_id, origem)
     VALUES ($1, $2, 'out', $3, $4, 'humano')
     ON CONFLICT (wa_id) WHERE wa_id IS NOT NULL DO NOTHING`,
    [ag.id, contato, ev.texto || "[mensagem enviada pelo app]", ev.mid]
  );
}

export async function processarEventosIG(body: any): Promise<ResumoIG> {
  const r: ResumoIG = { dms: 0, ecos: 0, duplicadas: 0, ignoradas: 0, comentarios: 0 };
  const { eventos, comentarios } = extrairEventosIG(body);
  r.comentarios = comentarios;
  const agentes = new Map<string, Agente | null>();
  await Promise.all(
    eventos.map(async (ev) => {
      if (!agentes.has(ev.contaId)) agentes.set(ev.contaId, await agentePorContaInstagram(ev.contaId));
      const ag = agentes.get(ev.contaId);
      if (!ag || !ag.ig_token) {
        r.ignoradas++; // conta não conectada neste sistema
        return;
      }
      try {
        if (ev.tipo === "dm") await tratarDM(ag, ev, r);
        else await tratarEco(ag, ev, r);
      } catch (e) {
        console.error("[instagram] evento", (e as Error).message);
      }
    })
  );
  return r;
}

// Recebimento direto da Meta pausado (emergência): só o repasse do n8n entra.
export const webhookDiretoPausado = () => process.env.INSTAGRAM_WEBHOOK_PAUSADO !== "0";

// Para a tela: conversas do Instagram que chegaram (monitor simples).
export async function contarConversasIG(agenteId: number): Promise<number> {
  const x = await query<{ n: number }>(
    "SELECT COUNT(DISTINCT contato)::int n FROM mensagens WHERE agente_id = $1 AND contato LIKE 'ig:%'",
    [agenteId]
  );
  return x[0]?.n ?? 0;
}
