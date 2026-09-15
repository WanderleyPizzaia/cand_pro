import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { backfillGeo, backfillGeoPorTelefone } from "@/lib/geo";

export const dynamic = "force-dynamic";
// O backfill de geo pode segurar a request; sem isto a rota herda o default da
// Vercel (~10-15s) e ESTOURA em cold start -> o mapa volta vazio.
export const maxDuration = 60;

// GET /api/mapa?cidade=&agente=  -> dados agregados para o Mapa de Votos.
// (Líder vê apenas os próprios cadastros.) O filtro de cidade afeta os
// indicadores; o filtro de candidato (agente) afeta mapa + indicadores.
export async function GET(req: NextRequest) {
  const sessao = getSessao();
  if (!sessao) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });

  const url = new URL(req.url);
  const cidade = (url.searchParams.get("cidade") ?? "").trim();
  const agenteRaw = (url.searchParams.get("agente") ?? "").trim();
  const agente = /^\d+$/.test(agenteRaw) ? Number(agenteRaw) : null; // só inteiro
  const ehLider = sessao.perfil === "LIDER";
  // Isolamento: candidato/equipe vinculado só vê os agentes do seu terreno (ignora ?agente da URL).
  const bound = sessao.perfil !== "ADMIN" && !!sessao.escopoAgentes;
  // Só o ADMIN enxerga o cruzamento de todos os candidatos ("Todos os candidatos").
  // Candidato/equipe: mapa exclusivo do seu gabinete (nunca vê o do outro).
  const ehGlobal = sessao.perfil === "ADMIN";
  const escLider = ehLider ? `AND criado_por = '${sessao.uid}'` : "";
  // `agente` é validado como inteiro acima -> seguro interpolar.
  const escAgente = bound
    ? `AND agente_id IN (${(sessao.escopoAgentes!.length ? sessao.escopoAgentes! : [-1]).join(",")})`
    : agente
    ? `AND agente_id = ${agente}`
    : "";

  // Auto-cura THROTTLED: preenche coordenadas de contatos sem lat/lng, mas no
  // máximo 1x a cada 10min (marca no `config`). Antes rodava a CADA request e,
  // em cold start, estourava o timeout -> mapa vazio. A marca é gravada ANTES
  // de rodar: se o backfill demorar, a próxima request pula e o mapa carrega.
  try {
    const JANELA = 10 * 60 * 1000;
    const ultimo = await queryOne<{ valor: string }>(
      "SELECT valor FROM config WHERE chave = 'mapa_backfill_em'"
    );
    if (Date.now() - (ultimo ? Number(ultimo.valor) : 0) > JANELA) {
      await execute(
        `INSERT INTO config (chave, valor) VALUES ('mapa_backfill_em', $1)
         ON CONFLICT (chave) DO UPDATE SET valor = $1`,
        [String(Date.now())]
      );
      await backfillGeo(300);
      await backfillGeoPorTelefone(500);
    }
  } catch (e) {
    console.error("[mapa] backfill", (e as Error).message);
  }

  // Lista de candidatos para o filtro. Isolamento: bound só vê os seus agentes.
  const filtroAgLista = bound
    ? `AND a.id IN (${(sessao.escopoAgentes!.length ? sessao.escopoAgentes! : [-1]).join(",")})`
    : "";
  const agentes = await query<{ id: number; candidato: string; total: number }>(
    `SELECT a.id, a.candidato, COUNT(p.id) AS total
       FROM agentes a
       JOIN pessoas p ON p.agente_id = a.id
      WHERE 1=1 ${ehLider ? `AND p.criado_por = '${sessao.uid}'` : ""} ${filtroAgLista}
      GROUP BY a.id, a.candidato
      ORDER BY total DESC`
  );

  // Pontos do mapa (todas as cidades do escopo, p/ contexto geográfico)
  const pontos = await query<{
    cidade: string;
    regiao: string | null;
    lat: number;
    lng: number;
    total: number;
  }>(
    `SELECT cidade, regiao, lat, lng, COUNT(*) as total
       FROM pessoas
      WHERE lat IS NOT NULL AND lng IS NOT NULL ${escLider} ${escAgente}
      GROUP BY cidade, regiao, lat, lng
      ORDER BY total DESC`
  );

  // Pautas geolocalizadas (acolhimento): mesma escala de escopo por agente.
  // Agrupa por cidade/lat/lng com o tema predominante (mode).
  const pautas = await query<{
    cidade: string | null;
    bairro: string | null;
    lat: number;
    lng: number;
    total: number;
    tema_top: string | null;
  }>(
    `SELECT cidade, bairro, lat, lng, COUNT(*) AS total,
            mode() WITHIN GROUP (ORDER BY tema) AS tema_top
       FROM pautas
      WHERE lat IS NOT NULL AND lng IS NOT NULL ${escAgente}
      GROUP BY cidade, bairro, lat, lng
      ORDER BY total DESC`
  );

  // Lista de cidades p/ o dropdown de filtro
  const cidades = await query<{ cidade: string }>(
    `SELECT DISTINCT cidade FROM pessoas
      WHERE cidade IS NOT NULL AND cidade <> '' ${escLider} ${escAgente}
      ORDER BY cidade`
  );

  // Indicadores do painel - escopados pela cidade selecionada (se houver)
  const params: any[] = [];
  let filtroCidade = "";
  if (cidade) {
    params.push(cidade);
    filtroCidade = `AND cidade = $1`;
  }

  const totalCadastros =
    (
      await queryOne<{ c: number }>(
        `SELECT COUNT(*) c FROM pessoas WHERE 1=1 ${escLider} ${escAgente} ${filtroCidade}`,
        params
      )
    )?.c ?? 0;

  const totalLideres =
    (
      await queryOne<{ c: number }>(
        `SELECT COUNT(*) c FROM pessoas WHERE categoria = 'Liderança' ${escLider} ${escAgente} ${filtroCidade}`,
        params
      )
    )?.c ?? 0;

  // Honestidade do mapa: quantos pontos são por CIDADE informada (confirmado)
  // vs estimados pela região do DDD do telefone (aproximado).
  const geoOrigem = await queryOne<{ confirmados: number; estimados: number }>(
    `SELECT
        COALESCE(SUM(CASE WHEN geo_origem = 'cidade' THEN 1 ELSE 0 END), 0)::int confirmados,
        COALESCE(SUM(CASE WHEN geo_origem = 'ddd'    THEN 1 ELSE 0 END), 0)::int estimados
       FROM pessoas
      WHERE lat IS NOT NULL ${escLider} ${escAgente} ${filtroCidade}`,
    params
  );

  // Demandas (escopo por cidade; líder não acessa demandas, mas mantemos seguro)
  const totalDemandas =
    (
      await queryOne<{ c: number }>(
        `SELECT COUNT(*) c FROM demandas WHERE 1=1 ${cidade ? "AND cidade = $1" : ""}`,
        cidade ? [cidade] : []
      )
    )?.c ?? 0;

  // Pessoas por grupo (categoria)
  const porGrupo = await query<{ grupo: string; total: number }>(
    `SELECT COALESCE(NULLIF(categoria, ''), 'Sem categoria') AS grupo, COUNT(*) AS total
       FROM pessoas
      WHERE 1=1 ${escLider} ${escAgente} ${filtroCidade}
      GROUP BY grupo
      ORDER BY total DESC`,
    params
  );

  const totalCidades = cidade ? 1 : cidades.length;

  return NextResponse.json({
    pontos,
    pautas,
    cidades: cidades.map((c) => c.cidade),
    agentes,
    ehGlobal,
    resumo: {
      totalCadastros,
      totalCidades,
      totalLideres,
      totalDemandas,
      confirmados: geoOrigem?.confirmados ?? 0,
      estimados: geoOrigem?.estimados ?? 0,
      porGrupo,
      topCidades: pontos.slice(0, 10),
    },
  });
}
