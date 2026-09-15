import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { estaPausado, pausar, retomar } from "@/lib/atendimento";

export const dynamic = "force-dynamic";

const PERMITIDOS = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];

// GET ?agente_id=&contato= -> { pausado } | POST { agente_id, contato, acao }
export async function GET(req: NextRequest) {
  const s = getSessao();
  if (!s || !PERMITIDOS.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const u = new URL(req.url);
  const agenteId = Number(u.searchParams.get("agente_id"));
  const contato = (u.searchParams.get("contato") || "").trim();
  if (!agenteId || !contato) return NextResponse.json({ pausado: false });
  return NextResponse.json({ pausado: await estaPausado(agenteId, contato) });
}

export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !PERMITIDOS.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const agenteId = Number(b.agente_id);
  const contato = (b.contato || "").toString().trim();
  const acao = (b.acao || "alternar").toString();
  if (!agenteId || !contato)
    return NextResponse.json({ erro: "Dados incompletos" }, { status: 400 });

  if (acao === "pausar") await pausar(agenteId, contato);
  else if (acao === "retomar") await retomar(agenteId, contato);
  else {
    if (await estaPausado(agenteId, contato)) await retomar(agenteId, contato);
    else await pausar(agenteId, contato);
  }
  return NextResponse.json({ pausado: await estaPausado(agenteId, contato) });
}
