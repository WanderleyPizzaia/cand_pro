import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { agenteIdDoUsuario } from "@/lib/agenteUsuario";
import { calcular } from "@/lib/matriz";
import { estimarPosicaoPolitica } from "@/lib/ia";

export const dynamic = "force-dynamic";

async function resolver(req: NextRequest) {
  const s = getSessao();
  if (!s) return { erro: "Sem sessão", status: 401 as const };
  const gestor = ["ADMIN", "COORDENACAO", "MARKETING"].includes(s.perfil);
  if (!gestor && s.perfil !== "CANDIDATO")
    return { erro: "Acesso negado", status: 403 as const };
  const q = Number(new URL(req.url).searchParams.get("id"));
  const id = (gestor && q) || (await agenteIdDoUsuario(s.uid, s.nome));
  if (!id) return { erro: "Você ainda não tem um gabinete vinculado.", status: 404 as const };
  const a = await queryOne<{ id: number; ia_key: string | null; persona: string | null; candidato: string }>(
    "SELECT id, ia_key, persona, candidato FROM agentes WHERE id = $1",
    [id]
  );
  if (!a) return { erro: "Agente não encontrado", status: 404 as const };
  return { s, id: a.id, iaKey: a.ia_key, persona: a.persona || "", candidato: a.candidato };
}

// GET -> posição salva (ou zero) do candidato.
export async function GET(req: NextRequest) {
  const r = await resolver(req);
  if ("erro" in r) return NextResponse.json({ erro: r.erro }, { status: r.status });
  const m = await queryOne<{
    economico: number; social: number; respostas: any; origem: string; justificativa: string | null;
    atualizado_em: string;
  }>(
    `SELECT economico, social, respostas, origem, justificativa,
            to_char(atualizado_em, 'DD/MM/YYYY HH24:MI') AS atualizado_em
       FROM matriz_politica WHERE agente_id = $1`,
    [r.id]
  );
  return NextResponse.json({
    candidato: r.candidato,
    posicao: m || null,
    temPersona: !!r.persona.trim(),
  });
}

// POST { acao }
export async function POST(req: NextRequest) {
  const r = await resolver(req);
  if ("erro" in r) return NextResponse.json({ erro: r.erro }, { status: r.status });
  const b = await req.json().catch(() => ({}));
  const acao = (b.acao || "salvar").toString();

  if (acao === "calibrar") {
    const est = await estimarPosicaoPolitica(r.persona, r.iaKey);
    if (!est.ok) return NextResponse.json({ erro: est.erro || "Falha na calibragem" }, { status: 400 });
    await execute(
      `INSERT INTO matriz_politica (agente_id, economico, social, origem, justificativa, atualizado_em)
       VALUES ($1,$2,$3,'ia',$4, now())
       ON CONFLICT (agente_id) DO UPDATE SET economico=$2, social=$3, origem='ia', justificativa=$4, atualizado_em=now()`,
      [r.id, est.economico, est.social, est.justificativa || null]
    );
    return NextResponse.json({ ok: true, economico: est.economico, social: est.social, justificativa: est.justificativa, origem: "ia" });
  }

  // salvar: do questionário (respostas) ou ajuste manual (economico/social).
  const respostas = b.respostas && typeof b.respostas === "object" ? b.respostas : null;
  let economico: number;
  let social: number;
  let origem = "questionario";
  if (respostas) {
    const p = calcular(respostas as Record<string, number>);
    economico = p.economico;
    social = p.social;
  } else {
    economico = Math.max(-10, Math.min(10, Number(b.economico) || 0));
    social = Math.max(-10, Math.min(10, Number(b.social) || 0));
    origem = "manual";
  }
  await execute(
    `INSERT INTO matriz_politica (agente_id, economico, social, respostas, origem, atualizado_em)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (agente_id) DO UPDATE SET economico=$2, social=$3,
       respostas = CASE WHEN $4::jsonb <> '{}'::jsonb THEN $4::jsonb ELSE matriz_politica.respostas END,
       origem=$5, atualizado_em=now()`,
    [r.id, economico, social, JSON.stringify(respostas || {}), origem]
  );
  return NextResponse.json({ ok: true, economico, social, origem });
}
