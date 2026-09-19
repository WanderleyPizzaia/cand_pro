import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { conferirToken } from "@/lib/config";
import { tokenConfere } from "@/lib/seguranca";
import { puxarTodos } from "@/lib/puxarEvolution";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Busca ativa das mensagens na Evolution (plano B do webhook).
// Quem pode chamar:
//  - usuário logado com acesso ao WhatsApp (a tela de Conversas chama sozinha);
//  - chamada externa com o WEBHOOK_TOKEN (header x-candpro-token ou ?token=);
//  - cron da Vercel (Authorization: Bearer CRON_SECRET).
const PERFIS_OK = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO", "ATENDENTE"];

async function autorizado(req: NextRequest): Promise<boolean> {
  const s = getSessao();
  if (s && PERFIS_OK.includes(s.perfil)) return true;

  const cron = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (cron && tokenConfere(cron, process.env.CRON_SECRET)) return true;

  const t =
    req.headers.get("x-candpro-token") ||
    new URL(req.url).searchParams.get("token") ||
    "";
  return (await conferirToken("WEBHOOK_TOKEN", t)) === "ok";
}

async function executar(req: NextRequest) {
  if (!(await autorizado(req)))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  // ?dry=1 importa sem acionar a IA (diagnóstico, não envia nada a ninguém).
  const dry = ["1", "true"].includes(
    (new URL(req.url).searchParams.get("dry") || "").toLowerCase()
  );
  const resultados = await puxarTodos({ responder: !dry });
  const novas = resultados.reduce((s, r) => s + r.novas, 0);
  const respondidas = resultados.reduce((s, r) => s + r.respondidas, 0);
  return NextResponse.json({ ok: true, novas, respondidas, resultados });
}

export async function POST(req: NextRequest) {
  return executar(req);
}

// O cron da Vercel chama por GET.
export async function GET(req: NextRequest) {
  return executar(req);
}
