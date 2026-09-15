import { getConfig } from "./config";

// Integração BTG Empresas · PIX cash-in (recebimento com QR Code).
// Credenciais ficam SÓ no cofre (config), nunca no código. Enquanto não
// provisionadas, `btgConfigurado()` é false e a plataforma não tenta cobrar.
// A plataforma ORQUESTRA; o dinheiro trafega exclusivamente pelo rail do BTG.

const TOKEN_URL = "https://id.btgpactual.com/oauth2/token";
const API_BASE = "https://api.empresas.btgpactual.com";

let cache: { token: string; exp: number } = { token: "", exp: 0 };

export async function btgConfigurado(): Promise<boolean> {
  const [id, secret, company] = await Promise.all([
    getConfig("BTG_CLIENT_ID"),
    getConfig("BTG_CLIENT_SECRET"),
    getConfig("BTG_COMPANY_ID"),
  ]);
  return !!(id && secret && company);
}

async function obterToken(): Promise<string | null> {
  const agora = Date.now();
  if (cache.token && cache.exp > agora + 30000) return cache.token;
  const id = await getConfig("BTG_CLIENT_ID");
  const secret = await getConfig("BTG_CLIENT_SECRET");
  if (!id || !secret) return null;
  try {
    const body = new URLSearchParams({ grant_type: "client_credentials" });
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      },
      body,
    });
    if (!r.ok) { console.error("[btg] token", r.status); return null; }
    const d = await r.json().catch(() => ({}));
    const tok = d.access_token || d.token;
    if (!tok) return null;
    const ttl = Number(d.expires_in || 300) * 1000;
    cache = { token: tok, exp: agora + ttl };
    return tok;
  } catch (e: any) {
    console.error("[btg] token erro", e?.message);
    return null;
  }
}

// Cria uma cobrança PIX instantânea e devolve o QR (copia-e-cola + imagem, se vier).
export async function criarCobrancaPix(opts: {
  valor: number;
  descricao?: string;
  txid?: string;
}): Promise<{ ok: boolean; erro?: string; txid?: string; emv?: string; qrcodeBase64?: string; id?: string }> {
  if (!(await btgConfigurado())) return { ok: false, erro: "BTG não configurado (aguardando credenciais no cofre)." };
  const company = await getConfig("BTG_COMPANY_ID");
  const chave = await getConfig("BTG_PIX_KEY");
  const token = await obterToken();
  if (!token) return { ok: false, erro: "Falha na autenticação BTG." };
  try {
    const url = `${API_BASE}/v1/companies/${encodeURIComponent(company)}/pix-cash-in/instant-collections`;
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(opts.valor.toFixed(2)),
        pixKey: chave || undefined,
        key: chave || undefined,
        description: (opts.descricao || "CAND PRO").slice(0, 140),
        txid: opts.txid || undefined,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: `BTG ${r.status}: ${JSON.stringify(d).slice(0, 200)}` };
    // Parse defensivo (nomes de campo podem variar conforme o contrato do BTG).
    const emv = d.emv || d.copyPaste || d.qrCode || d.pixCopiaECola || d.brcode || "";
    const qrcodeBase64 = d.qrCodeImage || d.qrcodeBase64 || d.imageBase64 || "";
    const txid = d.txid || d.txId || d.id || opts.txid || "";
    return { ok: true, emv, qrcodeBase64, txid, id: d.id || txid };
  } catch (e: any) {
    return { ok: false, erro: e?.message || "rede" };
  }
}
