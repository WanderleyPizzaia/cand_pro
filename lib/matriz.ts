// Matriz política (compasso de 2 eixos), critérios reais e cálculo.
// Eixo X (econômico): -10 = Esquerda (Estado/coletivo) .. +10 = Direita (mercado/livre iniciativa).
// Eixo Y (social):    -10 = Libertário/Progressista (baixo) .. +10 = Autoritário/Conservador (cima).
// Módulo puro (sem imports de servidor): usado no cálculo (API) e no render (UI).

export type Eixo = "economico" | "social";

export type Criterio = {
  id: string;
  texto: string;
  eixo: Eixo;
  // Direção: +1 se CONCORDAR empurra para o lado positivo do eixo (direita / autoritário),
  // -1 se CONCORDAR empurra para o lado negativo (esquerda / libertário).
  dir: 1 | -1;
};

// Escala de resposta (Likert): Discordo totalmente (-2) .. Concordo totalmente (+2).
export const ESCALA = [
  { v: -2, r: "Discordo totalmente" },
  { v: -1, r: "Discordo" },
  { v: 0, r: "Neutro" },
  { v: 1, r: "Concordo" },
  { v: 2, r: "Concordo totalmente" },
];

// 12 critérios (6 por eixo, 3 para cada lado), linguagem clara e sem jargão.
export const CRITERIOS: Criterio[] = [
  // Econômico
  { id: "e1", eixo: "economico", dir: -1, texto: "O Estado deve ter papel forte na economia e garantir os serviços essenciais." },
  { id: "e2", eixo: "economico", dir: 1, texto: "Menos impostos e menos regulação geram mais empregos e crescimento." },
  { id: "e3", eixo: "economico", dir: -1, texto: "Empresas públicas estratégicas não devem ser privatizadas." },
  { id: "e4", eixo: "economico", dir: -1, texto: "Programas de transferência de renda são essenciais para reduzir a desigualdade." },
  { id: "e5", eixo: "economico", dir: 1, texto: "Quem produz e empreende deve ter liberdade, com o mínimo de interferência do governo." },
  { id: "e6", eixo: "economico", dir: 1, texto: "Serviços como previdência e saúde funcionam melhor com mais participação da iniciativa privada." },
  // Social
  { id: "s1", eixo: "social", dir: 1, texto: "Valores tradicionais e da família devem orientar as leis." },
  { id: "s2", eixo: "social", dir: 1, texto: "A segurança pública exige endurecimento das penas e mais rigor." },
  { id: "s3", eixo: "social", dir: -1, texto: "O Estado não deve interferir nas escolhas pessoais e nos costumes de cada um." },
  { id: "s4", eixo: "social", dir: -1, texto: "Ampliar direitos das minorias e as pautas de diversidade deve ser prioridade." },
  { id: "s5", eixo: "social", dir: 1, texto: "Instituições religiosas devem ter voz nas políticas públicas." },
  { id: "s6", eixo: "social", dir: -1, texto: "A sociedade deve ser aberta a mudanças de costumes e novos modos de vida." },
];

function clamp(n: number, min = -10, max = 10) {
  return Math.max(min, Math.min(max, n));
}

// Calcula a posição (X econômico, Y social) a partir das respostas {id: valor -2..2}.
export function calcular(respostas: Record<string, number>): { economico: number; social: number } {
  const soma = { economico: 0, social: 0 };
  const n = { economico: 0, social: 0 };
  for (const c of CRITERIOS) {
    const v = respostas[c.id];
    if (typeof v !== "number" || Number.isNaN(v)) continue;
    soma[c.eixo] += Math.max(-2, Math.min(2, v)) * c.dir;
    n[c.eixo] += 1;
  }
  const norm = (eixo: Eixo) => (n[eixo] ? clamp((soma[eixo] / (2 * n[eixo])) * 10) : 0);
  return {
    economico: Math.round(norm("economico") * 10) / 10,
    social: Math.round(norm("social") * 10) / 10,
  };
}

// Rótulo do quadrante a partir da posição.
export function quadrante(economico: number, social: number): string {
  const x = economico >= 0 ? "Direita" : "Esquerda";
  const y = social >= 0 ? (economico >= 0 ? "conservadora" : "autoritária") : (economico >= 0 ? "liberal" : "libertária");
  if (Math.abs(economico) < 1.5 && Math.abs(social) < 1.5) return "Centro";
  return `${x} ${y}`;
}
