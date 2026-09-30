import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { agentesDaSessao } from "@/lib/escopo";
import { garantirSegredo, getConfig } from "@/lib/config";
import { contaDoToken, camposAssinados, assinarMensagens } from "@/lib/instagram";
import { contarConversasIG } from "@/lib/instagramWebhook";

export const dynamic = "force-dynamic";

// Conta do Instagram de um candidato (agente). Gestão: ADMIN e COORDENACAO
// (a coordenação vinculada, só nos números dela). O token nunca volta à tela.
async function acesso(agenteId: number) {
  const s = getSessao();
  if (!s || !["ADMIN", "COORDENACAO"].includes(s.perfil)) return null;
  const esc = await agentesDaSessao(s);
  if (esc && !esc.includes(agenteId)) return null;
  return s;
}

// GET ?agente=ID -> estado da conexão (+ endereço do repasse, só para o admin)
export async function GET(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("agente"));
  const s = id ? await acesso(id) : null;
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const a = await queryOne<{
    ig_user_id: string | null;
    ig_username: string | null;
    ig_ativo: boolean;
    tem_token: boolean;
    renovado: string | null;
    expira: string | null;
    ig_token_erro: string | null;
    ig_token: string | null;
    ultimo_evento: string | null;
    ultimo_evento_em: string | null;
  }>(
    `SELECT ig_user_id, ig_username, ig_ativo, (ig_token IS NOT NULL) AS tem_token, ig_token_erro, ig_token,
            ig_ultimo_evento_em AS ultimo_evento_em,
            to_char(ig_ultimo_evento_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') AS ultimo_evento,
            to_char(ig_token_renovado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS renovado,
            to_char(ig_token_expira_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS expira
       FROM agentes WHERE id = $1`,
    [id]
  );
  if (!a) return NextResponse.json({ erro: "Número não encontrado" }, { status: 404 });
  const admin = s.perfil === "ADMIN";
  const conectado = a.tem_token && !!a.ig_user_id;
  // Diagnóstico (admin): a conta está assinada no webhook? e a última recusa,
  // se veio depois do último aviso aceito desta conta.
  let assinatura: { ok: boolean; mensagens: boolean; erro?: string } | null = null;
  let recusa: { quando: string; motivo: string } | null = null;
  if (admin && conectado && a.ig_token) {
    const c = await camposAssinados(a.ig_token);
    assinatura = { ok: c.ok, mensagens: c.campos.includes("messages"), erro: c.erro };
    try {
      const r = JSON.parse((await getConfig("INSTAGRAM_WEBHOOK_RECUSA")) || "null");
      if (r?.quando && (!a.ultimo_evento_em || new Date(r.quando) > new Date(a.ultimo_evento_em)))
        recusa = {
          quando: new Date(r.quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
          motivo: String(r.motivo || ""),
        };
    } catch {}
  }
  return NextResponse.json({
    conectado,
    usuario: a.ig_username,
    conta_id: a.ig_user_id,
    ativo: a.ig_ativo,
    conversas: await contarConversasIG(id),
    token_renovado: a.renovado,
    token_expira: a.expira,
    token_erro: a.ig_token_erro,
    ultimo_evento: a.ultimo_evento,
    assinatura,
    recusa,
    // Para o n8n repassar os eventos (token na URL): só o admin configura.
    repasse_token: admin ? await garantirSegredo("INSTAGRAM_WEBHOOK_TOKEN") : null,
    // Modo direto (sem n8n): o que se cola no app da Meta, e o que falta.
    verify_token: admin ? await garantirSegredo("INSTAGRAM_VERIFY_TOKEN") : null,
    direto: admin
      ? {
          segredo_ok: !!(await getConfig("INSTAGRAM_APP_SECRET")).trim(),
          repasse_ok: !!(await getConfig("INSTAGRAM_REPASSE_URL")).trim(),
        }
      : null,
  });
}

// POST { agente_id, acao: "conectar", token } | { acao: "ligar", ativo } | { acao: "desconectar" }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const id = Number(b.agente_id);
  if (!id || !(await acesso(id))) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  if (b.acao === "conectar") {
    const token = String(b.token || "").trim();
    if (token.length < 20) return NextResponse.json({ erro: "Cole o token de acesso do Instagram." }, { status: 400 });
    const c = await contaDoToken(token);
    if (!c.ok) return NextResponse.json({ erro: c.erro }, { status: 400 });
    const outro = await queryOne<{ candidato: string }>(
      "SELECT candidato FROM agentes WHERE ig_user_id = $1 AND id <> $2",
      [c.userId, id]
    );
    if (outro)
      return NextResponse.json({ erro: `Esta conta já está ligada a ${outro.candidato}.` }, { status: 409 });
    // Conecta DESLIGADO: a IA só responde depois que alguém ligar de propósito.
    await execute(
      `UPDATE agentes SET ig_token = $1, ig_user_id = $2, ig_username = $3, ig_ativo = false,
              ig_token_renovado_em = now(), ig_token_expira_em = NULL, ig_token_erro = NULL
        WHERE id = $4`,
      [token, c.userId, c.username || null, id]
    );
    // Assina a conta no webhook do app (sem isso a Meta não entrega o Direct).
    const sub = await assinarMensagens(token);
    return NextResponse.json({ ok: true, usuario: c.username, conta_id: c.userId, assinada: sub.ok, erro_assinatura: sub.erro });
  }
  if (b.acao === "assinar") {
    const a = await queryOne<{ ig_token: string | null }>("SELECT ig_token FROM agentes WHERE id = $1", [id]);
    if (!a?.ig_token) return NextResponse.json({ erro: "Conecte a conta antes." }, { status: 400 });
    const sub = await assinarMensagens(a.ig_token);
    if (!sub.ok) return NextResponse.json({ erro: sub.erro || "A Meta recusou a assinatura." }, { status: 502 });
    return NextResponse.json({ ok: true, campos: sub.campos });
  }
  if (b.acao === "ligar") {
    const n = await execute("UPDATE agentes SET ig_ativo = $1 WHERE id = $2 AND ig_token IS NOT NULL", [!!b.ativo, id]);
    if (!n) return NextResponse.json({ erro: "Conecte a conta antes." }, { status: 400 });
    return NextResponse.json({ ok: true, ativo: !!b.ativo });
  }
  if (b.acao === "desconectar") {
    await execute(
      `UPDATE agentes SET ig_token = NULL, ig_user_id = NULL, ig_username = NULL, ig_ativo = false,
              ig_token_renovado_em = NULL, ig_token_expira_em = NULL, ig_token_erro = NULL
        WHERE id = $1`,
      [id]
    );
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ erro: "Ação inválida" }, { status: 400 });
}
