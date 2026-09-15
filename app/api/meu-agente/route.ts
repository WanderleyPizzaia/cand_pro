import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute, Agente, quotaEfetiva, disparosUsadosHoje } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { agenteIdDoUsuario } from "@/lib/agenteUsuario";

export const dynamic = "force-dynamic";

// Resolve o agente do usuário logado (candidato) — ou, se gestor, permite ?id=.
async function meuAgente(req: NextRequest) {
  const s = getSessao();
  if (!s) return { erro: "Sem sessão", status: 401 as const };
  const gestor = ["ADMIN", "COORDENACAO"].includes(s.perfil);
  if (!gestor && s.perfil !== "CANDIDATO")
    return { erro: "Acesso negado", status: 403 as const };

  let id: number | null = null;
  if (gestor) {
    const q = Number(new URL(req.url).searchParams.get("id"));
    id = q || (await agenteIdDoUsuario(s.uid, s.nome));
  } else {
    id = await agenteIdDoUsuario(s.uid, s.nome);
  }
  if (!id) return { erro: "Você ainda não tem um agente vinculado.", status: 404 as const };
  return { s, id };
}

// GET -> dados públicos do agente do candidato + métricas (sem segredos).
export async function GET(req: NextRequest) {
  const r = await meuAgente(req);
  if ("erro" in r) return NextResponse.json({ erro: r.erro }, { status: r.status });

  const a = await queryOne<
    Pick<Agente, "id" | "candidato" | "provedor" | "ativo" | "persona" | "instancia" | "config" | "quota_diaria"> & {
      tem_ia: boolean;
      tem_meta_token: boolean;
    }
  >(
    `SELECT id, candidato, provedor, ativo, persona, instancia, config, quota_diaria,
            (ia_key IS NOT NULL) AS tem_ia,
            (meta_token IS NOT NULL) AS tem_meta_token
       FROM agentes WHERE id = $1`,
    [r.id]
  );
  if (!a) return NextResponse.json({ erro: "Agente não encontrado" }, { status: 404 });

  const total =
    (await queryOne<{ c: number }>(
      "SELECT COUNT(*) c FROM mensagens WHERE agente_id = $1 AND direcao IN ('in','out')",
      [a.id]
    ))?.c ?? 0;
  const hoje =
    (await queryOne<{ c: number }>(
      `SELECT COUNT(*) c FROM mensagens
        WHERE agente_id = $1 AND direcao = 'in'
          AND (criado_em AT TIME ZONE 'America/Sao_Paulo')::date
            = (now() AT TIME ZONE 'America/Sao_Paulo')::date`,
      [a.id]
    ))?.c ?? 0;
  const contatos =
    (await queryOne<{ c: number }>(
      "SELECT COUNT(*) c FROM pessoas WHERE agente_id = $1",
      [a.id]
    ))?.c ?? 0;

  const quota = quotaEfetiva(a as any);
  const disparosHoje = await disparosUsadosHoje(a.id);
  return NextResponse.json({
    ...a,
    totalMensagens: total,
    recebidasHoje: hoje,
    contatos,
    quotaEfetiva: quota,
    disparosHoje,
  });
}

// POST -> candidato ajusta SÓ persona e ativo do próprio agente.
export async function POST(req: NextRequest) {
  const r = await meuAgente(req);
  if ("erro" in r) return NextResponse.json({ erro: r.erro }, { status: r.status });

  const b = await req.json().catch(() => ({}));
  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;
  if (typeof b.persona === "string") {
    sets.push(`persona = $${i++}`);
    vals.push(b.persona.trim() || null);
  }
  if ("ativo" in b) {
    sets.push(`ativo = $${i++}`);
    vals.push(b.ativo ? 1 : 0);
  }
  // Config variável (ferramentas/atendimento). Merge no JSONB existente.
  if (b.config && typeof b.config === "object") {
    sets.push(`config = COALESCE(config,'{}'::jsonb) || $${i++}::jsonb`);
    vals.push(JSON.stringify(b.config));
  }
  if (!sets.length)
    return NextResponse.json({ erro: "Nada para atualizar." }, { status: 400 });

  vals.push(r.id);
  await execute(`UPDATE agentes SET ${sets.join(", ")} WHERE id = $${i}`, vals);
  return NextResponse.json({ ok: true });
}
