// Aplica um arquivo .sql no Postgres (Supabase). Lê credenciais do .env.local.
// NÃO contém segredos. Uso: node scripts/migrate.mjs [caminho.sql]
import { readFileSync } from "fs";
import pg from "pg";

function carregarEnv() {
  const env = {};
  const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const linha of txt.split("\n")) {
    const l = linha.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i === -1) continue;
    env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return env;
}

const arquivo = process.argv[2] || "db/schema.sql";
const env = carregarEnv();
const sql = readFileSync(new URL("../" + arquivo, import.meta.url), "utf8");

const client = new pg.Client({
  host: env.PGHOST,
  port: Number(env.PGPORT),
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database: env.PGDATABASE,
  ssl: false,
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log(`✅ Aplicado: ${arquivo}`);
  const t = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`
  );
  console.log("Tabelas em public:", t.rows.map((r) => r.table_name).join(", ") || "(nenhuma)");
} catch (e) {
  try { await client.query("ROLLBACK"); } catch {}
  console.error("❌ Erro ao aplicar:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
