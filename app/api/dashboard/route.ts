import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { coletarDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

// GET /api/dashboard -> indicadores ao vivo (usado pelo polling do Dashboard)
export async function GET() {
  const sessao = getSessao();
  if (!sessao) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });
  return NextResponse.json(await coletarDashboard(sessao));
}
