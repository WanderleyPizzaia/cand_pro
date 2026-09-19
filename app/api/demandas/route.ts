import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { agentesDaSessao } from "@/lib/escopo";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "MARKETING", "COORDENACAO"];
const PRIORIDADE = ["Baixa", "Média", "Alta"];

function autorizado() {
  const s = getSessao();
  if (!s || !PERFIS_OK.includes(s.perfil)) return null;
  return s;
}

// GET /api/demandas?status=&q=  -> lista (com responsável e eleitor)
export async function GET(req: NextRequest) {
  const s = autorizado();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = (searchParams.get("status") ?? "").trim();
  const q = (searchParams.get("q") ?? "").trim();
  // Isolamento: candidato/equipe vinculado vê demandas do eleitor do seu terreno
  // (ou que ele mesmo criou).
  const meus = await agentesDaSessao(s);
  const escCand = meus
    ? `AND (e.agente_id IN (${(meus.length ? meus : [-1]).join(",")}) OR d.criado_por = '${s.uid}')`
    : "";

  const linhas = await query(
    `SELECT d.*,
        to_char(d.criado_em, 'YYYY-MM-DD HH24:MI') AS criado_fmt,
        to_char(d.prazo, 'YYYY-MM-DD') AS prazo_fmt,
        r.nome AS responsavel_nome,
        e.nome AS eleitor_nome
       FROM demandas d
       LEFT JOIN usuarios r ON r.id = d.responsavel_id
       LEFT JOIN pessoas  e ON e.id = d.eleitor_id
      WHERE ($1 = '' OR d.status = $1)
        AND ($2 = '' OR d.titulo ILIKE '%' || $2 || '%' OR d.descricao ILIKE '%' || $2 || '%')
        ${escCand}
      ORDER BY d.id DESC`,
    [status, q]
  );
  return NextResponse.json(linhas);
}

// POST /api/demandas -> cria
export async function POST(req: NextRequest) {
  const s = autorizado();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json();
  const titulo = (b.titulo ?? "").toString().trim();
  if (!titulo)
    return NextResponse.json({ erro: "O título é obrigatório." }, { status: 400 });

  // Status livre (colunas do kanban são customizáveis).
  const status = (b.status ?? "").toString().trim() || "Aberta";
  const prioridade = PRIORIDADE.includes(b.prioridade) ? b.prioridade : "Média";
  const num = (v: any) => (v === "" || v == null ? null : Number(v));
  const txt = (v: any) => {
    const t = (v ?? "").toString().trim();
    return t || null;
  };

  const novo = await queryOne<{ id: number }>(
    `INSERT INTO demandas
       (titulo, descricao, categoria, status, prioridade, eleitor_id, responsavel_id, cidade, bairro, prazo, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      titulo,
      txt(b.descricao),
      txt(b.categoria),
      status,
      prioridade,
      num(b.eleitor_id),
      num(b.responsavel_id),
      txt(b.cidade),
      txt(b.bairro),
      txt(b.prazo),
      String(s.uid),
    ]
  );
  return NextResponse.json({ id: novo?.id }, { status: 201 });
}

// PATCH /api/demandas -> atualiza campos (status, responsável, etc.)
export async function PATCH(req: NextRequest) {
  if (!autorizado())
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json();
  const id = Number(b.id);
  if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });

  const numericos = new Set(["eleitor_id", "responsavel_id"]);
  const editaveis = [
    "titulo",
    "descricao",
    "categoria",
    "status",
    "prioridade",
    "eleitor_id",
    "responsavel_id",
    "cidade",
    "bairro",
    "prazo",
  ];

  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;
  for (const campo of editaveis) {
    if (!(campo in b)) continue;
    if (campo === "status" && !(b.status ?? "").toString().trim()) continue;
    if (campo === "prioridade" && !PRIORIDADE.includes(b.prioridade)) continue;
    if (campo === "titulo" && !(b.titulo ?? "").toString().trim()) continue;
    let v: any = b[campo];
    if (numericos.has(campo)) v = v === "" || v == null ? null : Number(v);
    else v = (v ?? "").toString().trim() || null;
    sets.push(`${campo} = $${i++}`);
    vals.push(v);
  }
  if (sets.length === 0)
    return NextResponse.json({ erro: "Nada para atualizar." }, { status: 400 });

  sets.push(`atualizado_em = now()`);
  vals.push(id);
  await execute(`UPDATE demandas SET ${sets.join(", ")} WHERE id = $${i}`, vals);
  return NextResponse.json({ ok: true });
}

// DELETE /api/demandas?id=  -> remove
export async function DELETE(req: NextRequest) {
  if (!autorizado())
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });
  await execute("DELETE FROM demandas WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
