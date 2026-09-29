// ============================================================
// Instagram (API do Instagram com login do Instagram: graph.instagram.com).
// A conversa do Direct vira contato = 'ig:<IGSID>' em `mensagens`, para
// nunca ser confundida com telefone (nem receber WhatsApp por engano).
// ============================================================
import crypto from "crypto";
import { query, queryOne, execute, Agente } from "./db";
import { getConfig, setConfig, garantirSegredo } from "./config";

export const PREFIXO_IG = "ig:";
const VERSAO = "v23.0";
// O Instagram recusa mensagem acima de 1000 bytes (UTF-8).
const LIMITE_BYTES = 990;

export const ehInstagram = (contato: string | null | undefined) => (contato || "").startsWith(PREFIXO_IG);
export const igsidDe = (contato: string) => contato.slice(PREFIXO_IG.length);

// Base configurável (INSTAGRAM_GRAPH_URL) só para apontar a um ambiente de teste.
async function base(): Promise<string> {
  return ((await getConfig("INSTAGRAM_GRAPH_URL")) || "https://graph.instagram.com").replace(/\/+$/, "");
}

type Resultado = { ok: boolean; waId?: string | null; erro?: string };

async function chamar(token: string, caminho: string, corpo?: unknown): Promise<{ ok: boolean; d: any; status: number }> {
  try {
    const r = await fetch(`${await base()}/${VERSAO}/${caminho}`, {
      method: corpo ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok && !d?.error, d, status: r.status };
  } catch (e: any) {
    return { ok: false, d: { error: { message: e?.message || "falha de rede" } }, status: 0 };
  }
}

// Erro da Meta em português para a conversa (o mais comum: fora das 24 h).
function traduzirErro(d: any, status: number): string {
  const e = d?.error || {};
  const msg = String(e.message || `HTTP ${status}`);
  if (e.code === 10 || /outside of allowed window|24/i.test(msg))
    return "Instagram: fora da janela de 24 h (a pessoa precisa mandar mensagem de novo)";
  if (e.code === 190) return "Instagram: token expirado ou revogado (reconecte a conta)";
  return `Instagram: ${msg.slice(0, 180)}`;
}

// Quebra em partes de até ~1000 bytes, preferindo fim de frase/linha.
export function partirPorBytes(texto: string): string[] {
  const bytes = (s: string) => Buffer.byteLength(s, "utf8");
  const partes: string[] = [];
  let resto = texto.trim();
  while (resto && bytes(resto) > LIMITE_BYTES) {
    let corte = 0;
    let usado = 0;
    for (const ch of resto) {
      const b = bytes(ch);
      if (usado + b > LIMITE_BYTES) break;
      usado += b;
      corte += ch.length;
    }
    const janela = resto.slice(0, corte);
    const quebra = Math.max(janela.lastIndexOf("\n"), janela.lastIndexOf(". "), janela.lastIndexOf("! "), janela.lastIndexOf("? "));
    const fim = quebra > corte * 0.5 ? quebra + 1 : corte;
    partes.push(resto.slice(0, fim).trim());
    resto = resto.slice(fim).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}

export async function enviarTextoInstagram(ag: Agente, contato: string, texto: string): Promise<Resultado> {
  if (!ag.ig_token) return { ok: false, erro: "Instagram não conectado neste número" };
  let ultimo: string | null = null;
  for (const parte of partirPorBytes(texto)) {
    const r = await chamar(ag.ig_token, "me/messages", { recipient: { id: igsidDe(contato) }, message: { text: parte } });
    if (!r.ok) return { ok: false, erro: traduzirErro(r.d, r.status) };
    ultimo = r.d?.message_id ?? null;
  }
  return { ok: true, waId: ultimo };
}

// Imagem por URL pública (o Instagram baixa de lá; não aceita envio do arquivo).
export async function enviarImagemInstagram(ag: Agente, contato: string, url: string): Promise<Resultado> {
  if (!ag.ig_token) return { ok: false, erro: "Instagram não conectado neste número" };
  const r = await chamar(ag.ig_token, "me/messages", {
    recipient: { id: igsidDe(contato) },
    message: { attachment: { type: "image", payload: { url } } },
  });
  return r.ok ? { ok: true, waId: r.d?.message_id ?? null } : { ok: false, erro: traduzirErro(r.d, r.status) };
}

// "Digitando…" (best-effort: se a conta não permitir, segue sem).
export async function digitandoInstagram(ag: Agente, contato: string): Promise<void> {
  if (!ag.ig_token) return;
  await chamar(ag.ig_token, "me/messages", { recipient: { id: igsidDe(contato) }, sender_action: "typing_on" });
}

// Nome e @ de quem escreveu (só funciona para quem mandou mensagem à conta).
export async function perfilInstagram(ag: Agente, igsid: string): Promise<{ nome: string | null; username: string | null }> {
  if (!ag.ig_token) return { nome: null, username: null };
  const r = await chamar(ag.ig_token, `${encodeURIComponent(igsid)}?fields=name,username`);
  if (!r.ok) return { nome: null, username: null };
  return { nome: r.d?.name || null, username: r.d?.username || null };
}

// Dados da conta a partir do token (ao conectar). user_id é o id que chega no
// webhook (entry.id); o id "app-scoped" não serve para rotear.
export async function contaDoToken(token: string): Promise<{ ok: boolean; userId?: string; username?: string; erro?: string }> {
  const r = await chamar(token, "me?fields=user_id,username");
  if (!r.ok) return { ok: false, erro: traduzirErro(r.d, r.status) };
  const userId = String(r.d?.user_id || "");
  if (!userId) return { ok: false, erro: "O token não devolveu a conta do Instagram" };
  return { ok: true, userId, username: r.d?.username || "" };
}

// ---------- URL pública assinada para a galeria (o Instagram baixa por URL) ----------
export async function assinaturaMidia(id: number): Promise<string> {
  const segredo = await garantirSegredo("MIDIA_TOKEN");
  return crypto.createHmac("sha256", segredo).update(`galeria:${id}`).digest("hex").slice(0, 32);
}
export async function urlPublicaGaleria(origin: string, id: number): Promise<string> {
  return `${origin.replace(/\/+$/, "")}/api/midia/${id}?s=${await assinaturaMidia(id)}`;
}

// Origem pública do site (gravada pelo webhook: é o endereço que a Meta/n8n usa).
export async function origemPublica(): Promise<string> {
  const salva = (await getConfig("URL_PUBLICA")).trim();
  if (salva) return salva;
  const v = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return v ? `https://${v}` : "";
}

export async function agentePorContaInstagram(igUserId: string): Promise<Agente | null> {
  if (!igUserId) return null;
  return (await queryOne<Agente>("SELECT * FROM agentes WHERE ig_user_id = $1 LIMIT 1", [igUserId])) ?? null;
}

// ---------- Renovação do token (vale 60 dias; renovar exige token com mais de 24 h) ----------
export async function renovarToken(token: string): Promise<{ ok: boolean; token?: string; expiraEm?: string | null; erro?: string }> {
  try {
    const r = await fetch(
      `${await base()}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`
    );
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d?.access_token) return { ok: false, erro: traduzirErro(d, r.status) };
    const expira = Number(d.expires_in) > 0 ? new Date(Date.now() + Number(d.expires_in) * 1000).toISOString() : null;
    return { ok: true, token: String(d.access_token), expiraEm: expira };
  } catch (e: any) {
    return { ok: false, erro: `Instagram: ${e?.message || "falha de rede"}` };
  }
}

const DIAS_ENTRE_RENOVACOES = 7;

// Renova os tokens com mais de 7 dias. Roda a partir do agendador (chamado a
// cada minuto pelo cron-job.org), mas trabalha no máximo uma vez por hora.
// Falha fica em ig_token_erro e aparece no painel do Instagram do número.
export async function renovarTokensInstagram(forcar = false): Promise<{ renovados: number; falhas: number }> {
  const res = { renovados: 0, falhas: 0 };
  if (!forcar) {
    const ultima = await getConfig("INSTAGRAM_RENOVACAO_ULTIMA");
    if (ultima && Date.now() - new Date(ultima).getTime() < 3600e3) return res;
  }
  await setConfig("INSTAGRAM_RENOVACAO_ULTIMA", new Date().toISOString());
  const lista = await query<{ id: number; ig_token: string }>(
    `SELECT id, ig_token FROM agentes
      WHERE ig_token IS NOT NULL
        AND (ig_token_renovado_em IS NULL OR ig_token_renovado_em < now() - interval '${DIAS_ENTRE_RENOVACOES} days')`
  );
  for (const a of lista) {
    const r = await renovarToken(a.ig_token);
    if (r.ok) {
      await execute(
        "UPDATE agentes SET ig_token = $1, ig_token_renovado_em = now(), ig_token_expira_em = $2, ig_token_erro = NULL WHERE id = $3",
        [r.token, r.expiraEm ?? null, a.id]
      );
      res.renovados++;
    } else {
      await execute("UPDATE agentes SET ig_token_erro = $1 WHERE id = $2", [r.erro, a.id]);
      res.falhas++;
    }
  }
  return res;
}
