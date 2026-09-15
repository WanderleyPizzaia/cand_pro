// ============================================================
// DDD -> localização aproximada.
// Contatos importados do WhatsApp chegam só com nome + número, sem cidade.
// Para plotar no Mapa de Votos derivamos a localização do DDD do número.
// SP (11-19) tem cidade de referência precisa; demais DDDs caem na capital
// do estado (mostra alcance fora de SP sem fingir precisão de bairro).
// ============================================================

export type GeoDDD = { cidade: string; uf: string; lat: number; lng: number };

// SP marcado com uf "SP" -> recebe região via regiaoMaisProxima.
export const DDD_GEO: Record<string, GeoDDD> = {
  // --- São Paulo (preciso) ---
  "11": { cidade: "São Paulo", uf: "SP", lat: -23.55, lng: -46.63 },
  "12": { cidade: "São José dos Campos", uf: "SP", lat: -23.18, lng: -45.88 },
  "13": { cidade: "Santos", uf: "SP", lat: -23.96, lng: -46.33 },
  "14": { cidade: "Bauru", uf: "SP", lat: -22.31, lng: -49.06 },
  "15": { cidade: "Sorocaba", uf: "SP", lat: -23.5, lng: -47.46 },
  "16": { cidade: "Ribeirão Preto", uf: "SP", lat: -21.17, lng: -47.81 },
  "17": { cidade: "São José do Rio Preto", uf: "SP", lat: -20.81, lng: -49.38 },
  "18": { cidade: "Presidente Prudente", uf: "SP", lat: -22.12, lng: -51.39 },
  "19": { cidade: "Campinas", uf: "SP", lat: -22.9, lng: -47.06 },
  // --- Rio de Janeiro ---
  "21": { cidade: "Rio de Janeiro", uf: "RJ", lat: -22.91, lng: -43.17 },
  "22": { cidade: "Campos dos Goytacazes", uf: "RJ", lat: -21.75, lng: -41.33 },
  "24": { cidade: "Volta Redonda", uf: "RJ", lat: -22.52, lng: -44.1 },
  // --- Espírito Santo ---
  "27": { cidade: "Vitória", uf: "ES", lat: -20.32, lng: -40.34 },
  "28": { cidade: "Cachoeiro de Itapemirim", uf: "ES", lat: -20.85, lng: -41.11 },
  // --- Minas Gerais ---
  "31": { cidade: "Belo Horizonte", uf: "MG", lat: -19.92, lng: -43.94 },
  "32": { cidade: "Juiz de Fora", uf: "MG", lat: -21.76, lng: -43.35 },
  "33": { cidade: "Governador Valadares", uf: "MG", lat: -18.85, lng: -41.95 },
  "34": { cidade: "Uberlândia", uf: "MG", lat: -18.91, lng: -48.27 },
  "35": { cidade: "Poços de Caldas", uf: "MG", lat: -21.79, lng: -46.56 },
  "37": { cidade: "Divinópolis", uf: "MG", lat: -20.14, lng: -44.89 },
  "38": { cidade: "Montes Claros", uf: "MG", lat: -16.73, lng: -43.86 },
  // --- Paraná ---
  "41": { cidade: "Curitiba", uf: "PR", lat: -25.43, lng: -49.27 },
  "42": { cidade: "Ponta Grossa", uf: "PR", lat: -25.09, lng: -50.16 },
  "43": { cidade: "Londrina", uf: "PR", lat: -23.31, lng: -51.16 },
  "44": { cidade: "Maringá", uf: "PR", lat: -23.42, lng: -51.94 },
  "45": { cidade: "Foz do Iguaçu", uf: "PR", lat: -25.54, lng: -54.59 },
  "46": { cidade: "Pato Branco", uf: "PR", lat: -26.23, lng: -52.67 },
  // --- Santa Catarina ---
  "47": { cidade: "Joinville", uf: "SC", lat: -26.3, lng: -48.85 },
  "48": { cidade: "Florianópolis", uf: "SC", lat: -27.59, lng: -48.55 },
  "49": { cidade: "Chapecó", uf: "SC", lat: -27.1, lng: -52.62 },
  // --- Rio Grande do Sul ---
  "51": { cidade: "Porto Alegre", uf: "RS", lat: -30.03, lng: -51.23 },
  "53": { cidade: "Pelotas", uf: "RS", lat: -31.77, lng: -52.34 },
  "54": { cidade: "Caxias do Sul", uf: "RS", lat: -29.17, lng: -51.18 },
  "55": { cidade: "Santa Maria", uf: "RS", lat: -29.69, lng: -53.81 },
  // --- Centro-Oeste / DF ---
  "61": { cidade: "Brasília", uf: "DF", lat: -15.79, lng: -47.88 },
  "62": { cidade: "Goiânia", uf: "GO", lat: -16.68, lng: -49.25 },
  "64": { cidade: "Rio Verde", uf: "GO", lat: -17.79, lng: -50.92 },
  "63": { cidade: "Palmas", uf: "TO", lat: -10.18, lng: -48.33 },
  "65": { cidade: "Cuiabá", uf: "MT", lat: -15.6, lng: -56.1 },
  "66": { cidade: "Rondonópolis", uf: "MT", lat: -16.47, lng: -54.64 },
  "67": { cidade: "Campo Grande", uf: "MS", lat: -20.44, lng: -54.65 },
  "68": { cidade: "Rio Branco", uf: "AC", lat: -9.97, lng: -67.81 },
  "69": { cidade: "Porto Velho", uf: "RO", lat: -8.76, lng: -63.9 },
  // --- Nordeste ---
  "71": { cidade: "Salvador", uf: "BA", lat: -12.97, lng: -38.5 },
  "73": { cidade: "Itabuna", uf: "BA", lat: -14.79, lng: -39.28 },
  "74": { cidade: "Juazeiro", uf: "BA", lat: -9.42, lng: -40.5 },
  "75": { cidade: "Feira de Santana", uf: "BA", lat: -12.27, lng: -38.97 },
  "77": { cidade: "Vitória da Conquista", uf: "BA", lat: -14.86, lng: -40.84 },
  "79": { cidade: "Aracaju", uf: "SE", lat: -10.95, lng: -37.07 },
  "81": { cidade: "Recife", uf: "PE", lat: -8.05, lng: -34.88 },
  "87": { cidade: "Petrolina", uf: "PE", lat: -9.39, lng: -40.5 },
  "82": { cidade: "Maceió", uf: "AL", lat: -9.67, lng: -35.74 },
  "83": { cidade: "João Pessoa", uf: "PB", lat: -7.12, lng: -34.86 },
  "84": { cidade: "Natal", uf: "RN", lat: -5.79, lng: -35.21 },
  "85": { cidade: "Fortaleza", uf: "CE", lat: -3.73, lng: -38.52 },
  "88": { cidade: "Juazeiro do Norte", uf: "CE", lat: -7.21, lng: -39.32 },
  "86": { cidade: "Teresina", uf: "PI", lat: -5.09, lng: -42.8 },
  "89": { cidade: "Picos", uf: "PI", lat: -7.08, lng: -41.47 },
  // --- Norte ---
  "91": { cidade: "Belém", uf: "PA", lat: -1.46, lng: -48.5 },
  "93": { cidade: "Santarém", uf: "PA", lat: -2.44, lng: -54.7 },
  "94": { cidade: "Marabá", uf: "PA", lat: -5.37, lng: -49.13 },
  "92": { cidade: "Manaus", uf: "AM", lat: -3.12, lng: -60.02 },
  "97": { cidade: "Coari", uf: "AM", lat: -4.08, lng: -63.14 },
  "95": { cidade: "Boa Vista", uf: "RR", lat: 2.82, lng: -60.67 },
  "96": { cidade: "Macapá", uf: "AP", lat: 0.03, lng: -51.07 },
  "98": { cidade: "São Luís", uf: "MA", lat: -2.53, lng: -44.3 },
  "99": { cidade: "Imperatriz", uf: "MA", lat: -5.53, lng: -47.48 },
};

// Extrai o DDD de um número BR (com ou sem DDI 55). Retorna "" se não der.
export function dddDoNumero(raw: string | null | undefined): string {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  // remove DDI 55 quando presente (e o número tem tamanho de celular/fixo BR)
  const semDDI = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (semDDI.length < 10) return ""; // sem DDD completo
  return semDDI.slice(0, 2);
}

export function geoDoNumero(raw: string | null | undefined): GeoDDD | undefined {
  const ddd = dddDoNumero(raw);
  return ddd ? DDD_GEO[ddd] : undefined;
}
