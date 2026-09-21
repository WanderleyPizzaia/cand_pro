import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { listarInstancias } from "@/lib/evolution";

export const dynamic = "force-dynamic";

// GET -> o que existe no servidor Evolution x o que está cadastrado aqui.
// Diagnóstico para quando um número "não recebe": instância renomeada,
// apagada, ou uma segunda instância segurando o mesmo WhatsApp.
export async function GET() {
  const s = getSessao();
  if (!s || !["ADMIN", "COORDENACAO"].includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const r = await listarInstancias();
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 });

  const agentes = await query<{ id: number; candidato: string; instancia: string | null }>(
    "SELECT id, candidato, instancia FROM agentes ORDER BY id"
  );
  const porNome = new Map(agentes.map((a) => [a.instancia || "", a]));

  return NextResponse.json({
    // Instâncias do servidor, dizendo a qual agente cada uma pertence.
    servidor: r.instancias.map((i) => ({
      ...i,
      agente: porNome.get(i.nome)?.candidato ?? null,
    })),
    // Agentes cujo nome de instância não existe no servidor.
    orfaos: agentes
      .filter((a) => a.instancia && !r.instancias.some((i) => i.nome === a.instancia))
      .map((a) => ({ id: a.id, candidato: a.candidato, instancia: a.instancia })),
  });
}
