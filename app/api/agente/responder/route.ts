import { NextRequest, NextResponse } from "next/server";
import { queryOne, Agente } from "@/lib/db";
import { conferirToken } from "@/lib/config";
import { responderIA } from "@/lib/responder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Endpoint PÚBLICO chamado pelo n8n para gerar+enviar a resposta da IA quando o
// inbound é orquestrado pelo n8n (Tarefa B). A geração de IA e o log continuam
// na plataforma (fonte única = lib/responder.ts) — o n8n só orquestra o timing.
// Protegido pelo token compartilhado (N8N_TOKEN), OBRIGATÓRIO.
//
// Corpo: { token?, agente_id, numero, nome?, wa_id? }
// A mensagem recebida já deve ter sido registrada pelo webhook antes de chamar aqui
// (o histórico é lido do banco por número na geração da resposta).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));

  const token = await conferirToken(
    "N8N_TOKEN",
    (req.headers.get("x-candpro-token") || b?.token || "").toString()
  );
  if (token !== "ok")
    return NextResponse.json(
      { erro: token === "ausente" ? "N8N_TOKEN não configurado" : "Não autorizado" },
      { status: token === "ausente" ? 503 : 401 }
    );

  const agenteId = Number(b?.agente_id);
  const numero = (b?.numero ?? "").toString();
  if (!agenteId || !numero)
    return NextResponse.json({ erro: "agente_id e numero são obrigatórios" }, { status: 400 });

  const agente = await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [agenteId]);
  if (!agente) return NextResponse.json({ erro: "Agente não encontrado" }, { status: 404 });
  if (!agente.ativo) return NextResponse.json({ ok: true, ignorado: "agente desligado" });

  const r = await responderIA(agente, {
    numero,
    nome: b?.nome ?? null,
    waId: b?.wa_id ?? null,
  });
  return NextResponse.json(r);
}
