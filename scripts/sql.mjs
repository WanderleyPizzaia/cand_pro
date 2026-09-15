// Executa um comando SQL avulso no Postgres. Lê credenciais do .env.local.
// NÃO contém segredos. Uso: node scripts/sql.mjs "SELECT ..."
import { readFileSync } from "fs";
import pg from "pg";

const env = {};
for (const linha of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const l = linha.trim();
  if (!l || l.startsWith("#")) continue;
  const i = l.indexOf("=");
  if (i > -1) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}

const sql = process.argv[2];
if (!sql) {
  console.error('Uso: node scripts/sql.mjs "SQL aqui"');
  process.exit(1);
}

const client = new pg.Client({
  host: env.PGHOST,
  port: Number(env.PGPORT),
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database: env.PGDATABASE,
  ssl: false,
});

try {
  await client.connect();
  const r = await client.query(sql);
  console.log("rowCount:", r.rowCount);
  if (r.rows?.length) console.table(r.rows);
} catch (e) {
  console.error("Erro:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
