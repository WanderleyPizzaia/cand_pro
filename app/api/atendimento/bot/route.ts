import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { getConfig, setConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

// Liga/desliga e texto do bot de 1ª resposta. Só gestor/candidato.
const GESTOR = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];
const PADRAO = "Que prazer falar contigo, obrigado por nos responder!";

export async function GET() {
  const s = getSessao();
  if (!s || !GESTOR.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const [ativo, texto] = await Promise.all([
    getConfig("BOT_SAUDACAO_ATIVA"),
    getConfig("BOT_SAUDACAO_TEXTO"),
  ]);
  return NextResponse.json({ ativo: ativo === "1", texto: texto || PADRAO });
}

export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !GESTOR.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (typeof b.ativo === "boolean") await setConfig("BOT_SAUDACAO_ATIVA", b.ativo ? "1" : "0");
  if (typeof b.texto === "string") {
    const t = b.texto.trim();
    if (t) await setConfig("BOT_SAUDACAO_TEXTO", t);
  }
  return NextResponse.json({ ok: true });
}
