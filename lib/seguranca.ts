import crypto from "crypto";
import type { NextRequest } from "next/server";
import { queryOne, execute } from "./db";

// ============================================================
// Utilitários de segurança das rotas: comparação de tokens em tempo
// constante, IP do cliente e limite de tentativas de login. O limite fica no
// Postgres porque na Vercel cada instância tem a própria memória.
// ============================================================

// Compara dois segredos sem vazar, pelo tempo de resposta, quantos caracteres
// batem. Vazio nunca confere (token não configurado = acesso negado).
export function tokenConfere(
  recebido: string | null | undefined,
  esperado: string | null | undefined
): boolean {
  const a = Buffer.from(String(recebido ?? "").trim());
  const b = Buffer.from(String(esperado ?? "").trim());
  if (!a.length || !b.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// IP de quem chamou (Vercel/proxies preenchem x-forwarded-for).
export function ipDoCliente(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  return (xff.split(",")[0] || req.headers.get("x-real-ip") || "desconhecido").trim();
}

// ===== Limite de tentativas de login =====
// Três contadores por janela de 15 min:
//  - conta:<email>|<ip>  5 falhas  -> bloqueia aquele e-mail naquele IP
//  - email:<email>      15 falhas  -> freia ataque a uma conta vindo de vários IPs
//  - ip:<ip>            30 falhas  -> freia um IP testando vários e-mails
const JANELA_MIN = 15;

function chaves(email: string, ip: string): [string, number][] {
  return [
    [`conta:${email}|${ip}`, 5],
    [`email:${email}`, 15],
    [`ip:${ip}`, 30],
  ];
}

// Minutos restantes de bloqueio (0 = liberado).
export async function loginBloqueado(email: string, ip: string): Promise<number> {
  const r = await queryOne<{ min: number | null }>(
    `SELECT CEIL(EXTRACT(EPOCH FROM (MAX(bloqueado_ate) - now())) / 60)::int AS min
       FROM login_tentativas
      WHERE chave = ANY($1::text[]) AND bloqueado_ate > now()`,
    [chaves(email, ip).map(([c]) => c)]
  );
  return r?.min && r.min > 0 ? r.min : 0;
}

// Registra uma senha errada e bloqueia os contadores que passaram do limite.
export async function registrarFalhaLogin(email: string, ip: string): Promise<void> {
  for (const [chave, max] of chaves(email, ip)) {
    await execute(
      `INSERT INTO login_tentativas (chave, falhas, janela_inicio)
       VALUES ($1, 1, now())
       ON CONFLICT (chave) DO UPDATE SET
         falhas = CASE WHEN login_tentativas.janela_inicio < now() - make_interval(mins => $2::int)
                       THEN 1 ELSE login_tentativas.falhas + 1 END,
         janela_inicio = CASE WHEN login_tentativas.janela_inicio < now() - make_interval(mins => $2::int)
                              THEN now() ELSE login_tentativas.janela_inicio END`,
      [chave, JANELA_MIN]
    );
    await execute(
      `UPDATE login_tentativas SET bloqueado_ate = now() + make_interval(mins => $2::int)
        WHERE chave = $1 AND falhas >= $3::int`,
      [chave, JANELA_MIN, max]
    );
  }
}

// Login certo zera os contadores daquela conta (o do IP continua valendo).
export async function limparFalhasLogin(email: string, ip: string): Promise<void> {
  await execute("DELETE FROM login_tentativas WHERE chave = ANY($1::text[])", [
    [`conta:${email}|${ip}`, `email:${email}`],
  ]);
}
