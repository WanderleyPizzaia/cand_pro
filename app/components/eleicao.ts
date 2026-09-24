// Data e hora da votação (1º turno 2026, abertura das urnas às 8h de Brasília).
// Fonte única para o selo do topo, o gráfico do Início e o Planejamento.
export const ELEICAO_TS = new Date("2026-10-04T08:00:00-03:00").getTime();
export const ELEICAO_DIA = "2026-10-04";

// Texto do selo de contagem. null quando a votação já começou.
export function rotuloContagem(agora: number, curto = false): string | null {
  const diff = ELEICAO_TS - agora;
  if (diff <= 0) return null;
  const hojeSP = new Date(agora).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  if (hojeSP === ELEICAO_DIA) return curto ? "Hoje" : "Votação hoje · urnas às 8h";
  const dias = Math.ceil(diff / 86400000);
  if (curto) return `${dias} ${dias === 1 ? "dia" : "dias"}`;
  return `Faltam ${dias} ${dias === 1 ? "dia" : "dias"} · 1º turno`;
}
