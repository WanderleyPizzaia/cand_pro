import cidadesData from "@/data/sp-cidades.json";

export type Cidade = { nome: string; lat: number; lng: number; capital: boolean };

export const CIDADES_SP: Cidade[] = cidadesData as Cidade[];

// Faixa de marcas diacriticas combinantes (U+0300 a U+036F), montada via codigos
// para manter o codigo-fonte 100% ASCII.
const DIACRITICOS = new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g");

export function normalizar(s: string): string {
  return s.normalize("NFD").replace(DIACRITICOS, "").trim().toLowerCase();
}

const indice = new Map<string, Cidade>();
for (const c of CIDADES_SP) {
  indice.set(normalizar(c.nome), c);
}

export function buscarCidade(nome: string): Cidade | undefined {
  if (!nome) return undefined;
  return indice.get(normalizar(nome));
}
