import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { query, execute } from "@/lib/db";
import { getConfig, setConfig, conferirToken, garantirSegredo } from "@/lib/config";
import { processarEventosIG } from "@/lib/instagramWebhook";

export const dynamic = "force-dynamic";
// Agrupa ~8 s + IA + envio: roda depois da resposta (waitUntil), dentro deste teto.
export const maxDuration = 60;

// GET: verificação da Meta (quando o webhook do app apontar direto para cá).
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const esperado = await garantirSegredo("INSTAGRAM_VERIFY_TOKEN");
  if (u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === esperado)
    return new NextResponse(u.searchParams.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain" } });
  return new NextResponse("Forbidden", { status: 403 });
}

// Quem pode mandar eventos:
//  - a Meta direto: assinatura X-Hub-Signature-256 com o segredo do app do
//    Instagram (INSTAGRAM_APP_SECRET, em Configurações);
//  - o n8n repassando a conta de teste: ?token=INSTAGRAM_WEBHOOK_TOKEN.
async function origemDoPedido(
  req: NextRequest,
  raw: string
): Promise<{ origem: "meta" | "n8n" | null; motivo?: string }> {
  const segredo = (await getConfig("INSTAGRAM_APP_SECRET")).trim();
  const sig = req.headers.get("x-hub-signature-256") || "";
  if (segredo && sig) {
    const esperado = "sha256=" + crypto.createHmac("sha256", segredo).update(raw).digest("hex");
    if (sig.length === esperado.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado)))
      return { origem: "meta" };
  }
  const t = req.headers.get("x-candpro-token") || new URL(req.url).searchParams.get("token") || "";
  if (t && (await conferirToken("INSTAGRAM_WEBHOOK_TOKEN", t)) === "ok") return { origem: "n8n" };
  // Motivo em português para o painel (a Meta não mostra nada a ninguém).
  const motivo = sig
    ? segredo
      ? "a assinatura da Meta não confere: a Chave secreta do app do Instagram em Configurações está errada (não é a chave de Configurações do app → Básico)"
      : "falta a Chave secreta do app do Instagram em Configurações"
    : "pedido sem assinatura da Meta nem token do n8n";
  return { origem: null, motivo };
}

// Repassa ao n8n o que é de conta que NÃO está conectada aqui (migração conta a
// conta: com o webhook do app apontando para o sistema, o resto segue no n8n).
// Corpo inteiro vai como chegou, com a assinatura original; parcial vai sem.
async function repassarAoN8n(url: string, corpo: string, assinatura: string | null): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Candpro-Repasse": "1",
        ...(assinatura ? { "X-Hub-Signature-256": assinatura } : {}),
      },
      body: corpo,
      signal: ctrl.signal,
    });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const pedido = await origemDoPedido(req, raw);
  const origemPedido = pedido.origem;
  if (!origemPedido) {
    // Guarda a última recusa para o painel do Instagram explicar o que houve.
    await setConfig("INSTAGRAM_WEBHOOK_RECUSA", JSON.stringify({ quando: new Date().toISOString(), motivo: pedido.motivo }));
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  // O n8n pode repassar o item inteiro ({ headers, body, query }) ou só o corpo.
  const embrulhado = body?.object !== "instagram" && body?.body?.object === "instagram";
  if (embrulhado) body = body.body;

  // Endereço público (é o que a Meta/n8n usa): a galeria monta o link da imagem com ele.
  const origem = new URL(req.url).origin;
  if ((await getConfig("URL_PUBLICA")) !== origem) await setConfig("URL_PUBLICA", origem);

  // Separa as contas conectadas aqui das que continuam no n8n.
  const entradas: any[] = Array.isArray(body?.entry) ? body.entry : [];
  const ids = Array.from(new Set(entradas.map((e) => String(e?.id || ""))));
  const conectadas = new Set(
    (
      await query<{ ig_user_id: string }>(
        "SELECT ig_user_id FROM agentes WHERE ig_user_id = ANY($1::text[]) AND ig_token IS NOT NULL",
        [ids]
      )
    ).map((a) => a.ig_user_id)
  );
  const minhas = entradas.filter((e) => conectadas.has(String(e?.id || "")));
  // Diagnóstico: a Meta está entregando para estas contas.
  if (conectadas.size)
    await execute("UPDATE agentes SET ig_ultimo_evento_em = now() WHERE ig_user_id = ANY($1::text[])", [Array.from(conectadas)]);
  const outras = entradas.filter((e) => !conectadas.has(String(e?.id || "")));
  // Diagnóstico geral: o último aviso da Meta aceito, de qualquer conta (o botão
  // "Testar" do painel da Meta manda a conta 0). Separa "a Meta não chama o
  // sistema" de "chama, mas não para esta conta".
  if (origemPedido === "meta")
    await setConfig("INSTAGRAM_WEBHOOK_ULTIMO", JSON.stringify({ quando: new Date().toISOString(), contas: ids.slice(0, 5) }));

  // Só repassa o que veio da Meta (o que veio do n8n já é dele: repassar de
  // volta faria laço) e nunca o que já é um repasse.
  const urlRepasse = (await getConfig("INSTAGRAM_REPASSE_URL")).trim();
  let repasseFalhou = false;
  if (outras.length && urlRepasse && origemPedido === "meta" && !req.headers.get("x-candpro-repasse")) {
    const inteiro = outras.length === entradas.length && !embrulhado;
    const corpo = inteiro ? raw : JSON.stringify({ ...body, entry: outras });
    repasseFalhou = !(await repassarAoN8n(urlRepasse, corpo, inteiro ? req.headers.get("x-hub-signature-256") : null));
    if (repasseFalhou) console.error("[instagram webhook] repasse ao n8n falhou");
  }

  // Responde logo e trabalha em seguida (a Meta reenvia se demorar).
  if (minhas.length)
    waitUntil(
      processarEventosIG({ ...body, entry: minhas }).catch((e) =>
        console.error("[instagram webhook]", (e as Error).message)
      )
    );
  // Repasse falhou: pede à Meta para reenviar (o que é daqui é descartado
  // pelo mid na segunda vez, então nada duplica).
  if (repasseFalhou) return NextResponse.json({ erro: "repasse ao n8n falhou" }, { status: 502 });
  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}
