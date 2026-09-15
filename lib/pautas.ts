// Constantes do Acolhimento de Pauta (compartilhadas entre UI e API). Módulo puro.

export const TEMAS = [
  { v: "saneamento", r: "Saneamento" },
  { v: "saude", r: "Saúde" },
  { v: "seguranca", r: "Segurança" },
  { v: "educacao", r: "Educação" },
  { v: "transporte", r: "Transporte e mobilidade" },
  { v: "moradia", r: "Moradia" },
  { v: "emprego", r: "Emprego e renda" },
  { v: "assistencia", r: "Assistência social" },
  { v: "outros", r: "Outros" },
];

export const TIPOS = [
  { v: "denuncia", r: "Denúncia" },
  { v: "solicitacao", r: "Solicitação" },
  { v: "sugestao", r: "Sugestão" },
  { v: "interesse", r: "Interesse" },
];

export const STATUS = [
  { v: "nova", r: "Nova" },
  { v: "em_analise", r: "Em análise" },
  { v: "em_acao", r: "Em ação" },
  { v: "resolvida", r: "Resolvida" },
  { v: "arquivada", r: "Arquivada" },
];

export const rotulo = (lista: { v: string; r: string }[], v: string) =>
  lista.find((x) => x.v === v)?.r || v;

// Protocolo da demanda: número da campanha + alfanumérico (ex.: 12789-A3F9K2).
export function gerarProtocolo(numero?: string | null): string {
  const n = (numero || "").replace(/\D/g, "") || "GP";
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${n}-${r}`;
}
