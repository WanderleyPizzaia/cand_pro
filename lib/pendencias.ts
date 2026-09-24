import type { Sessao } from "./auth";
import { query, queryOne } from "./db";
import { agentesDaSessao } from "./escopo";

// ============================================================
// "Precisa de você agora": o que está esperando alguém da equipe.
// Tudo sai de dados que o sistema já tem (fila do Atendimento, status do
// número, prazo das tarefas, pautas sem triagem) e respeita o escopo da
// sessão: cada perfil só vê o que pode abrir.
// ============================================================

export type Pendencia = {
  chave: "fila" | "parados" | "tarefas" | "pautas";
  tom: "erro" | "atencao" | "info";
  titulo: string;
  detalhe: string;
  href: string;
  acao: string;
  n: number;
};

export type Contadores = {
  fila: number;
  pautas: number;
  tarefas: number;
};

const ATENDE = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO", "ATENDENTE"];
const GESTAO = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];
const TAREFAS = ["ADMIN", "MARKETING", "COORDENACAO"];
const AGENTES = ["ADMIN", "COORDENACAO", "CANDIDATO"];

// Status de tarefa que já saiu do caminho (as colunas do quadro são livres).
const FECHADA = "(status ~* '(conclu|cancel|resolv|feit|finaliz|arquiv)')";

function plural(n: number, um: string, varios: string) {
  return n === 1 ? um : varios;
}

function espera(desde: string | null): string {
  if (!desde) return "";
  const min = Math.max(0, Math.round((Date.now() - new Date(desde).getTime()) / 60000));
  if (min < 1) return "chegou agora";
  if (min < 60) return `a mais antiga espera há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `a mais antiga espera há ${h} h`;
  return `a mais antiga espera há ${Math.floor(h / 24)} dia(s)`;
}

// Escopo por número, igual ao do Atendimento: null = todos (gestor sem vínculo).
async function escopoNumeros(s: Sessao): Promise<number[] | null> {
  const ids = await agentesDaSessao(s);
  if (ids) return ids.length ? ids : [-1];
  if (s.perfil === "CANDIDATO") return [-1];
  return null;
}

const em = (ids: number[] | null, col: string) => (ids ? ` AND ${col} IN (${ids.join(",")})` : "");

export async function coletarPendencias(
  s: Sessao
): Promise<{ itens: Pendencia[]; contadores: Contadores }> {
  const itens: Pendencia[] = [];
  const contadores: Contadores = { fila: 0, pautas: 0, tarefas: 0 };
  if (s.perfil === "LIDER") return { itens, contadores };

  const ids = await escopoNumeros(s);

  // 1. Conversas esperando na fila do Atendimento.
  if (ATENDE.includes(s.perfil)) {
    const f = await queryOne<{ n: number; desde: string | null }>(
      `SELECT COUNT(*)::int n, MIN(fila_desde) desde
         FROM atendimentos WHERE status = 'fila'${em(ids, "agente_id")}`
    );
    contadores.fila = f?.n ?? 0;
    if (contadores.fila > 0) {
      itens.push({
        chave: "fila",
        tom: "erro",
        n: contadores.fila,
        titulo: `${contadores.fila} ${plural(contadores.fila, "conversa na fila", "conversas na fila")}`,
        detalhe: espera(f?.desde ?? null),
        href: "/atendimento?view=fila",
        acao: "Abrir fila",
      });
    }
  }

  // 2. Números que não estão respondendo (desligados ou sem instância).
  if (AGENTES.includes(s.perfil)) {
    const parados = await query<{ candidato: string }>(
      `SELECT candidato FROM agentes
        WHERE demo = false
          AND NOT (ativo = 1 AND instancia IS NOT NULL AND instancia <> '')
          ${em(ids, "id")}
        ORDER BY candidato`
    );
    if (parados.length > 0) {
      const nomes = parados.slice(0, 2).map((p) => p.candidato).join(", ");
      const resto = parados.length > 2 ? ` e mais ${parados.length - 2}` : "";
      itens.push({
        chave: "parados",
        tom: "atencao",
        n: parados.length,
        titulo: `${parados.length} ${plural(parados.length, "número parado", "números parados")}`,
        detalhe: `${nomes}${resto} · agente desligado ou sem conexão`,
        href: s.perfil === "CANDIDATO" ? "/meu-agente" : "/agentes",
        acao: "Ver números",
      });
    }
  }

  // 3. Tarefas atrasadas ou vencendo hoje.
  if (TAREFAS.includes(s.perfil)) {
    const t = await queryOne<{ atrasadas: number; hoje: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE prazo < (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int atrasadas,
         COUNT(*) FILTER (WHERE prazo = (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int hoje
         FROM demandas
        WHERE prazo IS NOT NULL AND NOT ${FECHADA}`
    );
    const atrasadas = t?.atrasadas ?? 0;
    const hoje = t?.hoje ?? 0;
    contadores.tarefas = atrasadas + hoje;
    if (contadores.tarefas > 0) {
      itens.push({
        chave: "tarefas",
        tom: atrasadas > 0 ? "atencao" : "info",
        n: contadores.tarefas,
        titulo:
          atrasadas > 0
            ? `${atrasadas} ${plural(atrasadas, "tarefa atrasada", "tarefas atrasadas")}`
            : `${hoje} ${plural(hoje, "tarefa vence hoje", "tarefas vencem hoje")}`,
        detalhe:
          atrasadas > 0 && hoje > 0
            ? `e ${hoje} ${plural(hoje, "vence", "vencem")} hoje`
            : atrasadas > 0
            ? "o prazo já passou"
            : "prazo final é hoje",
        href: "/tarefas",
        acao: "Ver tarefas",
      });
    }
  }

  // 4. Pautas que chegaram e ninguém triou.
  if (GESTAO.includes(s.perfil)) {
    const p = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int n FROM pautas WHERE status = 'nova'${em(ids, "agente_id")}`
    );
    contadores.pautas = p?.n ?? 0;
    if (contadores.pautas > 0) {
      itens.push({
        chave: "pautas",
        tom: "info",
        n: contadores.pautas,
        titulo: `${contadores.pautas} ${plural(contadores.pautas, "pauta nova", "pautas novas")}`,
        detalhe: "chegaram e ainda não foram triadas",
        href: "/pautas",
        acao: "Triar",
      });
    }
  }

  return { itens, contadores };
}
