import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, Agente } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { definirConfiguracoes, definirWebhook } from "@/lib/evolution";
import { urlWebhookEvolution } from "@/lib/config";
import { sincronizarContatosAgente } from "@/lib/sincronizarContatos";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // sync de milhares de contatos pode demorar

function podeGerir() {
  const s = getSessao();
  if (!s || !["ADMIN", "COORDENACAO"].includes(s.perfil)) return null;
  return s;
}

// GET -> lista os agentes Evolution sincronizáveis (para o botão "todos" no client)
export async function GET() {
  if (!podeGerir()) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const agentes = await query<{ id: number; candidato: string }>(
    `SELECT id, candidato FROM agentes
      WHERE provedor <> 'meta' AND instancia IS NOT NULL AND instancia <> ''
      ORDER BY candidato`
  );
  return NextResponse.json({ agentes });
}

// POST { agente_id } -> tuna a instância (settings + webhook) e sincroniza os contatos.
export async function POST(req: NextRequest) {
  if (!podeGerir()) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const agenteId = Number(b.agente_id);
  if (!agenteId) return NextResponse.json({ erro: "agente_id ausente" }, { status: 400 });

  const agente = await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [agenteId]);
  if (!agente) return NextResponse.json({ erro: "Agente não encontrado" }, { status: 404 });
  if (agente.provedor === "meta" || !agente.instancia)
    return NextResponse.json(
      { erro: "Este número não é Evolution (a Meta não expõe a lista de contatos)." },
      { status: 400 }
    );

  // Tuning (capacidade máxima): garante settings ideais + webhook apontando pra cá.
  const origin = new URL(req.url).origin;
  await definirConfiguracoes(agente.instancia, agente.apikey).catch(() => {});
  await definirWebhook(agente.instancia, await urlWebhookEvolution(origin), agente.apikey).catch(() => {});

  const resultado = await sincronizarContatosAgente(agente);
  if (!resultado.ok)
    return NextResponse.json({ erro: resultado.erro || "Falha na sincronização.", ...resultado }, { status: 502 });

  return NextResponse.json(resultado);
}
