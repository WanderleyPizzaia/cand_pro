// Redefine a senha de um usuário direto no banco (ex.: admin que não consegue entrar).
// Lê as credenciais do banco do .env.local — NÃO contém segredos.
// A senha nova é digitada no Terminal, sem aparecer na tela.
// Uso (na raiz do projeto):  node scripts/redefinir-senha.mjs
import { readFileSync } from "fs";
import crypto from "crypto";
import readline from "readline";
import pg from "pg";

const env = {};
for (const linha of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

// Mesmo formato de lib/senha.ts (scrypt, "salt:hash").
function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function perguntar(texto, oculto = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) {
      rl._writeToOutput = (s) => {
        if (s.includes(texto)) rl.output.write(s);
      };
    }
    rl.question(texto, (resposta) => {
      rl.close();
      if (oculto) process.stdout.write("\n");
      resolve(resposta);
    });
  });
}

const email = (await perguntar("E-mail do usuário: ")).trim().toLowerCase();
const senha = await perguntar("Senha nova (não aparece na tela): ", true);
const confirmacao = await perguntar("Repita a senha nova: ", true);

if (!email) {
  console.log("E-mail vazio. Nada foi alterado.");
  process.exit(1);
}
if (senha.length < 8) {
  console.log("A senha precisa ter pelo menos 8 caracteres. Nada foi alterado.");
  process.exit(1);
}
if (senha !== confirmacao) {
  console.log("As senhas não conferem. Nada foi alterado.");
  process.exit(1);
}

const client = new pg.Client({
  host: env.PGHOST,
  port: Number(env.PGPORT),
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database: env.PGDATABASE,
  ssl: env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
  const r = await client.query(
    "UPDATE usuarios SET senha_hash = $1, ativo = 1 WHERE lower(email) = $2",
    [hashSenha(senha), email]
  );
  if (!r.rowCount) {
    console.log("Nenhum usuário com esse e-mail no banco " + env.PGDATABASE + ". Nada foi alterado.");
    process.exit(1);
  }
  // Libera o login caso tenha ficado bloqueado por tentativas erradas.
  await client.query(
    "DELETE FROM login_tentativas WHERE chave = $1 OR chave LIKE $2",
    [`email:${email}`, `conta:${email}|%`]
  );
  console.log("Senha redefinida no banco " + env.PGDATABASE + ". Já pode entrar com ela.");
} catch (e) {
  console.log("Erro:", e.code || "", String(e.message).split(env.PGPASSWORD || "\n").join("***"));
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
