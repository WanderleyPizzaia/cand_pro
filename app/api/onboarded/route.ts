import { NextResponse } from "next/server";
import { execute } from "@/lib/db";
import { getSessao } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/onboarded -> marca o usuário logado como já apresentado
// (os próximos logins pulam o splash de boas-vindas e vão direto ao painel).
export async function POST() {
  const s = getSessao();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  await execute("UPDATE usuarios SET onboarded = true WHERE id = $1", [s.uid]);
  return NextResponse.json({ ok: true });
}
