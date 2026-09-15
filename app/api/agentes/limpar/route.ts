import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute, Agente } from "@/lib/db";
import { getSessao } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/agentes/limpar { id }
// Apaga TODAS as mensagens registradas do agente (por instância) no banco.
// Não mexe no WhatsApp do contato - só limpa o histórico exibido no sistema.
export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !["ADMIN", "COORDENACAO"].includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });

  const agente = await queryOne<Agente>("SELECT id FROM agentes WHERE id = $1", [id]);
  if (!agente)
    return NextResponse.json({ erro: "Agente não encontrado" }, { status: 404 });

  const apagadas = await execute("DELETE FROM mensagens WHERE agente_id = $1", [id]);
  return NextResponse.json({ ok: true, apagadas });
}
