import crypto from "crypto";
import { cookies } from "next/headers";
import { hashSenha, conferirSenha } from "./senha";

export { hashSenha, conferirSenha };

// Segredo que assina o cookie de sessão. Em PRODUÇÃO é obrigatório: sem
// AUTH_SECRET o sistema recusa criar e ler sessões, porque um valor fixo no
// código permitiria forjar login de ADMIN. Em desenvolvimento usa um valor local.
// Gere um valor forte com: openssl rand -base64 48
function segredo(): string {
  const s = process.env.AUTH_SECRET || "";
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[SEGURANCA] AUTH_SECRET não definido em produção. Defina a variável de ambiente e refaça o deploy."
    );
  }
  return "dev-somente-local-nao-usar-em-producao";
}
const COOKIE = "sessao";

// ===== Perfis =====
export type Perfil =
  | "ADMIN"
  | "MARKETING"
  | "COORDENACAO"
  | "CANDIDATO"
  | "LIDER"
  | "ATENDENTE";

export const ROTULO_PERFIL: Record<Perfil, string> = {
  ADMIN: "Administrador",
  MARKETING: "Marketing",
  COORDENACAO: "Coordenação",
  CANDIDATO: "Candidato",
  LIDER: "Líder",
  ATENDENTE: "Atendente",
};

export type Sessao = {
  uid: number;
  nome: string;
  perfil: Perfil;
  // Já passou pela tela de boas-vindas do 1º acesso.
  onboarded?: boolean;
  // Isolamento por candidato: nome do candidato do escopo + agentes dele.
  // Setado no login p/ CANDIDATO ou usuário com candidato_escopo (equipe). ADMIN nunca tem.
  escopoCandidato?: string;
  escopoAgentes?: number[];
};

// ===== Cookie assinado (HMAC) =====
function assinar(payload: string): string {
  return crypto.createHmac("sha256", segredo()).update(payload).digest("base64url");
}

// Validade da sessão (30 dias). Vai ASSINADA no token (não dá p/ o cliente
// esticar) — diferente do maxAge do cookie, que o cliente controla.
const VALIDADE_MS = 60 * 60 * 24 * 30 * 1000;

export function criarTokenSessao(s: Sessao): string {
  const corpo = { ...s, __exp: Date.now() + VALIDADE_MS };
  const payload = Buffer.from(JSON.stringify(corpo)).toString("base64url");
  return `${payload}.${assinar(payload)}`;
}

export function lerTokenSessao(token?: string): Sessao | null {
  if (!token) return null;
  const [payload, assinatura] = token.split(".");
  if (!payload || !assinatura) return null;
  // Comparação em tempo constante (não vaza a assinatura pelo tempo de resposta).
  const esperada = Buffer.from(assinar(payload));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !crypto.timingSafeEqual(esperada, recebida)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    // Expiração assinada: token vencido não vale, mesmo com HMAC correto.
    if (obj && typeof obj.__exp === "number" && Date.now() > obj.__exp) return null;
    if (obj) delete obj.__exp;
    return obj;
  } catch {
    return null;
  }
}

// ===== Helpers de servidor =====
export function getSessao(): Sessao | null {
  const token = cookies().get(COOKIE)?.value;
  return lerTokenSessao(token);
}

export function definirCookieSessao(s: Sessao) {
  cookies().set(COOKIE, criarTokenSessao(s), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // só HTTPS em produção
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function limparCookieSessao() {
  cookies().delete(COOKIE);
}

export const COOKIE_NOME = COOKIE;
