import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { listarMetasComProgresso, type Metrica } from "@/lib/metas";

export const dynamic = "force-dynamic";

const METRICAS: Metrica[] = ["cadastros", "alcance", "mensagens", "respostas"];

function gestor() {
  const s = getSessao();
  if (!s || !["ADMIN", "COORDENACAO"].includes(s.perfil)) return null;
  return s;
}

// GET -> metas com progresso (candidato vê as globais + as dele; gestão vê todas)
export async function GET() {
  const s = getSessao();
  if (!s) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });
  const filtro = s.perfil === "CANDIDATO" ? s.nome : undefined;
  return NextResponse.json(await listarMetasComProgresso(filtro));
}

// POST -> cria uma meta (ADMIN/COORDENAÇÃO)
export async function POST(req: NextRequest) {
  const s = gestor();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json();
  const titulo = (b.titulo ?? "").toString().trim();
  const escopo = b.escopo === "candidato" ? "candidato" : "global";
  const candidato = escopo === "candidato" ? (b.candidato ?? "").toString().trim() : null;
  const metrica: Metrica = METRICAS.includes(b.metrica) ? b.metrica : "alcance";
  const alvo = Math.floor(Number(b.alvo) || 0);
  const prazo = (b.prazo ?? "").toString().trim() || null;

  if (!titulo) return NextResponse.json({ erro: "Dê um título à meta." }, { status: 400 });
  if (alvo <= 0) return NextResponse.json({ erro: "Defina um alvo maior que zero." }, { status: 400 });
  if (escopo === "candidato" && !candidato)
    return NextResponse.json({ erro: "Escolha o candidato da meta." }, { status: 400 });

  await execute(
    `INSERT INTO metas (titulo, escopo, candidato, metrica, alvo, prazo, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [titulo, escopo, candidato, metrica, alvo, prazo, String(s.uid)]
  );
  return NextResponse.json({ ok: true });
}

// DELETE ?id= -> remove a meta (ADMIN/COORDENAÇÃO)
export async function DELETE(req: NextRequest) {
  const s = gestor();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ erro: "id ausente" }, { status: 400 });
  await execute("DELETE FROM metas WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
