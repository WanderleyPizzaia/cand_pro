import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getSessao } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/campanhas/preview -> conta destinatários (pessoas com WhatsApp)
//   { busca } -> busca até 8 contatos da base (nome/número) p/ envio pontual
export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !["ADMIN", "COORDENACAO"].includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json();
  const cidade = (b.cidade ?? "").toString().trim();
  const categoria = (b.categoria ?? "").toString().trim();
  const busca = (b.busca ?? "").toString().trim();

  // Envio pontual: busca um contato específico já cadastrado (por nome ou número).
  if (busca) {
    const contatos = await query<{ id: number; nome: string; whatsapp: string; cidade: string }>(
      `SELECT id, nome, whatsapp, cidade FROM pessoas
        WHERE whatsapp IS NOT NULL AND whatsapp <> ''
          AND (nome ILIKE $1 OR whatsapp ILIKE $1)
        ORDER BY nome LIMIT 8`,
      [`%${busca}%`]
    );
    return NextResponse.json({ contatos });
  }

  const params: any[] = [];
  let where = "whatsapp IS NOT NULL AND whatsapp <> ''";
  if (cidade) {
    params.push(cidade);
    where += ` AND cidade = $${params.length}`;
  }
  if (categoria) {
    params.push(categoria);
    where += ` AND categoria = $${params.length}`;
  }

  // Conta NÚMEROS distintos (dedup por dígitos), igual ao envio, para não
  // inflar com contatos repetidos das importações.
  const total =
    (await queryOne<{ c: number }>(
      `SELECT COUNT(DISTINCT regexp_replace(COALESCE(whatsapp,''),'\\D','','g')) c
         FROM pessoas WHERE ${where}`,
      params
    ))?.c ?? 0;

  return NextResponse.json({ total });
}
