import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { pausar } from "@/lib/atendimento";

export const dynamic = "force-dynamic";

const PERMITIDOS = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];

// Lista de atendentes elegíveis (equipe do gabinete, escopado ao candidato).
async function atendentes(s: any) {
  const bound = s.perfil !== "ADMIN" && !!s.escopoCandidato;
  const where = bound
    ? "candidato_escopo = $1 AND"
    : "";
  const params = bound ? [s.escopoCandidato] : [];
  return query<{ id: number; nome: string; perfil: string }>(
    `SELECT id, nome, perfil FROM usuarios
      WHERE ${where} ativo = 1 AND perfil IN ('COORDENACAO','MARKETING','ATENDENTE','LIDER')
      ORDER BY nome`,
    params
  );
}

// GET ?agente_id=&contato=  -> { atual, atendentes }
export async function GET(req: NextRequest) {
  const s = getSessao();
  if (!s || !PERMITIDOS.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const u = new URL(req.url);
  const agenteId = Number(u.searchParams.get("agente_id"));
  const contato = (u.searchParams.get("contato") || "").trim();
  const atual =
    agenteId && contato
      ? await queryOne<{ usuario_id: number; usuario_nome: string }>(
          "SELECT usuario_id, usuario_nome FROM atendimento_atribuicao WHERE agente_id = $1 AND contato = $2",
          [agenteId, contato]
        )
      : null;
  return NextResponse.json({ atual: atual || null, atendentes: await atendentes(s) });
}

// POST { agente_id, contato, usuario_id }  (usuario_id 0/null = remover atribuição)
export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !PERMITIDOS.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const agenteId = Number(b.agente_id);
  const contato = (b.contato || "").toString().trim();
  const usuarioId = Number(b.usuario_id) || 0;
  if (!agenteId || !contato)
    return NextResponse.json({ erro: "Dados incompletos" }, { status: 400 });

  if (!usuarioId) {
    await execute("DELETE FROM atendimento_atribuicao WHERE agente_id = $1 AND contato = $2", [agenteId, contato]);
    return NextResponse.json({ ok: true, atual: null });
  }

  const alvo = await queryOne<{ id: number; nome: string }>(
    "SELECT id, nome FROM usuarios WHERE id = $1 AND ativo = 1",
    [usuarioId]
  );
  if (!alvo) return NextResponse.json({ erro: "Atendente inválido" }, { status: 400 });

  await execute(
    `INSERT INTO atendimento_atribuicao (agente_id, contato, usuario_id, usuario_nome, atribuido_por)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (agente_id, contato)
     DO UPDATE SET usuario_id = $3, usuario_nome = $4, atribuido_por = $5, atribuido_em = now()`,
    [agenteId, contato, alvo.id, alvo.nome, s.uid]
  );
  // Transferir para humano = pausa a IA neste contato (a atendente assume).
  // Atribuição é decisão da equipe: a pausa não expira sozinha.
  await pausar(agenteId, contato, "comando");
  return NextResponse.json({ ok: true, atual: { usuario_id: alvo.id, usuario_nome: alvo.nome } });
}
