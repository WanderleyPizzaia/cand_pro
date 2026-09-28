import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { agentesDaSessao } from "@/lib/escopo";

export const dynamic = "force-dynamic";

// GET /api/galeria/<id> -> o arquivo em si (miniatura na galeria e bolha da
// conversa). Vê quem enxerga as conversas daquele número.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = getSessao();
  if (!s) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });
  const id = Number(params.id);
  if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });

  const a = await queryOne<{
    agente_id: number;
    mime: string;
    nome_arquivo: string | null;
    conteudo: string | null;
    url: string | null;
  }>("SELECT agente_id, mime, nome_arquivo, conteudo, url FROM agente_arquivos WHERE id = $1", [id]);
  if (!a) return NextResponse.json({ erro: "Arquivo não encontrado" }, { status: 404 });

  const escopo = await agentesDaSessao(s);
  if (escopo && !escopo.includes(a.agente_id))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  if (a.url) return NextResponse.redirect(a.url);
  const nome = (a.nome_arquivo || "arquivo").replace(/"/g, "");
  return new NextResponse(Buffer.from(a.conteudo || "", "base64"), {
    headers: {
      "Content-Type": a.mime,
      "Content-Disposition": `inline; filename="${nome}"`,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
