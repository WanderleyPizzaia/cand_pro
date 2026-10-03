import { NextRequest, NextResponse } from "next/server";
import { query, Pessoa } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { agentesDaSessao } from "@/lib/escopo";
import { ETIQUETAS, ehEtiqueta, FILTRO_SEM, sqlSemEtiqueta } from "@/lib/etiquetas";
import { cteAtendimentoAtivo } from "@/lib/atendimentoCrm";

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
  "etiquetas",
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
  const categoria = (url.searchParams.get("categoria") ?? "").trim();
  const cidade = (url.searchParams.get("cidade") ?? "").trim();
  const etiqueta = (url.searchParams.get("etiqueta") ?? "").trim();
  // Com/sem atendente (mesmo filtro da tela; o Líder não tem).
  const atdQ = (url.searchParams.get("atendimento") ?? "").trim();
  const atendimento = sessao.perfil !== "LIDER" && ["livre", "com", "meus"].includes(atdQ) ? atdQ : "";

  // Só as colunas do CSV — NÃO puxa `foto` (base64) nem lat/lng, senão o export
  // carrega megabytes de imagem por linha e estoura o tempo da função.
  const base =
    "SELECT p.nome, p.categoria, p.funcao, p.partido, p.cidade, p.regiao, p.bairro, " +
    "p.whatsapp, p.email, p.instagram, p.observacao, p.etiquetas, " +
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
  // Filtros de categoria e cidade da tela de Contatos.
  if (categoria) {
    params.push(categoria);
    cond.push(`p.categoria = $${params.length}`);
  }
  if (cidade) {
    params.push(cidade);
    cond.push(`p.cidade = $${params.length}`);
  }
  if (etiqueta === FILTRO_SEM) {
    cond.push(sqlSemEtiqueta("p.etiquetas"));
  } else if (ehEtiqueta(etiqueta)) {
    params.push(etiqueta);
    cond.push(`p.etiquetas @> ARRAY[$${params.length}]::text[]`);
  }
  if (atendimento === "livre") cond.push("ap.pessoa_id IS NULL");
  if (atendimento === "com") cond.push("ap.pessoa_id IS NOT NULL");
  if (atendimento === "meus") cond.push(`ap.atendente_id = ${Number(sessao.uid)}`);
  const withAtend = atendimento ? `WITH ${cteAtendimentoAtivo(bound ? meus! : null)} ` : "";
  const joinAtend = atendimento ? "LEFT JOIN atrib_p ap ON ap.pessoa_id = p.id " : "";

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
    withAtend + base + joinAtend + whereSql + " ORDER BY p.id DESC",
    params
  );

  const cabecalho = COLUNAS.join(",");
  const corpo = linhas
    .map((l: any) =>
      COLUNAS.map((c) =>
        celula(
          c === "criado_em"
            ? l.criado_fmt
            : c === "etiquetas"
            ? ETIQUETAS.filter((e) => (l.etiquetas || []).includes(e.v)).map((e) => e.rotulo).join(" / ")
            : l[c]
        )
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
