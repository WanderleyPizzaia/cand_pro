import type { Sessao } from "./auth";

// ============================================================
// Escopo de dados por sessão — fonte única do isolamento por candidato.
// ADMIN vê tudo (global). Candidato/equipe veem só os agentes do escopo.
// LIDER vê só o que cadastrou. Não-admin sem vínculo mantém o global (não quebra
// coordenações existentes que ainda não foram vinculadas).
// ============================================================

export type Escopo = {
  agenteIds: number[] | null; // null = global (sem filtro por agente)
  ehLider: boolean;
  ehGlobal: boolean;
  uid: number;
};

export function resolverEscopo(s: Sessao): Escopo {
  const uid = s.uid;
  if (s.perfil === "ADMIN") return { agenteIds: null, ehLider: false, ehGlobal: true, uid };
  if (s.perfil === "LIDER") return { agenteIds: null, ehLider: true, ehGlobal: false, uid };
  if (s.escopoAgentes)
    return {
      agenteIds: s.escopoAgentes.length ? s.escopoAgentes : [-1], // vínculo sem agente => nada
      ehLider: false,
      ehGlobal: false,
      uid,
    };
  return { agenteIds: null, ehLider: false, ehGlobal: true, uid };
}

// Fragmento SQL para filtrar `pessoas` (padrão: alias 'p'; use '' para sem alias).
export function filtroPessoas(e: Escopo, alias = "p"): string {
  const a = alias ? `${alias}.` : "";
  if (e.ehLider) return `AND ${a}criado_por = '${e.uid}'`;
  if (e.agenteIds) return `AND ${a}agente_id IN (${e.agenteIds.join(",")})`;
  return "";
}

// Fragmento SQL para filtrar `mensagens` (padrão: alias 'm').
export function filtroMensagens(e: Escopo, alias = "m"): string {
  const a = alias ? `${alias}.` : "";
  if (e.agenteIds) return `AND ${a}agente_id IN (${e.agenteIds.join(",")})`;
  return "";
}

// Fragmento para filtrar por coluna de agente arbitrária (ex.: campanhas.agente_id).
export function filtroPorAgente(e: Escopo, coluna: string): string {
  if (e.agenteIds) return `AND ${coluna} IN (${e.agenteIds.join(",")})`;
  return ""; // global/lider: sem restrição por agente
}
