import type { Sessao } from "./auth";
import { query } from "./db";
import { agentesDoCandidato } from "./metas";

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

// ============================================================
// Números que o usuário enxerga AGORA (não o que estava no cookie do login).
// Ordem: números marcados na tela de Usuários > gabinete vinculado > global.
// Um cache curto evita repetir a consulta nos vários blocos de uma página.
// ============================================================
const CACHE_MS = 10_000;
const cacheEscopo = new Map<number, { t: number; ids: number[] | null }>();

export function limparCacheEscopo(uid?: number): void {
  if (uid === undefined) cacheEscopo.clear();
  else cacheEscopo.delete(uid);
}

export async function agentesDaSessao(s: Sessao): Promise<number[] | null> {
  if (s.perfil === "ADMIN") return null; // admin vê tudo
  const agora = Date.now();
  const emCache = cacheEscopo.get(s.uid);
  if (emCache && agora - emCache.t < CACHE_MS) return emCache.ids;

  const marcados = await query<{ agente_id: number }>(
    "SELECT agente_id FROM usuario_agentes WHERE usuario_id = $1 ORDER BY agente_id",
    [s.uid]
  );

  let ids: number[] | null;
  if (marcados.length) {
    ids = marcados.map((r) => r.agente_id); // escolha explícita manda
  } else if (s.perfil === "ATENDENTE") {
    ids = []; // atendente sem número vinculado não recebe nada
  } else {
    const alvo = (s.escopoCandidato || (s.perfil === "CANDIDATO" ? s.nome : "")).trim();
    ids = alvo ? await agentesDoCandidato(alvo, s.uid) : null;
  }

  cacheEscopo.set(s.uid, { t: agora, ids });
  return ids;
}

// Versão assíncrona do resolverEscopo: usa os números atuais do banco.
export async function resolverEscopoAtual(s: Sessao): Promise<Escopo> {
  const uid = s.uid;
  if (s.perfil === "ADMIN") return { agenteIds: null, ehLider: false, ehGlobal: true, uid };
  if (s.perfil === "LIDER") {
    const ids = await agentesDaSessao(s);
    // Líder continua vendo só o que cadastrou; números marcados não mudam isso.
    return { agenteIds: ids, ehLider: true, ehGlobal: false, uid };
  }
  const ids = await agentesDaSessao(s);
  if (ids === null) return { agenteIds: null, ehLider: false, ehGlobal: true, uid };
  return { agenteIds: ids.length ? ids : [-1], ehLider: false, ehGlobal: false, uid };
}
