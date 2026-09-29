import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { assinaturaMidia } from "@/lib/instagram";

export const dynamic = "force-dynamic";

// GET /api/midia/<id>?s=<assinatura> -> arquivo da galeria SEM login, para o
// Instagram baixar a imagem que a IA mandou (ele só aceita link público). A
// assinatura vale para aquele arquivo e nenhum outro; arquivo removido da
// galeria deixa de ser servido.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const s = new URL(req.url).searchParams.get("s") || "";
  if (!id || !s) return new NextResponse("Não encontrado", { status: 404 });
  const esperado = await assinaturaMidia(id);
  if (s.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(esperado)))
    return new NextResponse("Não encontrado", { status: 404 });

  const a = await queryOne<{ mime: string; nome_arquivo: string | null; conteudo: string | null; url: string | null }>(
    "SELECT mime, nome_arquivo, conteudo, url FROM agente_arquivos WHERE id = $1 AND removido_em IS NULL",
    [id]
  );
  if (!a) return new NextResponse("Não encontrado", { status: 404 });
  if (a.url) return NextResponse.redirect(a.url);
  const nome = (a.nome_arquivo || "arquivo").replace(/"/g, "");
  return new NextResponse(Buffer.from(a.conteudo || "", "base64"), {
    headers: {
      "Content-Type": a.mime,
      "Content-Disposition": `inline; filename="${nome}"`,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
