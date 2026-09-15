import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { setConfig, statusConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

function exigirAdmin() {
  const s = getSessao();
  return s && s.perfil === "ADMIN" ? s : null;
}

// GET -> status (sem expor os valores das chaves)
export async function GET() {
  if (!exigirAdmin())
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  return NextResponse.json(await statusConfig());
}

// POST -> grava chaves (só preenche o que vier não-vazio)
export async function POST(req: NextRequest) {
  if (!exigirAdmin())
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json();
  for (const chave of [
    "EVOLUTION_URL",
    "EVOLUTION_APIKEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_CALENDAR_SRC",
    // n8n: URL do webhook de disparo em massa + token compartilhado (webhook + callback).
    "N8N_DISPARO_URL",
    "N8N_TOKEN",
    // n8n: URL do webhook que orquestra a IA (inbound). Vazia = IA responde direto (padrão).
    "N8N_AGENTE_URL",
    // Meta: App Secret que valida a assinatura do webhook oficial (obrigatório).
    "META_APP_SECRET",
  ]) {
    if (typeof b[chave] === "string" && b[chave].trim()) {
      await setConfig(chave, b[chave].trim());
    }
  }
  return NextResponse.json({ ok: true, status: await statusConfig() });
}
