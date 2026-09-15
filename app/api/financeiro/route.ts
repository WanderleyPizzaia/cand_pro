import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { query, execute, queryOne } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { agentesDoCandidato } from "@/lib/metas";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO"];
const PODE_LANCAR = ["ADMIN", "MARKETING", "COORDENACAO"];
const TAXA_PADRAO = 0.3; // taxa de serviço/agência DECLARADA (transparente)

async function garantirTabela() {
  await execute(
    `CREATE TABLE IF NOT EXISTS financeiro (
       id SERIAL PRIMARY KEY,
       escopo TEXT NOT NULL,
       tipo TEXT NOT NULL,            -- 'aporte' | 'custo'
       valor NUMERIC(12,2) NOT NULL,
       descricao TEXT,
       criado_por TEXT,
       criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );
}

function escopoDe(s: NonNullable<ReturnType<typeof getSessao>>) {
  return s.escopoCandidato || (s.perfil === "CANDIDATO" ? s.nome : "GLOBAL");
}

export async function GET() {
  const s = getSessao();
  if (!s || !PERFIS_OK.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  await garantirTabela();
  const escopo = escopoDe(s);

  const lanc = await query<{ id: number; tipo: string; valor: string; descricao: string | null; criado_em: string }>(
    "SELECT id, tipo, valor, descricao, criado_em FROM financeiro WHERE escopo = $1 ORDER BY criado_em DESC LIMIT 200",
    [escopo]
  );

  const aportes = lanc.filter((l) => l.tipo === "aporte").reduce((a, l) => a + Number(l.valor), 0);
  const custosManuais = lanc.filter((l) => l.tipo === "custo").reduce((a, l) => a + Number(l.valor), 0);

  // Disparos reais: mensagens de campanha enviadas pelos agentes do gabinete.
  let disparos = 0;
  try {
    const ids = await agentesDoCandidato(escopo, s.uid);
    if (ids && ids.length) {
      const r = await queryOne<{ c: string }>(
        "SELECT COUNT(*) c FROM mensagens WHERE agente_id = ANY($1) AND origem = 'campanha' AND direcao = 'out'",
        [ids]
      );
      disparos = Number(r?.c ?? 0);
    }
  } catch { /* sem agentes: zero */ }

  const custoUnit = Number((await getConfig("CUSTO_DISPARO")) || 0.08); // R$/mensagem
  const taxaPct = Number((await getConfig("TAXA_SERVICO")) || TAXA_PADRAO);
  const custoDisparos = +(disparos * custoUnit).toFixed(2);
  const taxaServico = +(aportes * taxaPct).toFixed(2);
  const saldo = +(aportes - taxaServico - custosManuais - custoDisparos).toFixed(2);

  return NextResponse.json({
    escopo,
    resumo: {
      investido: +aportes.toFixed(2),
      taxaPct,
      taxaServico,
      disparos,
      custoUnit,
      custoDisparos,
      custosManuais: +custosManuais.toFixed(2),
      saldo,
    },
    lancamentos: lanc.map((l) => ({ ...l, valor: Number(l.valor) })),
    podeLancar: PODE_LANCAR.includes(s.perfil),
  });
}

export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !PODE_LANCAR.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  await garantirTabela();
  const b = await req.json().catch(() => ({}));
  const tipo = b.tipo === "custo" ? "custo" : "aporte";
  const valor = Math.round(Number(b.valor) * 100) / 100;
  if (!valor || valor <= 0) return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });
  await execute(
    "INSERT INTO financeiro (escopo, tipo, valor, descricao, criado_por) VALUES ($1,$2,$3,$4,$5)",
    [escopoDe(s), tipo, valor, (b.descricao || "").toString().slice(0, 200) || null, s.nome]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const s = getSessao();
  if (!s || !PODE_LANCAR.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ erro: "id" }, { status: 400 });
  await execute("DELETE FROM financeiro WHERE id = $1 AND escopo = $2", [id, escopoDe(s)]);
  return NextResponse.json({ ok: true });
}
