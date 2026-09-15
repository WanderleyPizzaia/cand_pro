// Diagnóstico de conexão com o Postgres (Supabase self-hosted).
// Lê as credenciais do .env.local — NÃO contém segredos.
// Uso: node scripts/dbcheck.mjs
import { readFileSync } from "fs";
import pg from "pg";

function carregarEnv() {
  const env = {};
  try {
    const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const linha of txt.split("\n")) {
      const l = linha.trim();
      if (!l || l.startsWith("#")) continue;
      const i = l.indexOf("=");
      if (i === -1) continue;
      env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    }
  } catch (e) {
    console.error("Não consegui ler .env.local:", e.message);
    process.exit(1);
  }
  return env;
}

const env = carregarEnv();

async function tentar(rotulo, config) {
  const client = new pg.Client(config);
  try {
    await client.connect();
    const v = await client.query("SELECT version(), current_database() AS db");
    const tabelas = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name`
    );
    console.log(`\n✅ Conectou (${rotulo})`);
    console.log("   Banco:", v.rows[0].db);
    console.log("   Versão:", v.rows[0].version.split(",")[0]);
    console.log(
      "   Tabelas em public:",
      tabelas.rows.length
        ? tabelas.rows.map((r) => r.table_name).join(", ")
        : "(nenhuma)"
    );
    await client.end();
    return true;
  } catch (e) {
    console.log(`\n❌ Falhou (${rotulo}): ${e.message}`);
    try {
      await client.end();
    } catch {}
    return false;
  }
}

const base = {
  host: env.PGHOST,
  port: Number(env.PGPORT),
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database: env.PGDATABASE,
  connectionTimeoutMillis: 10000,
};

console.log("Host:", base.host, "| Porta:", base.port, "| DB:", base.database);

let ok = await tentar("sem SSL", { ...base, ssl: false });
if (!ok) ok = await tentar("SSL (rejectUnauthorized:false)", { ...base, ssl: { rejectUnauthorized: false } });
if (!ok) {
  console.log("\nNenhuma variação conectou. Verifique host/porta/credenciais/firewall.");
  process.exit(2);
}
