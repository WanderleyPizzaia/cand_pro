import { query } from "./db";
import { buscarCidade } from "./cidades";
import { regiaoMaisProxima } from "./opcoes";
import { geoDoNumero } from "./ddd";

// ============================================================
// Backfill de coordenadas (base real do Mapa de Votos).
// Contatos importados do legado vêm só com `cidade` (sem lat/lng),
// então não apareciam no mapa. Aqui resolvemos lat/lng a partir da
// cidade (base oficial de SP) e gravamos no banco - uma vez por
// registro. Pequeno jitter determinístico espalha os pontos da
// mesma cidade para não empilharem exatamente no mesmo pixel.
// ============================================================

// Jitter determinístico (~±0.03°, ≈3km) baseado no id - estável entre
// execuções e sem depender de Math.random.
function jitter(id: number, sal: number): number {
  const s = Math.sin(id * 12.9898 + sal * 78.233) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 0.06;
}

// Preenche coordenadas dos registros que têm cidade reconhecida mas
// estão sem lat/lng. `limite` evita lotear uma única requisição.
// Retorna quantos registros foram atualizados.
export async function backfillGeo(limite = 500): Promise<number> {
  const pendentes = await query<{ id: number; cidade: string }>(
    `SELECT id, cidade FROM pessoas
      WHERE (lat IS NULL OR lng IS NULL)
        AND cidade IS NOT NULL AND cidade <> ''
      ORDER BY id
      LIMIT $1`,
    [limite]
  );
  if (pendentes.length === 0) return 0;

  let n = 0;
  for (const p of pendentes) {
    const c = buscarCidade(p.cidade);
    if (!c) continue; // cidade fora da base de SP - não plota
    const lat = c.lat + jitter(p.id, 1);
    const lng = c.lng + jitter(p.id, 2);
    const regiao = regiaoMaisProxima(c.lat, c.lng);
    await query(
      `UPDATE pessoas
          SET lat = $1, lng = $2,
              regiao = COALESCE(NULLIF(regiao, ''), $3),
              geo_origem = 'cidade'
        WHERE id = $4`,
      [lat, lng, regiao, p.id]
    );
    n++;
  }
  return n;
}

// Backfill por TELEFONE (DDD). Para contatos importados do WhatsApp que vêm
// só com nome + número (SEM cidade), derivamos a localização do DDD - é uma
// estimativa por REGIÃO (joga a pessoa no polo do DDD), não a cidade exata.
// Preenche quem está sem lat/lng e tem whatsapp. Idempotente.
//
// PRIORIDADE: a CIDADE INFORMADA sempre vence o DDD. Quem já tem uma cidade
// reconhecida na base de SP é ignorado aqui e resolvido por `backfillGeo`
// (senão jogaríamos, ex., um contato de São Carlos no polo do DDD = Ribeirão).
export async function backfillGeoPorTelefone(limite = 5000): Promise<number> {
  const pendentes = await query<{ id: number; whatsapp: string; cidade: string | null }>(
    `SELECT id, whatsapp, cidade FROM pessoas
      WHERE (lat IS NULL OR lng IS NULL)
        AND whatsapp IS NOT NULL AND whatsapp <> ''
      ORDER BY id
      LIMIT $1`,
    [limite]
  );
  if (pendentes.length === 0) return 0;

  let n = 0;
  for (const p of pendentes) {
    // Cidade informada e reconhecida? Não estima por DDD - deixa p/ backfillGeo.
    if (p.cidade && buscarCidade(p.cidade)) continue;
    const g = geoDoNumero(p.whatsapp);
    if (!g) continue; // DDD desconhecido - não plota
    const lat = g.lat + jitter(p.id, 1);
    const lng = g.lng + jitter(p.id, 2);
    // Região: SP usa a âncora mais próxima; fora de SP usa a UF como rótulo.
    const regiao = g.uf === "SP" ? regiaoMaisProxima(g.lat, g.lng) : g.uf;
    await query(
      `UPDATE pessoas
          SET lat = $1, lng = $2,
              cidade = COALESCE(NULLIF(cidade, ''), $3),
              regiao = COALESCE(NULLIF(regiao, ''), $4),
              geo_origem = 'ddd'
        WHERE id = $5`,
      [lat, lng, g.cidade, regiao, p.id]
    );
    n++;
  }
  return n;
}
