import crypto from "crypto";

// Hash de senha com scrypt (modulo puro, sem dependencia de next/headers)
export function hashSenha(senha: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function conferirSenha(senha: string, armazenado: string): boolean {
  const [salt, hash] = armazenado.split(":");
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(senha, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(calc, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
