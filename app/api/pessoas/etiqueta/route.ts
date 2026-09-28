import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { agentesDaSessao } from "@/lib/escopo";
import { gravarEtiqueta } from "@/lib/atendimento";
import { ehEtiqueta, etiquetasValidas, opostaDe } from "@/lib/etiquetas";

export const dynamic = "force-dynamic";

// POST /api/pessoas/etiqueta { id, etiqueta, ligar } -> marca/desmarca uma
// etiqueta no contato. Mesmo escopo da lista de Contatos: líder só nos que
// cadastrou; equipe vinculada só nos contatos dos seus números.
export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });
  if (!ehEtiqueta(b.etiqueta))
    return NextResponse.json({ erro: "Etiqueta inválida." }, { status: 400 });

  const p = await queryOne<{ agente_id: number | null; criado_por: string | null }>(
    "SELECT agente_id, criado_por FROM pessoas WHERE id = $1",
    [id]
  );
  if (!p) return NextResponse.json({ erro: "Contato não encontrado." }, { status: 404 });

  if (s.perfil === "LIDER") {
    if (p.criado_por !== String(s.uid))
      return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  } else {
    const meus = await agentesDaSessao(s);
    if (meus !== null && (p.agente_id == null || !meus.includes(p.agente_id)))
      return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  }

  const finais = await gravarEtiqueta(id, b.etiqueta, opostaDe(b.etiqueta), b.ligar !== false);
  return NextResponse.json({ ok: true, etiquetas: etiquetasValidas(finais) });
}
