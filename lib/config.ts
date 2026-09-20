import crypto from "crypto";
import { queryOne, execute } from "./db";
import { tokenConfere } from "./seguranca";

// Configuração global com fallback para variáveis de ambiente.
// Chaves: EVOLUTION_URL, EVOLUTION_APIKEY, ANTHROPIC_API_KEY
export async function getConfig(chave: string): Promise<string> {
  const linha = await queryOne<{ valor: string }>(
    "SELECT valor FROM config WHERE chave = $1",
    [chave]
  );
  if (linha?.valor) return linha.valor;
  return process.env[chave] || "";
}

export async function setConfig(chave: string, valor: string): Promise<void> {
  await execute(
    "INSERT INTO config (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor",
    [chave, valor]
  );
}

// Confere um token recebido contra o segredo `chave` (config ou env), em tempo
// constante. "ausente" = o segredo não foi configurado: a rota deve RECUSAR
// (webhook sem token não fica aberto).
export async function conferirToken(
  chave: string,
  recebido: string | null | undefined
): Promise<"ok" | "ausente" | "invalido"> {
  const esperado = (await getConfig(chave)).trim();
  if (!esperado) return "ausente";
  return tokenConfere(recebido, esperado) ? "ok" : "invalido";
}

// Devolve o segredo `chave`; se ainda não existir, gera um aleatório e grava.
export async function garantirSegredo(chave: string): Promise<string> {
  const atual = (await getConfig(chave)).trim();
  if (atual) return atual;
  await execute(
    "INSERT INTO config (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO NOTHING",
    [chave, crypto.randomBytes(24).toString("hex")]
  );
  return (await getConfig(chave)).trim();
}

// URL do webhook da Evolution já com o token (gerado na primeira vez).
export async function urlWebhookEvolution(origin: string): Promise<string> {
  const token = await garantirSegredo("WEBHOOK_TOKEN");
  return `${origin}/api/whatsapp/webhook?token=${encodeURIComponent(token)}`;
}

export async function statusConfig() {
  const [url, apikey, claude, gcal, n8nUrl, n8nToken, n8nAgente, metaSecret, iaKey] = await Promise.all([
    getConfig("EVOLUTION_URL"),
    getConfig("EVOLUTION_APIKEY"),
    getConfig("ANTHROPIC_API_KEY"),
    getConfig("GOOGLE_CALENDAR_SRC"),
    getConfig("N8N_DISPARO_URL"),
    getConfig("N8N_TOKEN"),
    getConfig("N8N_AGENTE_URL"),
    getConfig("META_APP_SECRET"),
    getConfig("IA_API_KEY"),
  ]);
  return {
    evolutionUrl: !!url,
    evolutionApiKey: !!apikey,
    anthropicKey: !!claude,
    // Chave de IA global de verdade: é a que lib/ia.ts usa quando o agente não
    // tem a própria. Chave de outro fornecedor (sk-ant-) não serve no endpoint
    // atual, então não conta como configurada.
    iaGlobal: !!(iaKey || claude) && !(iaKey || claude).startsWith("sk-ant-"),
    googleCalendar: !!gcal,
    n8nDisparoUrl: !!n8nUrl,
    n8nToken: !!n8nToken,
    n8nAgenteUrl: !!n8nAgente,
    metaAppSecret: !!metaSecret,
  };
}
