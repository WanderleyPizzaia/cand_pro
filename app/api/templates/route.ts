import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute, Agente, Template, TemplateVar } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { normalizarNumero } from "@/lib/evolution";
import {
  criarTemplateMeta,
  excluirTemplateMeta,
  montarComponents,
  listarTemplatesMeta,
  enviarTemplateMeta,
} from "@/lib/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ADMIN e CANDIDATO acessam templates. CANDIDATO fica restrito aos próprios
// números (escopoAgentes). MARKETING/COORDENAÇÃO seguem sem acesso aqui.
function autorizado() {
  const s = getSessao();
  return s && (s.perfil === "ADMIN" || s.perfil === "CANDIDATO") ? s : null;
}
// O usuário pode operar templates deste agente? ADMIN: sempre. CANDIDATO: só
// se o agente estiver no escopo dele.
function podeAgente(s: NonNullable<ReturnType<typeof getSessao>>, agenteId: number): boolean {
  if (s.perfil === "ADMIN") return true;
  return (s.escopoAgentes || []).includes(agenteId);
}

function mapStatus(metaStatus: string): string {
  const s = (metaStatus || "").toUpperCase();
  if (s === "APPROVED") return "APROVADO";
  if (s === "REJECTED") return "REJEITADO";
  return "PENDENTE"; // PENDING, IN_APPEAL, etc.
}

async function agenteMeta(id: number): Promise<Agente | null> {
  const a = await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [id]);
  return a && a.provedor === "meta" ? a : null;
}

// GET ?agente=<id> -> lista local + sincroniza status com a Meta.
export async function GET(req: NextRequest) {
  const s = autorizado();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const agenteId = Number(new URL(req.url).searchParams.get("agente"));
  if (!agenteId) return NextResponse.json([]);
  if (!podeAgente(s, agenteId))
    return NextResponse.json({ erro: "Sem acesso a este número." }, { status: 403 });

  const a = await agenteMeta(agenteId);
  if (!a) return NextResponse.json({ erro: "Agente Meta não encontrado" }, { status: 404 });

  // Sincroniza status: busca na Meta e casa por nome.
  const r = await listarTemplatesMeta(a.meta_waba_id || "", a.meta_token || "");
  if (r.ok && r.templates) {
    for (const t of r.templates) {
      const status = mapStatus(t.status);
      // Meta pode reclassificar a categoria (UTILITY <-> MARKETING). COALESCE
      // mantém a local quando a Meta não devolve o campo.
      const categoria = t.categoria ? String(t.categoria).toUpperCase() : null;
      await execute(
        "UPDATE templates SET status = $1, motivo_rejeicao = $2, categoria = COALESCE($3, categoria) WHERE agente_id = $4 AND nome = $5",
        [status, status === "REJEITADO" ? (t.motivo || null) : null, categoria, agenteId, t.nome]
      );
    }
  }

  const rows = await query<Template>(
    "SELECT * FROM templates WHERE agente_id = $1 ORDER BY criado_em DESC",
    [agenteId]
  );
  return NextResponse.json(rows);
}

// POST -> cria template. POST ?teste=1 -> envia teste.
export async function POST(req: NextRequest) {
  const sessao = autorizado();
  if (!sessao) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const teste = new URL(req.url).searchParams.get("teste");
  const b = await req.json().catch(() => ({}));

  if (teste) {
    const t = await queryOne<Template>("SELECT * FROM templates WHERE id = $1", [Number(b.id)]);
    if (!t) return NextResponse.json({ erro: "Template não encontrado" }, { status: 404 });
    if (!podeAgente(sessao, t.agente_id))
      return NextResponse.json({ erro: "Sem acesso a este número." }, { status: 403 });
    if (t.status !== "APROVADO")
      return NextResponse.json({ erro: "Só é possível testar template APROVADO" }, { status: 400 });
    const a = await agenteMeta(t.agente_id);
    if (!a) return NextResponse.json({ erro: "Agente Meta não encontrado" }, { status: 404 });
    const numero = normalizarNumero(String(b.numero || ""));
    if (!numero) return NextResponse.json({ erro: "Número inválido" }, { status: 400 });
    const vars = (Array.isArray(t.variaveis) ? (t.variaveis as TemplateVar[]) : [])
      .sort((x, y) => x.pos - y.pos)
      .map((v) => v.exemplo || "");
    const env = await enviarTemplateMeta(a.meta_phone_id || "", a.meta_token || "", numero, t.nome, t.idioma, vars);
    if (!env.ok) return NextResponse.json({ erro: env.erro }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  // Criação
  const agenteId = Number(b.agente_id);
  if (!podeAgente(sessao, agenteId))
    return NextResponse.json({ erro: "Sem acesso a este número." }, { status: 403 });
  const a = await agenteMeta(agenteId);
  if (!a) return NextResponse.json({ erro: "Agente Meta não encontrado" }, { status: 404 });

  const nome = String(b.nome || "").trim().toLowerCase().replace(/\s+/g, "_");
  const categoria = String(b.categoria || "").toUpperCase();
  const idioma = String(b.idioma || "pt_BR");
  const corpo = String(b.corpo || "").trim();
  const variaveis: TemplateVar[] = Array.isArray(b.variaveis) ? b.variaveis : [];

  // Validações
  if (!/^[a-z0-9_]{1,512}$/.test(nome))
    return NextResponse.json({ erro: "Nome inválido (use minúsculas, números e _)" }, { status: 400 });
  if (!["MARKETING", "UTILITY"].includes(categoria))
    return NextResponse.json({ erro: "Categoria inválida" }, { status: 400 });
  if (!corpo) return NextResponse.json({ erro: "Corpo obrigatório" }, { status: 400 });
  const usadas = new Set((corpo.match(/\{\{(\d+)\}\}/g) || []).map((m) => Number(m.replace(/\D/g, ""))));
  for (const pos of usadas) {
    const v = variaveis.find((x) => x.pos === pos);
    if (!v || !v.exemplo?.trim())
      return NextResponse.json({ erro: `Variável {{${pos}}} precisa de exemplo` }, { status: 400 });
  }

  const components = montarComponents({
    header: b.header || null,
    corpo,
    variaveis,
    rodape: b.rodape || null,
    botoes: Array.isArray(b.botoes) ? b.botoes : [],
  });

  const criado = await criarTemplateMeta(a.meta_waba_id || "", a.meta_token || "", {
    name: nome,
    category: categoria,
    language: idioma,
    components,
  });
  if (!criado.ok) return NextResponse.json({ erro: criado.erro }, { status: 502 });

  const row = await queryOne<{ id: number }>(
    `INSERT INTO templates (agente_id, nome, categoria, categoria_original, idioma, componentes, variaveis, status, meta_id, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10)
     RETURNING id`,
    [
      agenteId,
      nome,
      categoria,
      categoria, // categoria_original: o que foi enviado; o sync pode mudar `categoria`
      idioma,
      JSON.stringify(components),
      JSON.stringify(variaveis),
      mapStatus(criado.status || "PENDING"),
      criado.metaId,
      sessao.nome || null,
    ]
  );
  return NextResponse.json({ ok: true, id: row?.id });
}

// DELETE ?id=<id> -> apaga na Meta e local.
export async function DELETE(req: NextRequest) {
  const s = autorizado();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  const t = await queryOne<Template>("SELECT * FROM templates WHERE id = $1", [id]);
  if (!t) return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
  if (!podeAgente(s, t.agente_id))
    return NextResponse.json({ erro: "Sem acesso a este número." }, { status: 403 });
  const a = await agenteMeta(t.agente_id);
  if (a) await excluirTemplateMeta(a.meta_waba_id || "", a.meta_token || "", t.nome);
  await execute("DELETE FROM templates WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
