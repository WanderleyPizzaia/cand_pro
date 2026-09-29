import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
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
//  - o n8n repassando a conta de teste: ?token=INSTAGRAM_WEBHOOK_TOKEN;
//  - a Meta direto: assinatura X-Hub-Signature-256 com o segredo do app do
//    Instagram (INSTAGRAM_APP_SECRET, em Configurações).
async function autorizado(req: NextRequest, raw: string): Promise<boolean> {
  const t = req.headers.get("x-candpro-token") || new URL(req.url).searchParams.get("token") || "";
  if (t && (await conferirToken("INSTAGRAM_WEBHOOK_TOKEN", t)) === "ok") return true;
  const segredo = (await getConfig("INSTAGRAM_APP_SECRET")).trim();
  const sig = req.headers.get("x-hub-signature-256") || "";
  if (!segredo || !sig) return false;
  const esperado = "sha256=" + crypto.createHmac("sha256", segredo).update(raw).digest("hex");
  return sig.length === esperado.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado));
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!(await autorizado(req, raw))) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  // O n8n pode repassar o item inteiro ({ headers, body, query }) ou só o corpo.
  if (body?.object !== "instagram" && body?.body?.object === "instagram") body = body.body;

  // Endereço público (é o que a Meta/n8n usa): a galeria monta o link da imagem com ele.
  const origem = new URL(req.url).origin;
  if ((await getConfig("URL_PUBLICA")) !== origem) await setConfig("URL_PUBLICA", origem);

  // Responde na hora (a Meta reenvia se demorar) e trabalha em seguida.
  waitUntil(
    processarEventosIG(body).catch((e) => console.error("[instagram webhook]", (e as Error).message))
  );
  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}
