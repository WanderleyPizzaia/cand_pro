import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { importarCSV } from "@/lib/listas";
import { agentesDaSessao } from "@/lib/escopo";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // importação grande (até 5000 linhas)

const PERMITIDOS = ["ADMIN", "COORDENACAO", "CANDIDATO"];

// POST /api/listas/importar?lista=ID  (corpo = texto do CSV)
export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !PERMITIDOS.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const listaId = Number(new URL(req.url).searchParams.get("lista"));
  if (!listaId) return NextResponse.json({ erro: "Lista não informada." }, { status: 400 });

  const lista = await queryOne<{ agente_id: number }>(
    "SELECT agente_id FROM listas WHERE id = $1",
    [listaId]
  );
  if (!lista) return NextResponse.json({ erro: "Lista não encontrada." }, { status: 404 });

  // Escopo: candidato/equipe só importa em listas do próprio número.
  const meus = await agentesDaSessao(s);
  if (meus && !meus.includes(lista.agente_id))
    return NextResponse.json({ erro: "Sem acesso a esta lista." }, { status: 403 });

  const texto = await req.text();
  if (!texto.trim()) return NextResponse.json({ erro: "Arquivo vazio." }, { status: 400 });

  try {
    const resumo = await importarCSV(listaId, lista.agente_id, texto, String(s.uid));
    return NextResponse.json(resumo);
  } catch (e: any) {
    return NextResponse.json({ erro: e.message || "Falha na importação." }, { status: 400 });
  }
}
