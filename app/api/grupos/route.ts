import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { getConfig, setConfig } from "@/lib/config";
import { agentesDoCandidato } from "@/lib/metas";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO"];
const PODE = ["ADMIN", "MARKETING", "COORDENACAO"];

type Grupo = { nome: string; tipo: string; categoria: string; agentePosta?: boolean };

const PADRAO: Grupo[] = [
  { nome: "Sociedade Civil", tipo: "sociedade-civil", categoria: "Sociedade Civil", agentePosta: false },
  { nome: "Sociedade Pública", tipo: "sociedade-publica", categoria: "Sociedade Pública", agentePosta: false },
  { nome: "Parceiros", tipo: "parceiros", categoria: "Parceiro", agentePosta: false },
  { nome: "Eleitores", tipo: "eleitores", categoria: "Eleitor", agentePosta: false },
];

function escopoDe(s: NonNullable<ReturnType<typeof getSessao>>) {
  return s.escopoCandidato || (s.perfil === "CANDIDATO" ? s.nome : "GLOBAL");
}

async function lerGrupos(escopo: string): Promise<Grupo[]> {
  const raw = await getConfig("GRUPOS:" + escopo);
  try { const g = raw ? JSON.parse(raw) : null; if (Array.isArray(g) && g.length) return g; } catch {}
  return PADRAO;
}

export async function GET() {
  const s = getSessao();
  if (!s || !PERFIS_OK.includes(s.perfil)) return NextResponse.json({ erro: "negado" }, { status: 403 });
  const escopo = escopoDe(s);
  const grupos = await lerGrupos(escopo);
  const ids = await agentesDoCandidato(escopo, s.uid).catch(() => [] as number[]);

  let base = 0;
  const comCount = [] as (Grupo & { total: number })[];
  if (ids && ids.length) {
    base = Number((await queryOne<{ c: string }>("SELECT COUNT(*) c FROM pessoas WHERE agente_id = ANY($1)", [ids]))?.c ?? 0);
    for (const g of grupos) {
      const c = Number((await queryOne<{ c: string }>("SELECT COUNT(*) c FROM pessoas WHERE agente_id = ANY($1) AND categoria = $2", [ids, g.categoria]))?.c ?? 0);
      comCount.push({ ...g, total: c });
    }
  } else {
    for (const g of grupos) comCount.push({ ...g, total: 0 });
  }
  return NextResponse.json({ grupos: comCount, base, podeEditar: PODE.includes(s.perfil) });
}

// POST { grupos: Grupo[] } salva a organização das comunidades.
export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !PODE.includes(s.perfil)) return NextResponse.json({ erro: "negado" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  let grupos = Array.isArray(b.grupos) ? b.grupos : [];
  grupos = grupos
    .map((g: any) => ({ nome: String(g.nome || "").trim(), tipo: String(g.tipo || "custom").trim(), categoria: String(g.categoria || g.nome || "").trim(), agentePosta: !!g.agentePosta }))
    .filter((g: Grupo) => g.nome && g.categoria)
    .slice(0, 20);
  if (!grupos.length) return NextResponse.json({ erro: "Defina ao menos um grupo." }, { status: 400 });
  await setConfig("GRUPOS:" + escopoDe(s), JSON.stringify(grupos));
  return NextResponse.json({ ok: true });
}
