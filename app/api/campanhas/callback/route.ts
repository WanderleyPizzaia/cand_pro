import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute } from "@/lib/db";
import { conferirToken } from "@/lib/config";

export const dynamic = "force-dynamic";

// Callback PÚBLICO chamado pelo n8n durante/ao fim de um disparo em massa.
// Fecha o gap do modo síncrono: o resultado por contato volta para
// `mensagens (origem='campanha')` e os contadores da linha `campanhas` são
// atualizados de forma incremental. Protegido pelo token compartilhado (N8N_TOKEN).
//
// Corpo esperado (lote ou item único):
// {
//   campanha_id: number,
//   token?: string,                 // alternativa ao header X-Candpro-Token
//   concluido?: boolean,            // marca a campanha como 'enviada' ao final
//   resultados: [
//     { numero, nome?, ok, wa_id?, texto?, erro? }
//   ]
// }
export async function POST(req: NextRequest) {
  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido" }, { status: 400 });
  }

  // Segurança: token OBRIGATÓRIO. Sem N8N_TOKEN configurado, recusa.
  const token = await conferirToken(
    "N8N_TOKEN",
    (req.headers.get("x-candpro-token") || b?.token || "").toString()
  );
  if (token !== "ok")
    return NextResponse.json(
      { erro: token === "ausente" ? "N8N_TOKEN não configurado" : "Não autorizado" },
      { status: token === "ausente" ? 503 : 401 }
    );

  const campanhaId = Number(b?.campanha_id);
  if (!campanhaId)
    return NextResponse.json({ erro: "campanha_id ausente" }, { status: 400 });

  const campanha = await queryOne<{ id: number; agente_id: number | null }>(
    "SELECT id, agente_id FROM campanhas WHERE id = $1",
    [campanhaId]
  );
  if (!campanha)
    return NextResponse.json({ erro: "Campanha não encontrada" }, { status: 404 });

  const resultados = Array.isArray(b?.resultados) ? b.resultados : [];
  let enviados = 0;
  let falhas = 0;

  for (const r of resultados) {
    const numero = (r?.numero ?? "").toString();
    if (!numero) continue;
    const ok = !!r?.ok;
    if (ok) enviados++;
    else falhas++;
    await execute(
      `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, wa_id, origem, campanha_id)
       VALUES ($1,$2,$3,$4,$5,$6,'campanha',$7)`,
      [
        campanha.agente_id,
        numero,
        r?.nome || null,
        ok ? "out" : "erro",
        ok ? (r?.texto || "[disparo]") : `Campanha falhou: ${r?.erro || "erro"}`,
        r?.wa_id || null,
        campanhaId,
      ]
    );
  }

  // Atualização incremental dos contadores (+ status final quando concluído).
  const concluido = !!b?.concluido;
  await execute(
    `UPDATE campanhas
        SET enviados = enviados + $1,
            falhas   = falhas + $2,
            status   = CASE WHEN $3 THEN 'enviada' ELSE status END
      WHERE id = $4`,
    [enviados, falhas, concluido, campanhaId]
  );

  return NextResponse.json({ ok: true, registrados: resultados.length, enviados, falhas });
}
