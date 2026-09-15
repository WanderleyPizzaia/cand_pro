// Reposiciona no mapa quem tem CIDADE reconhecida na base de SP, usando as
// coordenadas da CIDADE (preciso) em vez da estimativa por DDD (que jogava o
// contato no polo do DDD, ex.: São Carlos -> Ribeirão Preto).
//
// Migração de uma vez. Lê credenciais do .env.local (não contém segredos).
// Uso (na raiz do projeto):  node scripts/regeocode-cidades.mjs
// Modo simulação (não grava):  node scripts/regeocode-cidades.mjs --dry
//
// Região é preservada. Idempotente: rodar de novo não muda nada além do jitter estável.
import { readFileSync } from "fs";
import pg from "pg";

const DRY = process.argv.includes("--dry");

// --- .env.local ---
const env = {};
for (const linha of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const l = linha.trim();
  if (!l || l.startsWith("#")) continue;
  const i = l.indexOf("=");
  if (i > -1) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}

// --- base de cidades de SP (mesma normalização de lib/cidades.ts) ---
const cidades = JSON.parse(
  readFileSync(new URL("../data/sp-cidades.json", import.meta.url), "utf8")
);
const DIACRITICOS = new RegExp(
  "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
  "g"
);
const normalizar = (s) => s.normalize("NFD").replace(DIACRITICOS, "").trim().toLowerCase();
const indice = new Map();
for (const c of cidades) indice.set(normalizar(c.nome), c);

// jitter determinístico (mesma fórmula de lib/geo.ts) ~±3km, estável por id
const jitter = (id, sal) => {
  const s = Math.sin(id * 12.9898 + sal * 78.233) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 0.06;
};

const client = new pg.Client({
  host: env.PGHOST, port: Number(env.PGPORT), user: env.PGUSER,
  password: env.PGPASSWORD, database: env.PGDATABASE, ssl: false,
});

await client.connect();
console.log(DRY ? "== SIMULAÇÃO (nada será gravado) ==" : "== APLICANDO ==");

// Garante a coluna de origem do geo (idempotente) — o script funciona mesmo
// se rodar antes do deploy que adiciona a coluna em lib/db.ts.
if (!DRY) {
  await client.query(`ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS geo_origem TEXT`);
}

const { rows } = await client.query(
  `SELECT id, cidade, lat, lng FROM pessoas
    WHERE cidade IS NOT NULL AND cidade <> ''
    ORDER BY id`
);
console.log("Registros com cidade:", rows.length);

// Calcula o alvo e coleta só quem realmente muda (>~100m).
const updates = [];
const idsCidade = []; // reconhecidos -> geo_origem='cidade' (confirmado)
let semBase = 0;
for (const p of rows) {
  const c = indice.get(normalizar(p.cidade));
  if (!c) { semBase++; continue; } // cidade fora da base de SP
  idsCidade.push(p.id);
  const lat = c.lat + jitter(p.id, 1);
  const lng = c.lng + jitter(p.id, 2);
  const mudou = p.lat == null || Math.abs(p.lat - lat) > 0.001 || Math.abs(p.lng - lng) > 0.001;
  if (mudou) updates.push({ id: p.id, lat, lng });
}
console.log("Fora da base de SP (não plotam):", semBase);
console.log("Serão reposicionados:", updates.length);
console.log("Serão marcados como 'cidade' (confirmado):", idsCidade.length);

if (!DRY && updates.length) {
  const TAM = 500;
  let feitos = 0;
  for (let i = 0; i < updates.length; i += TAM) {
    const lote = updates.slice(i, i + TAM);
    const vals = [];
    const params = [];
    lote.forEach((u, k) => {
      params.push(u.id, u.lat, u.lng);
      vals.push(`($${k * 3 + 1}::bigint, $${k * 3 + 2}::double precision, $${k * 3 + 3}::double precision)`);
    });
    await client.query(
      `UPDATE pessoas AS p SET lat = v.lat, lng = v.lng
         FROM (VALUES ${vals.join(",")}) AS v(id, lat, lng)
        WHERE p.id = v.id`,
      params
    );
    feitos += lote.length;
    console.log(`  ...${feitos}/${updates.length}`);
  }
  console.log("OK. Reposicionados:", feitos);
} else if (DRY) {
  console.log("(simulação — rode sem --dry para aplicar)");
}

// Marca a ORIGEM do geo (honestidade do mapa). Só quando não é simulação.
if (!DRY) {
  // Reconhecidos por cidade -> 'cidade' (confirmado), em lotes.
  const T = 1000;
  for (let i = 0; i < idsCidade.length; i += T) {
    const lote = idsCidade.slice(i, i + T);
    await client.query(
      `UPDATE pessoas SET geo_origem = 'cidade' WHERE id = ANY($1::bigint[])`,
      [lote]
    );
  }
  // O resto que tem geo mas não foi por cidade -> 'ddd' (estimado por região).
  const r = await client.query(
    `UPDATE pessoas SET geo_origem = 'ddd'
      WHERE geo_origem IS NULL AND lat IS NOT NULL`
  );
  console.log(`Origem marcada: 'cidade'=${idsCidade.length}, 'ddd'=${r.rowCount}`);
}

await client.end();
console.log("Fim.");
