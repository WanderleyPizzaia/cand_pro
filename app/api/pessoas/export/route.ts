import { NextRequest, NextResponse } from "next/server";
import { query, Pessoa } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { agentesDaSessao } from "@/lib/escopo";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // export de dezenas de milhares de linhas

const COLUNAS = [
  "nome",
  "categoria",
  "funcao",
  "partido",
  "cidade",
  "regiao",
  "bairro",
  "whatsapp",
  "email",
  "instagram",
  "observacao",
  "autor",
  "criado_em",
] as const;

function celula(v: any): string {
  const s = v == null ? "" : String(v);
  // Escapa para CSV: aspas duplas e envolve quando necessário
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Quem pode exportar a base. Atendente (só atendimento) fica de fora.
const PODE_EXPORTAR = ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO", "LIDER"];

// GET /api/pessoas/export -> baixa os cadastros em CSV.
// ISOLAMENTO (igual ao mapa): Líder vê só os próprios; candidato/equipe
// vinculado vê só os seus números.
export async function GET(req: NextRequest) {
  const sessao = getSessao();
  if (!sessao) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });
  if (!PODE_EXPORTAR.includes(sessao.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  // Filtros vindos da tela de Contatos: candidato (id do agente) e busca.
  const url = new URL(req.url);
  const candidato = Number(url.searchParams.get("candidato")) || 0; // id do agente
  const busca = (url.searchParams.get("q") ?? "").trim();

  // Só as colunas do CSV — NÃO puxa `foto` (base64) nem lat/lng, senão o export
  // carrega megabytes de imagem por linha e estoura o tempo da função.
  const base =
    "SELECT p.nome, p.categoria, p.funcao, p.partido, p.cidade, p.regiao, p.bairro, " +
    "p.whatsapp, p.email, p.instagram, p.observacao, " +
    "to_char(p.criado_em,'YYYY-MM-DD HH24:MI') AS criado_fmt, u.nome AS autor " +
    // CASE garante que o ::bigint só roda em valores numéricos (senão o
    // Postgres tenta converter um criado_por textual e estoura -> 500 no export).
    "FROM pessoas p LEFT JOIN usuarios u ON u.id = (CASE WHEN p.criado_por ~ '^[0-9]+$' THEN p.criado_por::bigint END) ";

  const meus = await agentesDaSessao(sessao);
  const bound = meus !== null;

  const params: any[] = [];
  const cond: string[] = [];
  if (sessao.perfil === "LIDER") {
    params.push(String(sessao.uid));
    cond.push(`p.criado_por = $${params.length}`);
  } else if (bound) {
    const ids = meus!.length ? meus! : [-1];
    cond.push(`p.agente_id IN (${ids.join(",")})`);
  }

  // Filtro por candidato (aba selecionada na tela) — respeita o escopo acima.
  if (candidato > 0) cond.push(`p.agente_id = ${candidato}`);

  // Busca por nome / cidade / whatsapp (mesma busca da tela de Contatos).
  if (busca) {
    params.push(`%${busca}%`);
    const i = params.length;
    cond.push(
      `(p.nome ILIKE $${i} OR COALESCE(p.cidade,'') ILIKE $${i} OR regexp_replace(COALESCE(p.whatsapp,''),'\\D','','g') ILIKE $${i})`
    );
  }

  const whereSql = cond.length ? "WHERE " + cond.join(" AND ") : "";
  const linhas = await query<Pessoa & { autor: string | null; criado_fmt: string }>(
    base + whereSql + " ORDER BY p.id DESC",
    params
  );

  const cabecalho = COLUNAS.join(",");
  const corpo = linhas
    .map((l: any) =>
      COLUNAS.map((c) =>
        celula(c === "criado_em" ? l.criado_fmt : l[c])
      ).join(",")
    )
    .join("\n");

  // BOM para o Excel reconhecer UTF-8
  const csv = "﻿" + cabecalho + "\n" + corpo + "\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cadastros.csv"',
    },
  });
}
