import { NextResponse } from "next/server";
import { query, Agente } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { estadoInstancia } from "@/lib/evolution";

export const dynamic = "force-dynamic";

// GET /api/agentes/status -> estado de conexão (tempo real) de cada agente.
// [{ id, instancia, state }]  state: 'open' | 'connecting' | 'close' | null | 'sem-instancia'
export async function GET() {
  const s = getSessao();
  if (!s || !["ADMIN", "COORDENACAO"].includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const agentes = await query<Agente>("SELECT * FROM agentes ORDER BY id");
  const estados = await Promise.all(
    agentes.map(async (a) => {
      if (!a.instancia)
        return { id: a.id, instancia: null, state: "sem-instancia" as const };
      const r = await estadoInstancia(a.instancia, a.apikey);
      return { id: a.id, instancia: a.instancia, state: r.state };
    })
  );
  return NextResponse.json(estados);
}
