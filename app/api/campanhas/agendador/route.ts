import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { conferirToken } from "@/lib/config";
import { tokenConfere } from "@/lib/seguranca";
import { rodarAgendador } from "@/lib/agendador";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Envia os disparos agendados que venceram. Quem chama:
//  - o cron-job.org, a cada minuto, com ?token=AGENDADOR_TOKEN (a URL completa
//    aparece para o admin na tela de Disparos);
//  - cron da Vercel (Authorization: Bearer CRON_SECRET);
//  - admin logado (teste manual).
// Cada chamada trabalha ~20 s e responde antes dos 30 s de limite do cron-job.org.
async function autorizado(req: NextRequest): Promise<boolean> {
  if (getSessao()?.perfil === "ADMIN") return true;
  const cron = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (cron && tokenConfere(cron, process.env.CRON_SECRET)) return true;
  const t = req.headers.get("x-candpro-token") || new URL(req.url).searchParams.get("token") || "";
  return (await conferirToken("AGENDADOR_TOKEN", t)) === "ok";
}

async function executar(req: NextRequest) {
  if (!(await autorizado(req))) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, ...(await rodarAgendador()) });
  } catch (e: any) {
    console.error("[agendador]", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "falha" }, { status: 500 });
  }
}

export const GET = executar;
export const POST = executar;
