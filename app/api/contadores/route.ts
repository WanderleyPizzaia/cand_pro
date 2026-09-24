import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { coletarPendencias } from "@/lib/pendencias";

export const dynamic = "force-dynamic";

// GET /api/contadores -> números dos selos do menu (fila, pautas, tarefas).
// Leve e escopado: cada perfil só conta o que pode abrir.
export async function GET() {
  const s = getSessao();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  try {
    const { contadores } = await coletarPendencias(s);
    return NextResponse.json(contadores);
  } catch (e) {
    console.error("[contadores]", (e as Error).message);
    return NextResponse.json({ fila: 0, pautas: 0, tarefas: 0 });
  }
}
