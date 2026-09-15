import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { getConfig, setConfig } from "@/lib/config";
import { CRISE_VAZIA, EstadoCrise, CHECKLIST_CRISE } from "@/lib/assessoria";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO"];

function sessaoOk() {
  const s = getSessao();
  return s && PERFIS_OK.includes(s.perfil) ? s : null;
}

// Estado da crise é por gabinete: equipe + candidato do mesmo escopo veem o mesmo.
function chave(s: NonNullable<ReturnType<typeof getSessao>>) {
  const escopo = s.escopoCandidato || (s.perfil === "ADMIN" ? "GLOBAL" : s.nome || "GLOBAL");
  return "CRISE_ESTADO:" + escopo;
}

async function ler(k: string): Promise<EstadoCrise> {
  const raw = await getConfig(k);
  if (!raw) return { ...CRISE_VAZIA };
  try {
    const o = JSON.parse(raw);
    return { ...CRISE_VAZIA, ...o };
  } catch {
    return { ...CRISE_VAZIA };
  }
}

export async function GET() {
  const s = sessaoOk();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  return NextResponse.json({ estado: await ler(chave(s)) });
}

// POST { acao: "ativar"|"atualizar"|"encerrar", ...campos }
export async function POST(req: NextRequest) {
  const s = sessaoOk();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const k = chave(s);
  const b = await req.json().catch(() => ({}));
  const atual = await ler(k);
  const agora = new Date().toISOString();

  const idsChecklist = CHECKLIST_CRISE.map((c) => c.id);
  const feitos = Array.isArray(b.feitos)
    ? b.feitos.map((x: any) => String(x)).filter((x: string) => idsChecklist.includes(x))
    : atual.feitos;

  let estado: EstadoCrise;
  if (b.acao === "encerrar") {
    estado = { ...CRISE_VAZIA };
  } else if (b.acao === "ativar") {
    estado = {
      ativa: true,
      severidade: String(b.severidade || atual.severidade || "media"),
      titulo: String(b.titulo || "").slice(0, 200),
      nota: String(b.nota || "").slice(0, 6000),
      portaVoz: String(b.portaVoz || "").slice(0, 120),
      feitos,
      iniciadaEm: atual.iniciadaEm || agora,
      atualizadoEm: agora,
    };
  } else {
    // atualizar
    estado = {
      ...atual,
      ativa: atual.ativa || b.ativa === true,
      severidade: b.severidade != null ? String(b.severidade) : atual.severidade,
      titulo: b.titulo != null ? String(b.titulo).slice(0, 200) : atual.titulo,
      nota: b.nota != null ? String(b.nota).slice(0, 6000) : atual.nota,
      portaVoz: b.portaVoz != null ? String(b.portaVoz).slice(0, 120) : atual.portaVoz,
      feitos,
      iniciadaEm: atual.iniciadaEm || (atual.ativa ? agora : null),
      atualizadoEm: agora,
    };
  }

  await setConfig(k, JSON.stringify(estado));
  return NextResponse.json({ ok: true, estado });
}
