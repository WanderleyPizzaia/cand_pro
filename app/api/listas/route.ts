import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { listarComContadores } from "@/lib/listas";

export const dynamic = "force-dynamic";

const PERMITIDOS = ["ADMIN", "COORDENACAO", "CANDIDATO"];

function sessaoOk() {
  const s = getSessao();
  return s && PERMITIDOS.includes(s.perfil) ? s : null;
}
// Números que a sessão pode operar (candidato/equipe escopado); null = todos.
function escopo(s: ReturnType<typeof getSessao>): number[] | null {
  if (!s) return [-1];
  if (s.escopoAgentes) return s.escopoAgentes.length ? s.escopoAgentes : [-1];
  return null;
}

// GET -> listas (com contadores), escopadas por número.
export async function GET() {
  const s = sessaoOk();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const listas = await listarComContadores(escopo(s));
  return NextResponse.json(listas);
}

// POST -> cria uma lista { nome, descricao, agente_id }
export async function POST(req: NextRequest) {
  const s = sessaoOk();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const nome = (b.nome ?? "").toString().trim();
  const descricao = (b.descricao ?? "").toString().trim() || null;
  const agenteId = Number(b.agente_id);
  if (!nome) return NextResponse.json({ erro: "Dê um nome à lista." }, { status: 400 });
  if (!agenteId) return NextResponse.json({ erro: "Escolha o número (candidato)." }, { status: 400 });

  const esc = escopo(s);
  if (esc && !esc.includes(agenteId))
    return NextResponse.json({ erro: "Sem acesso a este número." }, { status: 403 });

  const nova = await queryOne<{ id: number }>(
    `INSERT INTO listas (nome, descricao, agente_id, criado_por)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [nome, descricao, agenteId, String(s.uid)]
  );
  return NextResponse.json({ id: nova?.id }, { status: 201 });
}

// DELETE /api/listas?id= -> apaga a lista (os contatos permanecem).
export async function DELETE(req: NextRequest) {
  const s = sessaoOk();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  const esc = escopo(s);
  const lista = await queryOne<{ agente_id: number }>(
    "SELECT agente_id FROM listas WHERE id = $1",
    [id]
  );
  if (!lista) return NextResponse.json({ erro: "Lista não encontrada." }, { status: 404 });
  if (esc && !esc.includes(lista.agente_id))
    return NextResponse.json({ erro: "Sem acesso a esta lista." }, { status: 403 });

  await execute("DELETE FROM listas WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
