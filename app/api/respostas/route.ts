import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import { getSessao } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Respostas rápidas (canned) do atendimento. Compartilhadas pela equipe.
// GET  -> lista (quem atende pode ler)
// POST -> cria { atalho, texto } (só gestor/candidato)
// DELETE ?id -> remove (só gestor/candidato)
const LER = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO", "ATENDENTE"];
const GERIR = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];

export async function GET() {
  const s = getSessao();
  if (!s || !LER.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const rows = await query(
    "SELECT id, atalho, texto FROM respostas_rapidas ORDER BY atalho"
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !GERIR.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  // Atalho: minúsculas, sem espaços nem barra inicial.
  const atalho = String(b.atalho || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  const texto = String(b.texto || "").trim();
  if (!atalho || !texto)
    return NextResponse.json({ erro: "Preencha o atalho e o texto." }, { status: 400 });
  const row = (await query<{ id: number }>(
    `INSERT INTO respostas_rapidas (atalho, texto) VALUES ($1, $2) RETURNING id`,
    [atalho, texto]
  ))[0];
  return NextResponse.json({ ok: true, id: row?.id, atalho, texto });
}

export async function DELETE(req: NextRequest) {
  const s = getSessao();
  if (!s || !GERIR.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ erro: "id inválido" }, { status: 400 });
  await execute("DELETE FROM respostas_rapidas WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
