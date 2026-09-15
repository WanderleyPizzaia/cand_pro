// Opções dos campos do cadastro (espelham o mockup "Cadastrar Pessoa")

export const CATEGORIAS = [
  "Liderança",
  "Mídia",
  "Política",
  "Educação",
  "Religião",
  "Empresário",
  "Influencer",
  "Outros",
] as const;

export const FUNCOES = [
  "Pastor",
  "Diácono",
  "Bispo",
  "Vereador",
  "Ex-Prefeito",
  "Prefeito",
  "Deputado",
  "Empresário",
  "Jornalista",
  "Blogueiro",
  "YouTuber",
  "Professor",
  "Diretor",
  "Coordenador",
  "Líder Comunitário",
  "Outro",
] as const;

// As 7 regiões administrativas de SP usadas no sistema (+ "Auto")
export const REGIOES = [
  "Região Metropolitana de São Paulo",
  "Vale do Paraíba e Litoral Norte",
  "Litoral Sul, Baixada Santista e Vale do Ribeira",
  "Sorocaba",
  "Campinas",
  "Central (Ribeirão Preto e Franca)",
  "Oeste Paulista",
] as const;

// Âncoras geográficas para inferir a região automaticamente pela cidade
export const ANCORAS_REGIAO: { regiao: string; lat: number; lng: number }[] = [
  { regiao: "Região Metropolitana de São Paulo", lat: -23.55, lng: -46.63 },
  { regiao: "Vale do Paraíba e Litoral Norte", lat: -23.18, lng: -45.88 },
  { regiao: "Litoral Sul, Baixada Santista e Vale do Ribeira", lat: -24.3, lng: -47.2 },
  { regiao: "Sorocaba", lat: -23.5, lng: -47.46 },
  { regiao: "Campinas", lat: -22.9, lng: -47.06 },
  { regiao: "Central (Ribeirão Preto e Franca)", lat: -21.17, lng: -47.81 },
  { regiao: "Oeste Paulista", lat: -22.0, lng: -50.6 },
];

export function regiaoMaisProxima(lat: number, lng: number): string {
  let melhor = ANCORAS_REGIAO[0];
  let menor = Infinity;
  for (const a of ANCORAS_REGIAO) {
    const d = (a.lat - lat) ** 2 + (a.lng - lng) ** 2;
    if (d < menor) {
      menor = d;
      melhor = a;
    }
  }
  return melhor.regiao;
}
