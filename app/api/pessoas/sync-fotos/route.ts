import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/pessoas/sync-fotos
// Busca foto de perfil do WhatsApp para contatos sem foto.
// Processa em lotes de 20 para não ultrapassar o timeout do Vercel.
// Idempotente: pula quem já tem foto base64.
export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !["ADMIN", "COORDENACAO"].includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const offset = Number(b.offset) || 0;
  const limite = 20;

  const base = (await getConfig("EVOLUTION_URL")).replace(/\/$/, "");

  // Busca agentes com instância e apikey para mapear agente_id → instancia/apikey
  const agentes = await query<{ id: number; instancia: string; apikey: string | null }>(
    "SELECT id, instancia, apikey FROM agentes WHERE instancia IS NOT NULL"
  );
  const mapaAgente = new Map(agentes.map((a) => [a.id, a]));

  // Contatos sem foto (ou com foto expirada), com número WhatsApp e agente conhecido
  const pessoas = await query<{ id: number; whatsapp: string; agente_id: number }>(
    `SELECT id, whatsapp, agente_id FROM pessoas
     WHERE whatsapp IS NOT NULL AND agente_id IS NOT NULL
       AND (foto IS NULL OR foto NOT LIKE 'data:image%')
     ORDER BY id
     LIMIT $1 OFFSET $2`,
    [limite, offset]
  );

  const total = (await queryOne<{ c: number }>(
    `SELECT COUNT(*)::int c FROM pessoas
     WHERE whatsapp IS NOT NULL AND agente_id IS NOT NULL
       AND (foto IS NULL OR foto NOT LIKE 'data:image%')`
  ))?.c ?? 0;

  let atualizadas = 0;
  let erros = 0;

  for (const p of pessoas) {
    const agente = mapaAgente.get(p.agente_id);
    if (!agente) continue;

    const apikey = agente.apikey || (await getConfig("EVOLUTION_APIKEY"));
    if (!base || !apikey) continue;

    try {
      // 1. Busca URL da foto de perfil na Evolution
      const fotoRes = await fetch(
        `${base}/chat/fetchProfilePictureUrl/${agente.instancia}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey },
          body: JSON.stringify({ number: p.whatsapp }),
          signal: AbortSignal.timeout(5000),
        }
      );
      if (!fotoRes.ok) { erros++; continue; }
      const fotoData = await fotoRes.json();
      const url = fotoData?.profilePictureUrl;
      if (!url) { erros++; continue; }

      // 2. Baixa a imagem e converte para base64 (permanente)
      const imgRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!imgRes.ok) { erros++; continue; }
      const tipo = imgRes.headers.get("content-type") || "image/jpeg";
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const base64 = `data:${tipo};base64,${buf.toString("base64")}`;

      await execute("UPDATE pessoas SET foto = $1 WHERE id = $2", [base64, p.id]);
      atualizadas++;
    } catch {
      erros++;
    }
  }

  return NextResponse.json({
    ok: true,
    atualizadas,
    erros,
    processadas: pessoas.length,
    pendentes: Math.max(0, total - offset - pessoas.length),
    proximoOffset: offset + pessoas.length,
  });
}
