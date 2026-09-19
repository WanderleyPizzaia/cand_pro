import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { backfillGeo } from "@/lib/geo";
import { agentesDaSessao } from "@/lib/escopo";

export const dynamic = "force-dynamic";

// GET /api/lideranca -> dados do Mapa de Lideranças.
// Mapa = lideranças (pessoas categoria 'Liderança') por cidade.
// Ranking = usuários que mais captaram cadastros (indicador de liderança).
export async function GET() {
  const sessao = getSessao();
  if (!sessao) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });

  const ehLider = sessao.perfil === "LIDER";
  const meus = await agentesDaSessao(sessao);
  const bound = meus !== null;
  const escLider = ehLider ? `AND criado_por = '${sessao.uid}'` : "";
  // Vinculado: escopa aos agentes do seu candidato.
  const escAgente = bound
    ? `AND agente_id IN (${(meus!.length ? meus! : [-1]).join(",")})`
    : "";

  try {
    await backfillGeo();
  } catch (e) {
    console.error("[lideranca] backfillGeo", (e as Error).message);
  }

  // Pontos do mapa: lideranças por cidade (com coordenadas)
  const pontos = await query<{
    cidade: string;
    regiao: string | null;
    lat: number;
    lng: number;
    total: number;
  }>(
    `SELECT cidade, regiao, lat, lng, COUNT(*) as total
       FROM pessoas
      WHERE categoria = 'Liderança' AND lat IS NOT NULL AND lng IS NOT NULL ${escLider} ${escAgente}
      GROUP BY cidade, regiao, lat, lng
      ORDER BY total DESC`
  );

  // Ranking dos líderes que mais captam (por cadastros criados).
  const ranking = await query<{
    id: number;
    nome: string;
    perfil: string;
    total: number;
    cidades: number;
  }>(
    `SELECT u.id, u.nome, u.perfil,
        COUNT(p.id) AS total,
        COUNT(DISTINCT p.cidade) AS cidades
     FROM pessoas p
     JOIN usuarios u ON u.id = CASE WHEN p.criado_por ~ '^[0-9]+$' THEN p.criado_por::bigint END
    WHERE p.criado_por IS NOT NULL
      ${ehLider ? `AND p.criado_por = '${sessao.uid}'` : ""}
    GROUP BY u.id, u.nome, u.perfil
    ORDER BY total DESC, u.nome
    LIMIT 15`
  );

  const totalLiderancas =
    (
      await queryOne<{ c: number }>(
        `SELECT COUNT(*) c FROM pessoas WHERE categoria = 'Liderança' ${escLider} ${escAgente}`
      )
    )?.c ?? 0;

  const totalLideresAtivos =
    (
      await queryOne<{ c: number }>(
        "SELECT COUNT(*) c FROM usuarios WHERE perfil = 'LIDER' AND ativo = 1"
      )
    )?.c ?? 0;

  return NextResponse.json({
    pontos,
    ranking,
    resumo: {
      totalLiderancas,
      totalLideresAtivos,
      totalCidades: pontos.length,
    },
  });
}
