import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { agentesDoCandidato } from "@/lib/metas";

export const dynamic = "force-dynamic";

// Apenas o admin master acessa o Funil.
const PERFIS_OK = ["ADMIN"];

// Funil do gabinete: do alcance ao voto confirmado, com números reais.
export async function GET() {
  const s = getSessao();
  // Só admin master.
  if (!s || !PERFIS_OK.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const escopo = s.escopoCandidato || (s.perfil === "CANDIDATO" ? s.nome : "GLOBAL");
  const ids = await agentesDoCandidato(escopo, s.uid).catch(() => [] as number[]);

  let alcance = 0, base = 0, engajados = 0, apoiadores = 0, confirmados = 0;
  if (ids && ids.length) {
    const q = async (sql: string) => Number((await queryOne<{ c: string }>(sql, [ids]))?.c ?? 0);
    alcance = await q("SELECT COUNT(DISTINCT regexp_replace(COALESCE(contato,''),'\\D','','g')) c FROM mensagens WHERE agente_id = ANY($1)");
    base = await q("SELECT COUNT(*) c FROM pessoas WHERE agente_id = ANY($1)");
    engajados = await q("SELECT COUNT(*) c FROM pautas WHERE agente_id = ANY($1)");
    apoiadores = await q("SELECT COUNT(*) c FROM pautas WHERE agente_id = ANY($1) AND tipo = 'interesse'");
    confirmados = await q("SELECT COUNT(*) c FROM pessoas WHERE agente_id = ANY($1) AND lat IS NOT NULL");
  }

  const numero = (await getConfig("URNA:" + escopo)) || "";
  const metaMin = Number((await getConfig("META_MIN:" + escopo)) || 45000);
  const metaObj = Number((await getConfig("META_OBJ:" + escopo)) || 50000);

  return NextResponse.json({
    candidato: escopo,
    numero,
    data: new Date().toISOString(),
    meta: { minima: metaMin, objetivo: metaObj, atual: base },
    etapas: [
      { chave: "alcance", rotulo: "Alcance", desc: "Pessoas alcançadas nas conversas", total: alcance },
      { chave: "base", rotulo: "Contatos na base", desc: "Cadastrados no gabinete", total: base },
      { chave: "engajados", rotulo: "Engajados", desc: "Deixaram pauta, denúncia ou sugestão", total: engajados },
      { chave: "apoiadores", rotulo: "Apoiadores", desc: "Opt-in para acompanhar a campanha", total: apoiadores },
      { chave: "confirmados", rotulo: "Confirmados no mapa", desc: "Posicionados por cidade", total: confirmados },
    ],
  });
}
