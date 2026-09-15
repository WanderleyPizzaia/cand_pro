import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { getConfig, setConfig } from "@/lib/config";
import { FUNCOES } from "@/lib/opcoes";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "COORDENACAO"];
const PADRAO = [...FUNCOES]; // seed inicial (mesma lista que era fixa no código)

// Lê a lista de cargos/funções configurável (fallback = PADRAO).
async function lerFuncoes(): Promise<string[]> {
  const raw = await getConfig("FUNCOES_CARGO");
  try {
    const c = raw ? JSON.parse(raw) : null;
    if (Array.isArray(c) && c.length > 0) return c.map((x) => String(x)).filter(Boolean);
  } catch {
    /* ignora */
  }
  return PADRAO;
}

// GET -> lista de cargos (qualquer sessão pode ler; o form de cadastro usa).
export async function GET() {
  const s = getSessao();
  if (!s) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });
  return NextResponse.json({ funcoes: await lerFuncoes() });
}

// POST { funcoes: string[] } -> salva a lista (ADMIN/COORDENAÇÃO).
export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !PERFIS_OK.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  let funcoes: string[] = Array.isArray(b.funcoes) ? b.funcoes : [];
  // Normaliza: trim, remove vazios e duplicados, teto de 40.
  const vistos = new Set<string>();
  funcoes = funcoes
    .map((x: any) => String(x ?? "").trim())
    .filter((x) => x.length > 0 && !vistos.has(x.toLowerCase()) && vistos.add(x.toLowerCase()))
    .slice(0, 40);
  if (funcoes.length === 0)
    return NextResponse.json({ erro: "Defina ao menos um cargo." }, { status: 400 });
  // Garante "Outro" sempre no fim (para o campo livre "qual").
  funcoes = funcoes.filter((x) => x.toLowerCase() !== "outro");
  funcoes.push("Outro");

  await setConfig("FUNCOES_CARGO", JSON.stringify(funcoes));
  return NextResponse.json({ ok: true, funcoes });
}
