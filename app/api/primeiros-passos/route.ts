import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { agenteIdDoUsuario } from "@/lib/agenteUsuario";

export const dynamic = "force-dynamic";

// Status do preenchimento do gabinete pelo candidato/equipe (checklist do onboarding).
export async function GET(req: NextRequest) {
  const s = getSessao();
  if (!s) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });
  const gestor = ["ADMIN", "COORDENACAO", "MARKETING"].includes(s.perfil);
  if (!gestor && s.perfil !== "CANDIDATO")
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const q = Number(new URL(req.url).searchParams.get("id"));
  const id = (gestor && q) || (await agenteIdDoUsuario(s.uid, s.nome));
  if (!id) return NextResponse.json({ erro: "Sem gabinete vinculado." }, { status: 404 });

  const ag = await queryOne<{ candidato: string; instancia: string | null; provedor: string; tem_meta: boolean }>(
    "SELECT candidato, instancia, provedor, (meta_token IS NOT NULL) AS tem_meta FROM agentes WHERE id = $1",
    [id]
  );
  const treino = await queryOne<{ c: number }>(
    "SELECT COUNT(*) c FROM agente_conhecimento WHERE agente_id = $1",
    [id]
  );
  const matriz = await queryOne<{ c: number }>(
    "SELECT COUNT(*) c FROM matriz_politica WHERE agente_id = $1",
    [id]
  );

  const whatsapp = ag ? (ag.provedor === "meta" ? !!ag.tem_meta : !!ag.instancia) : false;
  return NextResponse.json({
    candidato: ag?.candidato || "",
    passos: {
      assistente: (treino?.c ?? 0) > 0, // treinou a persona ao menos uma vez
      posicionamento: (matriz?.c ?? 0) > 0, // definiu a matriz
      whatsapp, // número conectado (Evolution) ou credenciais Meta
    },
  });
}
