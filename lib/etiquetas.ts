// ============================================================
// Etiquetas do contato. Sem banco aqui: vale no navegador e no servidor.
// Gravadas em pessoas.etiquetas, no contato daquele candidato. "IA
// respondendo" não é etiqueta gravada: é o estado real da conversa (agente
// ligado e conversa sem pausa), calculado em lib/atendimento.ts.
// ============================================================

export type Etiqueta = "vai_votar" | "nao_vai_votar" | "retomar";
export type TomEtiqueta = "ok" | "erro" | "atencao" | "info";

export const ETIQUETAS: { v: Etiqueta; rotulo: string; tom: TomEtiqueta }[] = [
  { v: "vai_votar", rotulo: "Vai votar", tom: "ok" },
  { v: "nao_vai_votar", rotulo: "Não vai votar", tom: "erro" },
  { v: "retomar", rotulo: "Retomar contato", tom: "atencao" },
];

// Filtro extra da lista de conversas (não é gravado no contato).
export const FILTRO_IA = "ia";
export const ROTULO_IA = "IA respondendo";

// "Vai votar" e "Não vai votar" se excluem: marcar uma desmarca a outra.
const OPOSTA: Partial<Record<Etiqueta, Etiqueta>> = {
  vai_votar: "nao_vai_votar",
  nao_vai_votar: "vai_votar",
};

export function opostaDe(v: Etiqueta): Etiqueta | null {
  return OPOSTA[v] ?? null;
}

export function ehEtiqueta(v: unknown): v is Etiqueta {
  return ETIQUETAS.some((e) => e.v === v);
}

// Liga ou desliga uma etiqueta e devolve a lista na ordem fixa de ETIQUETAS
// (descarta valores que não existem mais).
export function alternarEtiqueta(
  atuais: readonly string[] | null | undefined,
  v: Etiqueta,
  ligar: boolean
): Etiqueta[] {
  const set = new Set<string>((atuais || []).filter(ehEtiqueta));
  if (ligar) {
    set.add(v);
    const oposta = OPOSTA[v];
    if (oposta) set.delete(oposta);
  } else {
    set.delete(v);
  }
  return ETIQUETAS.map((e) => e.v).filter((x) => set.has(x));
}

export function etiquetasValidas(v: unknown): Etiqueta[] {
  return Array.isArray(v) ? ETIQUETAS.map((e) => e.v).filter((x) => v.includes(x)) : [];
}
