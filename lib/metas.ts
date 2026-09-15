import { query, queryOne } from "./db";

// ===== Metas de captação (por candidato ou globais) =====
// Progresso calculado AO VIVO sobre dados reais. As métricas foram escolhidas
// para serem verdadeiras com o modelo atual (a base de contatos é compartilhada;
// o que é separável por candidato é o que passa pelo número dele).

export type Metrica = "cadastros" | "alcance" | "mensagens" | "respostas";

export type Meta = {
  id: number;
  titulo: string;
  escopo: "global" | "candidato";
  candidato: string | null;
  metrica: Metrica;
  alvo: number;
  prazo: string | null;
  criado_em: string;
};

export type MetaProgresso = Meta & {
  atual: number;
  pct: number; // 0..100 (limitado)
  restante: number;
};

export const METRICA_ROTULO: Record<Metrica, string> = {
  cadastros: "Cadastros na base",
  alcance: "Contatos alcançados (WhatsApp)",
  mensagens: "Mensagens enviadas",
  respostas: "Contatos que responderam",
};

// Agentes (números) que pertencem a um candidato — por vínculo explícito
// (usuario_id) ou pelo primeiro nome, que é como o restante do sistema resolve.
export async function agentesDoCandidato(
  candidato: string,
  uid?: number
): Promise<number[]> {
  const primeiro = (candidato || "").trim().split(" ")[0];
  const rows = await query<{ id: number }>(
    `SELECT id FROM agentes
      WHERE ($1::bigint IS NOT NULL AND usuario_id = $1)
         OR ($2 <> '' AND candidato ILIKE $2 || '%')`,
    [uid ?? null, primeiro]
  );
  return rows.map((r) => r.id);
}

// Calcula o valor atual de uma métrica para um conjunto de agentes (ou global).
export async function valorMetrica(
  metrica: Metrica,
  agenteIds: number[] | null // null = global (todos os agentes)
): Promise<number> {
  const escopoMsg =
    agenteIds && agenteIds.length
      ? `agente_id IN (${agenteIds.join(",")})`
      : agenteIds && agenteIds.length === 0
      ? "false" // candidato sem agentes → zero
      : "true";

  if (metrica === "cadastros") {
    if (agenteIds && agenteIds.length) {
      const r = await queryOne<{ c: number }>(
        `SELECT COUNT(*) c FROM pessoas WHERE agente_id IN (${agenteIds.join(",")})`
      );
      return r?.c ?? 0;
    }
    if (agenteIds && agenteIds.length === 0) return 0;
    const r = await queryOne<{ c: number }>(`SELECT COUNT(*) c FROM pessoas`);
    return r?.c ?? 0;
  }

  if (metrica === "mensagens") {
    const r = await queryOne<{ c: number }>(
      `SELECT COUNT(*) c FROM mensagens WHERE direcao = 'out' AND ${escopoMsg}`
    );
    return r?.c ?? 0;
  }
  if (metrica === "respostas") {
    const r = await queryOne<{ c: number }>(
      `SELECT COUNT(DISTINCT contato) c FROM mensagens WHERE direcao = 'in' AND ${escopoMsg}`
    );
    return r?.c ?? 0;
  }
  // alcance (default): contatos distintos que trocaram mensagem com o(s) número(s).
  const r = await queryOne<{ c: number }>(
    `SELECT COUNT(DISTINCT contato) c FROM mensagens
      WHERE contato IS NOT NULL AND contato <> '' AND ${escopoMsg}`
  );
  return r?.c ?? 0;
}

// Lista metas (todas, ou só as de um candidato) já com o progresso calculado.
export async function listarMetasComProgresso(
  filtroCandidato?: string
): Promise<MetaProgresso[]> {
  const metas = filtroCandidato
    ? await query<Meta>(
        `SELECT * FROM metas WHERE escopo = 'global' OR candidato ILIKE $1 || '%' ORDER BY id DESC`,
        [(filtroCandidato || "").split(" ")[0]]
      )
    : await query<Meta>(`SELECT * FROM metas ORDER BY escopo, id DESC`);

  const out: MetaProgresso[] = [];
  for (const m of metas) {
    const ids =
      m.escopo === "candidato" && m.candidato
        ? await agentesDoCandidato(m.candidato)
        : null;
    const atual = await valorMetrica(m.metrica, ids);
    const pct = m.alvo > 0 ? Math.min(100, Math.round((atual / m.alvo) * 100)) : 0;
    out.push({ ...m, atual, pct, restante: Math.max(0, m.alvo - atual) });
  }
  return out;
}
