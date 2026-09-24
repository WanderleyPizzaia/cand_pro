import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { agentesDaSessao, filtroPessoas, resolverEscopoAtual } from "@/lib/escopo";

export const dynamic = "force-dynamic";

const PERMITIDOS = ["ADMIN", "COORDENACAO", "CANDIDATO"];

// POST /api/listas/membros { lista_id, pessoa_ids: number[] }
// Adiciona contatos selecionados na tela de Contatos a uma lista de envio.
// Só entram contatos que a sessão enxerga, e só em lista de número do escopo.
export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !PERMITIDOS.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const listaId = Number(b.lista_id);
  const ids: number[] = Array.isArray(b.pessoa_ids)
    ? b.pessoa_ids.map((x: unknown) => Number(x)).filter((x: number) => Number.isInteger(x) && x > 0)
    : [];
  if (!listaId) return NextResponse.json({ erro: "Escolha a lista." }, { status: 400 });
  if (!ids.length) return NextResponse.json({ erro: "Nenhum contato selecionado." }, { status: 400 });
  if (ids.length > 2000)
    return NextResponse.json({ erro: "Selecione até 2.000 contatos por vez." }, { status: 400 });

  const lista = await queryOne<{ agente_id: number }>(
    "SELECT agente_id FROM listas WHERE id = $1",
    [listaId]
  );
  if (!lista) return NextResponse.json({ erro: "Lista não encontrada." }, { status: 404 });
  const meus = await agentesDaSessao(s);
  if (meus && !meus.includes(lista.agente_id))
    return NextResponse.json({ erro: "Sem acesso a esta lista." }, { status: 403 });

  const esc = await resolverEscopoAtual(s);
  const inseridos = await query<{ pessoa_id: number }>(
    `INSERT INTO lista_membros (lista_id, pessoa_id)
     SELECT $1, p.id FROM pessoas p
      WHERE p.id = ANY($2::bigint[]) ${filtroPessoas(esc, "p")}
     ON CONFLICT DO NOTHING
     RETURNING pessoa_id`,
    [listaId, ids]
  );
  return NextResponse.json({
    adicionados: inseridos.length,
    ignorados: ids.length - inseridos.length,
  });
}
