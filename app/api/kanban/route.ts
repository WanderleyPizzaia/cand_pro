import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { getConfig, setConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "MARKETING", "COORDENACAO"];
const PADRAO = ["Aberta", "Em andamento", "Concluída", "Cancelada"];

function ok() {
  const s = getSessao();
  return s && PERFIS_OK.includes(s.perfil) ? s : null;
}

async function lerColunas(): Promise<string[]> {
  const raw = await getConfig("KANBAN_COLUNAS");
  try {
    const c = raw ? JSON.parse(raw) : null;
    if (Array.isArray(c) && c.length > 0)
      return c.map((x) => String(x)).filter(Boolean);
  } catch {
    /* ignora */
  }
  return PADRAO;
}

// GET -> colunas do kanban de Tarefas/Demandas
export async function GET() {
  if (!ok()) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  return NextResponse.json({ colunas: await lerColunas() });
}

// POST { colunas: string[] } -> salva a configuração de colunas
export async function POST(req: NextRequest) {
  if (!ok()) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  let colunas = Array.isArray(b.colunas) ? b.colunas : [];
  colunas = colunas
    .map((x: any) => String(x ?? "").trim())
    .filter((x: string) => x.length > 0)
    .slice(0, 12);
  if (colunas.length === 0)
    return NextResponse.json({ erro: "Defina ao menos uma coluna." }, { status: 400 });
  await setConfig("KANBAN_COLUNAS", JSON.stringify(colunas));
  return NextResponse.json({ ok: true, colunas });
}
