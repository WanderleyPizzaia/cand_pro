import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { execute, query, queryOne } from "@/lib/db";
import { getConfig, setConfig } from "@/lib/config";
import { agentesDoCandidato } from "@/lib/metas";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO", "LIDER", "ATENDENTE"];
const MARCOS = [50, 100, 250, 500, 1000, 2500, 5000, 10000];

async function garantirTabela() {
  await execute(
    `CREATE TABLE IF NOT EXISTS notificacoes (
       id SERIAL PRIMARY KEY,
       escopo TEXT NOT NULL,
       tipo TEXT NOT NULL,
       icone TEXT,
       titulo TEXT NOT NULL,
       texto TEXT,
       comemora BOOLEAN DEFAULT false,
       lida BOOLEAN DEFAULT false,
       criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );
}

function escopoDe(s: NonNullable<ReturnType<typeof getSessao>>) {
  return s.escopoCandidato || (s.perfil === "CANDIDATO" ? s.nome : "GLOBAL");
}

async function metricas(ids: number[]) {
  if (!ids.length) return { contatos: 0, cidades: 0, pautas: 0, apoiadores: 0 };
  const q = async (sql: string) => Number((await queryOne<{ c: string }>(sql, [ids]))?.c ?? 0);
  return {
    contatos: await q("SELECT COUNT(*) c FROM pessoas WHERE agente_id = ANY($1)"),
    cidades: await q("SELECT COUNT(DISTINCT NULLIF(cidade,'')) c FROM pessoas WHERE agente_id = ANY($1)"),
    pautas: await q("SELECT COUNT(*) c FROM pautas WHERE agente_id = ANY($1)"),
    apoiadores: await q("SELECT COUNT(*) c FROM pautas WHERE agente_id = ANY($1) AND tipo='interesse'"),
  };
}

// Detecta eventos reais (deltas desde a última leitura) e cria notificações.
async function detectar(escopo: string, uid: number) {
  const ids = await agentesDoCandidato(escopo, uid).catch(() => [] as number[]);
  const at = await metricas(ids);
  const raw = await getConfig("NOTIF_SNAP:" + escopo);
  let snap: any = null;
  try { snap = raw ? JSON.parse(raw) : null; } catch { snap = null; }

  const novas: { tipo: string; icone: string; titulo: string; texto: string; comemora: boolean }[] = [];
  if (snap) {
    const dContatos = at.contatos - (snap.contatos || 0);
    const dCidades = at.cidades - (snap.cidades || 0);
    const dPautas = at.pautas - (snap.pautas || 0);
    const dApo = at.apoiadores - (snap.apoiadores || 0);
    if (dApo > 0) novas.push({ tipo: "apoiador", icone: "star", titulo: dApo === 1 ? "Novo apoiador! 💙" : `+${dApo} apoiadores! 💙`, texto: `Agora são ${at.apoiadores} apoiando a campanha.`, comemora: true });
    if (dContatos > 0) novas.push({ tipo: "contato", icone: "user-plus", titulo: dContatos === 1 ? "Novo contato na base" : `+${dContatos} novos contatos`, texto: `Sua base agora tem ${at.contatos} pessoas.`, comemora: false });
    if (dCidades > 0) novas.push({ tipo: "cidade", icone: "map-pin", titulo: dCidades === 1 ? "Nova cidade no mapa! 🗺️" : `+${dCidades} cidades no mapa! 🗺️`, texto: `Você já está em ${at.cidades} cidades.`, comemora: true });
    if (dPautas > 0) novas.push({ tipo: "pauta", icone: "inbox", titulo: dPautas === 1 ? "Nova pauta recebida" : `+${dPautas} novas pautas`, texto: `Total de ${at.pautas} demandas registradas.`, comemora: false });
    for (const m of MARCOS) {
      if ((snap.contatos || 0) < m && at.contatos >= m) {
        novas.push({ tipo: "marco", icone: "trophy", titulo: `Marco: ${m.toLocaleString("pt-BR")} contatos! 🏆`, texto: "A sua base cresceu. Bora acelerar o próximo passo?", comemora: true });
      }
    }
  }
  for (const n of novas) {
    await execute(
      "INSERT INTO notificacoes (escopo, tipo, icone, titulo, texto, comemora) VALUES ($1,$2,$3,$4,$5,$6)",
      [escopo, n.tipo, n.icone, n.titulo, n.texto, n.comemora]
    );
  }
  await setConfig("NOTIF_SNAP:" + escopo, JSON.stringify(at));
}

export async function GET() {
  const s = getSessao();
  if (!s || !PERFIS_OK.includes(s.perfil)) return NextResponse.json({ erro: "negado" }, { status: 403 });
  await garantirTabela();
  const escopo = escopoDe(s);
  try { await detectar(escopo, s.uid); } catch { /* nunca quebra o sino */ }

  const itens = await query<{ id: number; tipo: string; icone: string | null; titulo: string; texto: string | null; comemora: boolean; lida: boolean; criado_em: string }>(
    "SELECT id, tipo, icone, titulo, texto, comemora, lida, criado_em FROM notificacoes WHERE escopo = $1 ORDER BY criado_em DESC LIMIT 30",
    [escopo]
  );
  const naoLidas = itens.filter((i) => !i.lida).length;
  return NextResponse.json({ itens, naoLidas });
}

// POST { acao: "ler" } marca todas como lidas.
export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s) return NextResponse.json({ erro: "negado" }, { status: 403 });
  await garantirTabela();
  await execute("UPDATE notificacoes SET lida = true WHERE escopo = $1 AND lida = false", [escopoDe(s)]);
  return NextResponse.json({ ok: true });
}
