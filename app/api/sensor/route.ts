import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { agentesDoCandidato } from "@/lib/metas";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO"];

// Sensor de propensão ao voto: índice 0-100 por ENGAJAMENTO (dados reais).
// É uma estimativa por engajamento/comunicação, não uma pesquisa eleitoral.
export async function GET() {
  const s = getSessao();
  if (!s || !PERFIS_OK.includes(s.perfil))
    return NextResponse.json({ erro: "negado" }, { status: 403 });

  const escopo = s.escopoCandidato || (s.perfil === "CANDIDATO" ? s.nome : "GLOBAL");
  const ids = await agentesDoCandidato(escopo, s.uid).catch(() => [] as number[]);

  let contatos = 0, apoiadores = 0, engajados = 0, confirmados = 0, dialogos = 0;
  if (ids && ids.length) {
    const q = async (sql: string) => Number((await queryOne<{ c: string }>(sql, [ids]))?.c ?? 0);
    contatos = await q("SELECT COUNT(*) c FROM pessoas WHERE agente_id = ANY($1)");
    confirmados = await q("SELECT COUNT(*) c FROM pessoas WHERE agente_id = ANY($1) AND lat IS NOT NULL");
    engajados = await q("SELECT COUNT(*) c FROM pautas WHERE agente_id = ANY($1)");
    apoiadores = await q("SELECT COUNT(*) c FROM pautas WHERE agente_id = ANY($1) AND tipo='interesse'");
    dialogos = await q("SELECT COUNT(DISTINCT regexp_replace(COALESCE(contato,''),'\\D','','g')) c FROM mensagens WHERE agente_id = ANY($1) AND direcao='in'");
  }

  const base = Math.max(1, contatos);
  // Componentes 0-100 (escalas heurísticas), com pesos.
  const cApoio = Math.min(100, (apoiadores / base) * 500);   // 20% apoiando = 100
  const cDialogo = Math.min(100, (dialogos / base) * 200);   // 50% respondeu = 100
  const cEngaj = Math.min(100, (engajados / base) * 400);    // 25% deixou pauta = 100
  const cPresenca = Math.min(100, (confirmados / base) * 150); // ~66% no mapa = 100
  const score = Math.round(0.35 * cApoio + 0.25 * cDialogo + 0.25 * cEngaj + 0.15 * cPresenca);

  const nivel = score < 25 ? "Fria" : score < 50 ? "Morna" : score < 75 ? "Quente" : "Quentíssima";

  return NextResponse.json({
    score,
    nivel,
    atualizadoEm: new Date().toISOString(),
    base: contatos,
    componentes: [
      { chave: "apoio", rotulo: "Apoio declarado", valor: Math.round(cApoio), detalhe: `${apoiadores} opt-in` },
      { chave: "dialogo", rotulo: "Diálogo (responderam)", valor: Math.round(cDialogo), detalhe: `${dialogos} conversaram` },
      { chave: "engaj", rotulo: "Engajamento (pautas)", valor: Math.round(cEngaj), detalhe: `${engajados} demandas` },
      { chave: "presenca", rotulo: "Presença no mapa", valor: Math.round(cPresenca), detalhe: `${confirmados} localizados` },
    ],
  });
}
