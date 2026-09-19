import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { resolverEscopoAtual } from "@/lib/escopo";
import { agenteIdDoUsuario } from "@/lib/agenteUsuario";
import { buscarCidade } from "@/lib/cidades";
import { regiaoMaisProxima } from "@/lib/opcoes";
import { extrairPauta } from "@/lib/ia";
import { TEMAS, TIPOS, STATUS, gerarProtocolo } from "@/lib/pautas";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

async function protocoloDoAgente(agenteId: number | null): Promise<string> {
  if (!agenteId) return gerarProtocolo("");
  const a = await queryOne<{ candidato: string }>("SELECT candidato FROM agentes WHERE id = $1", [agenteId]);
  return gerarProtocolo(a ? await getConfig("URNA:" + a.candidato) : "");
}

const PERFIS = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];

// Filtro de escopo por agente (ADMIN/global = sem filtro).
function escopoSql(agenteIds: number[] | null, alias = "p") {
  if (!agenteIds) return { where: "", params: [] as any[] };
  if (!agenteIds.length) return { where: `AND ${alias}.agente_id = -1`, params: [] as any[] };
  const ph = agenteIds.map((_, i) => `$${i + 1}`).join(",");
  return { where: `AND ${alias}.agente_id IN (${ph})`, params: [...agenteIds] };
}

export async function GET(req: NextRequest) {
  const s = getSessao();
  if (!s || !PERFIS.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const esc = await resolverEscopoAtual(s);
  const { where, params } = escopoSql(esc.agenteIds);

  const u = new URL(req.url);
  const tema = (u.searchParams.get("tema") || "").trim();
  const status = (u.searchParams.get("status") || "").trim();
  const filtros: string[] = [];
  const fp: any[] = [...params];
  if (TEMAS.some((t) => t.v === tema)) { fp.push(tema); filtros.push(`AND p.tema = $${fp.length}`); }
  if (STATUS.some((x) => x.v === status)) { fp.push(status); filtros.push(`AND p.status = $${fp.length}`); }

  const pautas = await query(
    `SELECT p.id, p.origem, p.nome, p.contato, p.cidade, p.bairro, p.regiao, p.lat, p.lng,
            p.tema, p.tipo, p.titulo, p.descricao, p.status, p.prioridade, p.resposta,
            to_char(p.criado_em, 'DD/MM HH24:MI') AS criado_em
       FROM pautas p WHERE 1=1 ${where} ${filtros.join(" ")}
      ORDER BY p.criado_em DESC LIMIT 300`,
    fp
  );
  const porTema = await query(
    `SELECT tema, COUNT(*) c FROM pautas p WHERE 1=1 ${where} GROUP BY tema ORDER BY c DESC`,
    params
  );
  const porBairro = await query(
    `SELECT COALESCE(NULLIF(TRIM(bairro),''), cidade, 'Sem local') AS local, COUNT(*) c
       FROM pautas p WHERE 1=1 ${where} GROUP BY local ORDER BY c DESC LIMIT 12`,
    params
  );
  // Slug do link público (/pauta/<slug>): o login CANDIDATO do gabinete.
  let linkSlug: string | null = null;
  const alvo = (s.escopoCandidato || (s.perfil === "CANDIDATO" ? s.nome : "")).trim();
  if (alvo) {
    const primeiro = alvo.split(" ")[0];
    const cand = await queryOne<{ slug: string }>(
      `SELECT split_part(email,'@',1) AS slug FROM usuarios
        WHERE ativo = 1 AND perfil = 'CANDIDATO' AND (candidato_escopo = $1 OR nome ILIKE $2)
        ORDER BY (candidato_escopo = $1) DESC LIMIT 1`,
      [alvo, primeiro + "%"]
    );
    linkSlug = cand?.slug || null;
  }
  return NextResponse.json({ pautas, porTema, porBairro, linkSlug });
}

export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !PERFIS.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const acao = (b.acao || "criar").toString();
  const esc = await resolverEscopoAtual(s);
  const agentePadrao = esc.agenteIds && esc.agenteIds.length ? esc.agenteIds[0] : await agenteIdDoUsuario(s.uid, s.nome);

  // Garante que a pauta pertence ao escopo (não-ADMIN não mexe em pauta de outro).
  async function noEscopo(id: number) {
    if (!esc.agenteIds) return true; // ADMIN/global
    const p = await queryOne<{ agente_id: number | null }>("SELECT agente_id FROM pautas WHERE id = $1", [id]);
    return !!p && p.agente_id != null && esc.agenteIds.includes(p.agente_id);
  }

  if (acao === "gerar-de-conversa") {
    const contato = (b.contato || "").toString().trim();
    const agenteId = Number(b.agente_id) || agentePadrao;
    if (!agenteId || !contato)
      return NextResponse.json({ erro: "Informe o número da conversa." }, { status: 400 });
    if (esc.agenteIds && !esc.agenteIds.includes(agenteId))
      return NextResponse.json({ erro: "Fora do seu escopo." }, { status: 403 });
    const iaKey = (await queryOne<{ ia_key: string | null }>("SELECT ia_key FROM agentes WHERE id = $1", [agenteId]))?.ia_key;
    const pauta = await extrairPauta(agenteId, contato, iaKey);
    if (!pauta) return NextResponse.json({ erro: "Não encontrei uma pauta clara nessa conversa." }, { status: 404 });
    const nome = (await queryOne<{ nome: string | null }>(
      "SELECT nome FROM pessoas WHERE regexp_replace(COALESCE(whatsapp,''),'\\D','','g') = regexp_replace($1,'\\D','','g') AND agente_id = $2 LIMIT 1",
      [contato, agenteId]
    ))?.nome || null;
    const protocolo = await protocoloDoAgente(agenteId);
    const nova = await queryOne<{ id: number }>(
      `INSERT INTO pautas (agente_id, origem, nome, contato, tema, tipo, titulo, descricao, criado_por, protocolo)
       VALUES ($1,'whatsapp',$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [agenteId, nome, contato, pauta.tema, pauta.tipo, pauta.titulo || null, pauta.descricao, String(s.uid), protocolo]
    );
    return NextResponse.json({ ok: true, id: nova?.id, pauta, protocolo });
  }

  if (acao === "atualizar") {
    const id = Number(b.id);
    if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });
    if (!(await noEscopo(id))) return NextResponse.json({ erro: "Fora do seu escopo." }, { status: 403 });
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (STATUS.some((x) => x.v === b.status)) { sets.push(`status = $${i++}`); vals.push(b.status); }
    if (TEMAS.some((x) => x.v === b.tema)) { sets.push(`tema = $${i++}`); vals.push(b.tema); }
    if (TIPOS.some((x) => x.v === b.tipo)) { sets.push(`tipo = $${i++}`); vals.push(b.tipo); }
    if (typeof b.prioridade === "string") { sets.push(`prioridade = $${i++}`); vals.push(b.prioridade.trim() || null); }
    if (typeof b.resposta === "string") { sets.push(`resposta = $${i++}`); vals.push(b.resposta.trim() || null); }
    if (!sets.length) return NextResponse.json({ erro: "Nada para atualizar." }, { status: 400 });
    sets.push(`atualizado_em = now()`);
    vals.push(id);
    await execute(`UPDATE pautas SET ${sets.join(", ")} WHERE id = $${i}`, vals);
    return NextResponse.json({ ok: true });
  }

  // criar (equipe)
  const descricao = (b.descricao || "").toString().trim();
  if (!descricao) return NextResponse.json({ erro: "Descreva a pauta." }, { status: 400 });
  const tema = TEMAS.some((t) => t.v === b.tema) ? b.tema : "outros";
  const tipo = TIPOS.some((t) => t.v === b.tipo) ? b.tipo : "solicitacao";
  const cidadeNome = (b.cidade || "").toString().trim();
  const cidade = buscarCidade(cidadeNome);
  const lat = cidade?.lat ?? null;
  const lng = cidade?.lng ?? null;
  const regiao = lat != null && lng != null ? regiaoMaisProxima(lat, lng) : null;
  const protocolo = await protocoloDoAgente(agentePadrao || null);
  const nova = await queryOne<{ id: number }>(
    `INSERT INTO pautas (agente_id, origem, nome, contato, cidade, bairro, regiao, lat, lng, tema, tipo, titulo, descricao, criado_por, protocolo)
     VALUES ($1,'equipe',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [
      agentePadrao || null,
      (b.nome || "").toString().trim() || null,
      (b.contato || "").toString().trim() || null,
      cidadeNome || null,
      (b.bairro || "").toString().trim() || null,
      regiao, lat, lng, tema, tipo,
      (b.titulo || "").toString().trim().slice(0, 160) || null,
      descricao.slice(0, 4000),
      String(s.uid),
      protocolo,
    ]
  );
  return NextResponse.json({ ok: true, id: nova?.id, protocolo });
}
