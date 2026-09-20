import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute, Agente } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { enviarMensagemAgente } from "@/lib/meta";
import { contemComando, alternar, pausar } from "@/lib/atendimento";
import { agentesDaSessao } from "@/lib/escopo";

export const dynamic = "force-dynamic";

const PERMITIDOS = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];

// GET /api/inbox            -> lista de conversas (última msg por contato)
// GET /api/inbox?contato=X  -> thread completa do contato
// GET /api/inbox?agente=N   -> filtra por agente_id
export async function GET(req: NextRequest) {
  const s = getSessao();
  if (!s || !PERMITIDOS.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const url = new URL(req.url);
  const contato = (url.searchParams.get("contato") ?? "").trim();
  let agenteFilter = url.searchParams.get("agente")
    ? Number(url.searchParams.get("agente"))
    : null;

  // Fronteira de segurança: os números que esta sessão enxerga agora
  // (marcados no usuário ou herdados do gabinete). null = todos.
  // agenteFilter só pode estreitar dentro dela.
  const meus = await agentesDaSessao(s);
  const escList = meus === null ? null : meus.length ? meus : [-1];
  if (escList && agenteFilter && !escList.includes(agenteFilter)) agenteFilter = null;
  const escWhere = escList ? ` AND agente_id IN (${escList.join(",")})` : "";

  if (contato) {
    const params: any[] = [contato];
    let extra = "";
    if (agenteFilter && agenteFilter > 0) {
      params.push(agenteFilter);
      extra = ` AND agente_id = $${params.length}`;
    }
    // Thread: mensagens reais + os avisos internos ('erro'), que são a única
    // explicação visível quando a IA não respondeu (sem chave, limite, falha).
    const msgs = await query(
      `SELECT id, direcao, texto, status, contato_nome, agente_id, media, media_tipo,
              to_char(criado_em AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI') AS quando
         FROM mensagens
        WHERE contato = $1 AND direcao IN ('in','out','erro')${extra}${escWhere}
        ORDER BY criado_em ASC, id ASC`,
      params
    );
    return NextResponse.json(msgs);
  }

  // Lista de conversas (última msg real por contato) + foto/nome do contato
  const params: any[] = [];
  let agenteWhere = "";
  if (agenteFilter && agenteFilter > 0) {
    params.push(agenteFilter);
    agenteWhere = `AND agente_id = $${params.length}`;
  }

  // Busca por nome/número e filtro por aba (todas | ia | nao_lidas | minhas).
  const busca = (url.searchParams.get("q") ?? "").trim();
  const aba = (url.searchParams.get("aba") ?? "todas").trim();

  let filtroBusca = "";
  if (busca) {
    params.push(`%${busca}%`);
    const i = params.length;
    filtroBusca = `AND (t.contato ILIKE $${i} OR COALESCE(t.contato_nome,'') ILIKE $${i} OR COALESCE(pe.nome,'') ILIKE $${i})`;
  }

  // "IA" = último out foi da IA · "Minhas" = já houve resposta humana
  // "Não lidas" = a última mensagem da conversa é do contato (in)
  let filtroAba = "";
  if (aba === "nao_lidas") filtroAba = `AND t.direcao = 'in'`;
  else if (aba === "ia") filtroAba = `AND t.origem = 'ia'`;
  else if (aba === "minhas")
    filtroAba = `AND EXISTS (
      SELECT 1 FROM mensagens m2
       WHERE m2.contato = t.contato AND m2.origem = 'humano'
         AND (t.agente_id IS NULL OR m2.agente_id = t.agente_id)
    )`;

  const conversas = await query(
    `SELECT t.contato,
            COALESCE(
              NULLIF(t.contato_nome,''),
              CASE WHEN pe.nome ~ '^[0-9]+$' THEN NULL ELSE pe.nome END,
              t.contato
            ) AS contato_nome,
            pe.foto AS foto,
            t.agente_id, t.texto AS ultimo, t.direcao, t.status, t.origem,
            to_char(t.criado_em AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI') AS quando,
            a.candidato AS agente_nome
       FROM (
         SELECT DISTINCT ON (contato) contato, contato_nome, agente_id, texto,
                direcao, status, origem, criado_em
           FROM mensagens
          WHERE contato IS NOT NULL AND contato <> ''
            AND direcao IN ('in','out') ${agenteWhere}${escWhere}
          ORDER BY contato, criado_em DESC, id DESC
       ) t
       LEFT JOIN agentes a ON a.id = t.agente_id
       LEFT JOIN LATERAL (
         SELECT nome, foto FROM pessoas
          WHERE regexp_replace(COALESCE(whatsapp,''),'\\D','','g') = t.contato
          ORDER BY (foto IS NOT NULL) DESC, id ASC
          LIMIT 1
       ) pe ON true
      WHERE 1=1 ${filtroBusca} ${filtroAba}
      ORDER BY t.criado_em DESC
      LIMIT 300`,
    params
  );
  return NextResponse.json(conversas);
}

// POST /api/inbox -> responde manualmente { contato, agente_id, texto }
export async function POST(req: NextRequest) {
  const s = getSessao();
  const gestor = !!s && ["ADMIN", "COORDENACAO"].includes(s.perfil);
  if (!s || !(gestor || s.perfil === "CANDIDATO"))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json();
  const contato = (b.contato ?? "").toString().trim();
  const texto = (b.texto ?? "").toString().trim();
  const agenteId = Number(b.agente_id);
  if (!contato || !texto || !agenteId)
    return NextResponse.json({ erro: "Dados incompletos." }, { status: 400 });

  // Só se responde pelos números que a sessão enxerga (null = sem restrição).
  const meusEnvio = await agentesDaSessao(s);
  if (meusEnvio && !meusEnvio.includes(agenteId))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const agente = await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [
    agenteId,
  ]);
  if (!agente)
    return NextResponse.json({ erro: "Agente não encontrado." }, { status: 404 });

  // Envia pelo provedor do agente (Meta oficial ou Evolution).
  const r = await enviarMensagemAgente(agente, contato, texto);
  await execute(
    "INSERT INTO mensagens (agente_id, contato, direcao, texto, wa_id, origem) VALUES ($1,$2,$3,$4,$5,'humano')",
    [
      agente.id,
      contato,
      r.ok ? "out" : "erro",
      r.ok ? texto : `Falha no envio: ${r.erro}`,
      r.waId || null,
    ]
  );

  if (!r.ok)
    return NextResponse.json({ erro: r.erro || "Falha ao enviar." }, { status: 502 });

  // A equipe respondeu manualmente = assumiu o contato → a IA PAUSA para ele
  // (não fala por cima). "Deus Abençoe" alterna (pausa <-> devolve pra IA).
  let iaPausada = true;
  if (contemComando(texto)) iaPausada = await alternar(agente.id, contato);
  else await pausar(agente.id, contato);

  return NextResponse.json({ ok: true, iaPausada });
}
