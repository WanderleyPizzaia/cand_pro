import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute, Agente } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { enviarMensagemAgente, enviarAudioAgente, enviarImagemAgente } from "@/lib/meta";
import { pausar, contemComando, alternar } from "@/lib/atendimento";
import { agentesDaSessao } from "@/lib/escopo";
import {
  assumir,
  assumirSeLivre,
  transferir,
  resolver,
  reabrir,
  baterPresenca,
  liberarInativos,
  PRESENCA_MS,
} from "@/lib/atendimentoCrm";

// Devolve à fila conversas sem resposta humana há X minutos (padrão 10).
// Roda no máximo 1x por minuto (guarda em memória) para não pesar no poll.
let ultimaVarredura = 0;
async function varrerInativos() {
  const agora = Date.now();
  if (agora - ultimaVarredura < 60_000) return;
  ultimaVarredura = agora;
  const min = Number((await getConfig("ATENDIMENTO_SLA_MIN")) || "10") || 10;
  await liberarInativos(min * 60_000).catch(() => {});
}

export const dynamic = "force-dynamic";
// Envio de áudio pode converter WebM -> OGG (ffmpeg) + upload na Meta.
export const maxDuration = 30;

// Quem acessa o CRM de Atendimento. CANDIDATO entra escopado aos próprios
// números (só vê a equipe e as conversas do candidato dele).
const PERMITIDOS = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO", "ATENDENTE"];
// Gestores veem tudo dentro do escopo e podem reatribuir conversas. O CANDIDATO
// é gestor apenas do próprio escopo (escSQL limita aos agentes dele).
const GESTOR = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];

function sessaoOk() {
  const s = getSessao();
  return s && PERMITIDOS.includes(s.perfil) ? s : null;
}

// IDs de agentes que a sessão pode operar: os números marcados no usuário ou
// herdados do gabinete. Gestor/ADMIN sem vínculo: null = todos.
async function escopoAgentes(s: ReturnType<typeof getSessao>): Promise<number[] | null> {
  if (!s) return [-1];
  const ids = await agentesDaSessao(s);
  if (ids) return ids.length ? ids : [-1];
  // Segurança: CANDIDATO sem escopo resolvido não vê NADA (nunca "vê todos").
  if (s.perfil === "CANDIDATO") return [-1];
  return null; // ADMIN/MARKETING/Coordenação sem escopo => vê todos
}
// Fragmento SQL "AND <col> IN (...)" (valores são inteiros do banco, seguros).
function escSQL(esc: number[] | null, col: string): string {
  return esc ? ` AND ${col} IN (${esc.join(",")})` : "";
}

// ============================================================
// GET /api/atendimento?contato=X&agente=N   -> thread da conversa
// GET /api/atendimento?view=minhas|fila|todas|resolvidas -> lista + contadores
// ============================================================
export async function GET(req: NextRequest) {
  const s = sessaoOk();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const url = new URL(req.url);
  const contato = (url.searchParams.get("contato") ?? "").trim();
  const agenteQ = Number(url.searchParams.get("agente")) || null;

  const esc = await escopoAgentes(s);
  // Atendente pedindo número fora do escopo: nega.
  if (esc && agenteQ && !esc.includes(agenteQ))
    return NextResponse.json({ erro: "Sem acesso a este número." }, { status: 403 });

  const filtroEscopo = escSQL(esc, "at.agente_id");

  // --- Thread de uma conversa (mensagens reais in/out) ---
  if (contato) {
    const params: any[] = [contato];
    let extra = "";
    if (agenteQ) {
      params.push(agenteQ);
      extra = ` AND agente_id = $${params.length}`;
    }
    const msgs = await query(
      `SELECT id, direcao, texto, status, origem, contato_nome, agente_id,
              media, media_tipo,
              to_char(criado_em AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI') AS quando
         FROM mensagens
        WHERE contato = $1 AND direcao IN ('in','out')${extra}${escSQL(esc, "agente_id")}
        ORDER BY criado_em ASC, id ASC`,
      params
    );
    const cab = await queryOne(
      `SELECT at.id, at.agente_id, at.contato, at.status, at.atendente_id,
              u.nome AS atendente_nome, ag.candidato AS agente_nome
         FROM atendimentos at
         LEFT JOIN usuarios u ON u.id = at.atendente_id
         LEFT JOIN agentes ag ON ag.id = at.agente_id
        WHERE at.contato = $1 ${agenteQ ? "AND at.agente_id = $2" : ""}${escSQL(esc, "at.agente_id")}
        LIMIT 1`,
      agenteQ ? [contato, agenteQ] : [contato]
    );
    return NextResponse.json({ mensagens: msgs, conversa: cab });
  }

  // Automação: devolve à fila o que ficou sem resposta humana no prazo.
  await varrerInativos();

  // --- Lista de conversas por "view" ---
  const view = (url.searchParams.get("view") ?? "todas").trim();
  const busca = (url.searchParams.get("q") ?? "").trim();

  const ehAtendente = s.perfil === "ATENDENTE";
  const params: any[] = [];
  let filtroView = "";
  if (view === "minhas") {
    params.push(s.uid);
    filtroView = `AND at.atendente_id = $${params.length} AND at.status = 'atribuido'`;
  } else if (view === "fila") {
    filtroView = `AND at.status = 'fila'`;
  } else if (view === "resolvidas") {
    filtroView = `AND at.status = 'resolvido'`;
  } else if (ehAtendente) {
    // Atendente não tem "Todas": mesmo forçando, só vê a própria + a fila
    // (nunca conversas de outros atendentes).
    params.push(s.uid);
    filtroView = `AND at.status <> 'resolvido' AND (at.atendente_id = $${params.length} OR at.status = 'fila')`;
  } else {
    // Gestor: todas as ativas (fila + atribuídas).
    filtroView = `AND at.status <> 'resolvido'`;
  }

  // Filtro por atendente (só gestor/admin): mostra as conversas de um atendente.
  let filtroAtendente = "";
  const atendenteQ = Number(url.searchParams.get("atendente")) || 0;
  if (atendenteQ > 0 && !ehAtendente) {
    params.push(atendenteQ);
    filtroAtendente = `AND at.atendente_id = $${params.length}`;
  }

  let filtroAgente = "";
  if (agenteQ) {
    params.push(agenteQ);
    filtroAgente = `AND at.agente_id = $${params.length}`;
  }

  let filtroBusca = "";
  if (busca) {
    params.push(`%${busca}%`);
    const i = params.length;
    filtroBusca = `AND (at.contato ILIKE $${i} OR COALESCE(m.contato_nome,'') ILIKE $${i} OR COALESCE(pe.nome,'') ILIKE $${i})`;
  }

  const conversas = await query(
    `SELECT at.id, at.agente_id, at.contato, at.status, at.atendente_id,
            u.nome AS atendente_nome,
            COALESCE(
              NULLIF(m.contato_nome,''),
              CASE WHEN pe.nome ~ '^[0-9]+$' THEN NULL ELSE pe.nome END,
              at.contato
            ) AS contato_nome,
            pe.foto AS foto,
            m.texto AS ultimo, m.direcao, m.origem,
            ag.candidato AS agente_nome,
            to_char(GREATEST(at.atualizado_em, COALESCE(m.criado_em, at.atualizado_em))
                      AT TIME ZONE 'America/Sao_Paulo',
                    'YYYY-MM-DD HH24:MI') AS quando,
            (m.direcao = 'in') AS nao_lida
       FROM atendimentos at
       LEFT JOIN usuarios u ON u.id = at.atendente_id
       LEFT JOIN agentes ag ON ag.id = at.agente_id
       LEFT JOIN LATERAL (
         SELECT texto, direcao, origem, criado_em, contato_nome
           FROM mensagens
          WHERE agente_id = at.agente_id AND contato = at.contato
            AND direcao IN ('in','out')
          ORDER BY criado_em DESC, id DESC LIMIT 1
       ) m ON true
       LEFT JOIN LATERAL (
         SELECT nome, foto FROM pessoas
          WHERE regexp_replace(COALESCE(whatsapp,''),'\\D','','g') = at.contato
          ORDER BY (foto IS NOT NULL) DESC, id ASC
          LIMIT 1
       ) pe ON true
      WHERE 1=1 ${filtroView} ${filtroAtendente} ${filtroAgente} ${filtroBusca} ${filtroEscopo}
      ORDER BY quando DESC
      LIMIT 300`,
    params
  );

  // Contadores por view (para a barra lateral, sem clicar).
  const cont = await queryOne<{ fila: number; minhas: number; todas: number }>(
    `SELECT
        COALESCE(SUM(CASE WHEN at.status = 'fila' THEN 1 ELSE 0 END),0)::int fila,
        COALESCE(SUM(CASE WHEN at.status = 'atribuido' AND at.atendente_id = $1 THEN 1 ELSE 0 END),0)::int minhas,
        COALESCE(SUM(CASE WHEN at.status <> 'resolvido' THEN 1 ELSE 0 END),0)::int todas
       FROM atendimentos at
      WHERE 1=1 ${filtroEscopo}`,
    [s.uid]
  );

  // Equipe de atendentes (para transferir): quem atende, com os números de cada
  // um (o cliente filtra por número da conversa) e status online. Escopado: um
  // atendente só enxerga colegas que atendem algum dos seus números.
  const havingEsc = esc ? `HAVING bool_or(va.agente_id IN (${esc.join(",")}))` : "";
  const atendentes = await query(
    `SELECT u.id, u.nome, u.disponivel,
            (u.visto_em IS NOT NULL AND u.visto_em > now() - ($1::int * interval '1 millisecond')) AS online,
            EXTRACT(EPOCH FROM (now() - u.visto_em))::bigint AS visto_seg,
            (SELECT COUNT(*) FROM atendimentos a2
               WHERE a2.atendente_id = u.id AND a2.status = 'atribuido')::int AS em_atendimento,
            (SELECT COUNT(*) FROM atendimentos a3
               WHERE a3.atendente_id = u.id AND a3.status = 'resolvido'
                 AND (a3.atualizado_em AT TIME ZONE 'America/Sao_Paulo')::date
                     = (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int AS resolvidas_hoje,
            COALESCE(array_agg(va.agente_id) FILTER (WHERE va.agente_id IS NOT NULL), '{}') AS agentes
       FROM usuarios u
       LEFT JOIN usuario_agentes va ON va.usuario_id = u.id
      WHERE u.perfil = 'ATENDENTE'
      GROUP BY u.id, u.nome, u.disponivel, u.visto_em
      ${havingEsc}
      ORDER BY (u.visto_em IS NOT NULL AND u.visto_em > now() - ($1::int * interval '1 millisecond')) DESC,
               u.disponivel DESC, u.nome`,
    [PRESENCA_MS]
  );

  const eu = await queryOne<{ disponivel: boolean }>(
    "SELECT disponivel FROM usuarios WHERE id = $1",
    [s.uid]
  );

  return NextResponse.json({
    conversas,
    contadores: cont,
    atendentes,
    eu: { uid: s.uid, nome: s.nome, perfil: s.perfil, disponivel: eu?.disponivel ?? true, gestor: GESTOR.includes(s.perfil) },
  });
}

// ============================================================
// POST /api/atendimento  { acao, agente_id, contato, ... }
//   acao: assumir | transferir | resolver | reabrir | responder | presenca
// ============================================================
export async function POST(req: NextRequest) {
  const s = sessaoOk();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const acao = (b.acao ?? "").toString();

  // Heartbeat / disponibilidade — não precisa de conversa.
  if (acao === "presenca") {
    await baterPresenca(s.uid, typeof b.disponivel === "boolean" ? b.disponivel : undefined);
    return NextResponse.json({ ok: true });
  }

  const agenteId = Number(b.agente_id);
  const contato = (b.contato ?? "").toString().trim();
  if (!agenteId || !contato)
    return NextResponse.json({ erro: "Dados incompletos." }, { status: 400 });

  // Atendente só age nos números vinculados a ele.
  const esc = await escopoAgentes(s);
  if (esc && !esc.includes(agenteId))
    return NextResponse.json({ erro: "Sem acesso a este número." }, { status: 403 });

  const gestor = GESTOR.includes(s.perfil);

  if (acao === "assumir") {
    // Gestor pode assumir/forçar; atendente só assume se estiver LIVRE (ou já dele).
    if (gestor) {
      await assumir(agenteId, contato, s.uid);
      return NextResponse.json({ ok: true });
    }
    const r = await assumirSeLivre(agenteId, contato, s.uid);
    if (!r.ok)
      return NextResponse.json(
        { erro: `Esta conversa já está sendo atendida por ${r.donoNome || "outro atendente"}.` },
        { status: 409 }
      );
    return NextResponse.json({ ok: true });
  }

  if (acao === "transferir") {
    // Só o gestor ou o dono atual pode transferir.
    if (!gestor) {
      const dono = await queryOne<{ atendente_id: number | null }>(
        "SELECT atendente_id FROM atendimentos WHERE agente_id = $1 AND contato = $2",
        [agenteId, contato]
      );
      if (!dono || dono.atendente_id !== s.uid)
        return NextResponse.json({ erro: "Você não é o responsável por esta conversa." }, { status: 403 });
    }
    const para = b.para == null || b.para === "" ? null : Number(b.para);
    await transferir(agenteId, contato, para);
    return NextResponse.json({ ok: true });
  }

  if (acao === "resolver") {
    await resolver(agenteId, contato, s.uid);
    return NextResponse.json({ ok: true });
  }

  if (acao === "reabrir") {
    await reabrir(agenteId, contato);
    return NextResponse.json({ ok: true });
  }

  if (acao === "responder") {
    const texto = (b.texto ?? "").toString().trim();
    if (!texto) return NextResponse.json({ erro: "Escreva a mensagem." }, { status: 400 });

    const agente = await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [agenteId]);
    if (!agente) return NextResponse.json({ erro: "Agente não encontrado." }, { status: 404 });

    // TRAVA: só responde quem é o dono (ou pega a conversa livre). Se já está
    // com OUTRO atendente, bloqueia — evita dois respondendo a mesma pessoa.
    // Gestor pode assumir/forçar.
    if (gestor) {
      await assumir(agenteId, contato, s.uid);
    } else {
      const claim = await assumirSeLivre(agenteId, contato, s.uid);
      if (!claim.ok)
        return NextResponse.json(
          { erro: `Esta conversa já está sendo atendida por ${claim.donoNome || "outro atendente"}.` },
          { status: 409 }
        );
    }

    const r = await enviarMensagemAgente(agente, contato, texto);
    await execute(
      "INSERT INTO mensagens (agente_id, contato, direcao, texto, wa_id, origem) VALUES ($1,$2,$3,$4,$5,'humano')",
      [agente.id, contato, r.ok ? "out" : "erro", r.ok ? texto : `Falha no envio: ${r.erro}`, r.waId || null]
    );
    if (!r.ok)
      return NextResponse.json({ erro: r.erro || "Falha ao enviar." }, { status: 502 });

    // Humano assumiu → a IA pausa para este contato ("Deus Abençoe" alterna).
    if (contemComando(texto)) await alternar(agente.id, contato);
    else await pausar(agente.id, contato);

    return NextResponse.json({ ok: true });
  }

  if (acao === "audio") {
    // Recebe o áudio gravado como data-URI. O navegador manda parâmetros extras
    // (ex.: data:audio/webm;codecs=opus;base64,...), então parseamos tolerante:
    // pega o mime-base antes do 1º ';' e o conteúdo após ';base64,'.
    const dataUri = (b.audio ?? "").toString();
    const sep = dataUri.indexOf(";base64,");
    if (!dataUri.startsWith("data:") || sep < 0)
      return NextResponse.json({ erro: "Áudio inválido." }, { status: 400 });
    const mime = dataUri.slice(5, sep).split(";")[0] || "audio/ogg";
    const base64 = dataUri.slice(sep + 8);
    if (!base64)
      return NextResponse.json({ erro: "Áudio vazio." }, { status: 400 });
    // Limite de tamanho (base64 ~1.37x): ~8MB de arquivo.
    if (base64.length > 11_000_000)
      return NextResponse.json({ erro: "Áudio muito longo (máx ~8MB)." }, { status: 400 });

    const agente = await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [agenteId]);
    if (!agente) return NextResponse.json({ erro: "Agente não encontrado." }, { status: 404 });

    // Mesma trava do responder: só o dono (ou conversa livre) manda áudio.
    if (gestor) {
      await assumir(agenteId, contato, s.uid);
    } else {
      const claim = await assumirSeLivre(agenteId, contato, s.uid);
      if (!claim.ok)
        return NextResponse.json(
          { erro: `Esta conversa já está sendo atendida por ${claim.donoNome || "outro atendente"}.` },
          { status: 409 }
        );
    }
    const r = await enviarAudioAgente(agente, contato, base64, mime);
    await execute(
      `INSERT INTO mensagens (agente_id, contato, direcao, texto, wa_id, origem, media, media_tipo)
       VALUES ($1,$2,$3,$4,$5,'humano',$6,$7)`,
      [
        agente.id, contato,
        r.ok ? "out" : "erro",
        r.ok ? "🎤 Áudio" : `Falha no envio de áudio: ${r.erro}`,
        r.waId || null,
        r.ok ? dataUri : null,
        r.ok ? "audio" : null,
      ]
    );
    if (!r.ok) return NextResponse.json({ erro: r.erro || "Falha ao enviar áudio." }, { status: 502 });
    await pausar(agente.id, contato); // humano assumiu → IA pausa
    return NextResponse.json({ ok: true });
  }

  if (acao === "imagem") {
    // Imagem como data-URI (data:image/jpeg;base64,...). Legenda opcional.
    const dataUri = (b.imagem ?? "").toString();
    const legenda = (b.legenda ?? "").toString().trim();
    const sep = dataUri.indexOf(";base64,");
    if (!dataUri.startsWith("data:image/") || sep < 0)
      return NextResponse.json({ erro: "Imagem inválida." }, { status: 400 });
    const mime = dataUri.slice(5, sep).split(";")[0] || "image/jpeg";
    const base64 = dataUri.slice(sep + 8);
    if (!base64) return NextResponse.json({ erro: "Imagem vazia." }, { status: 400 });
    // ~5MB de arquivo (limite da Meta para imagem).
    if (base64.length > 7_000_000)
      return NextResponse.json({ erro: "Imagem muito grande (máx ~5MB)." }, { status: 400 });

    const agente = await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [agenteId]);
    if (!agente) return NextResponse.json({ erro: "Agente não encontrado." }, { status: 404 });

    if (gestor) {
      await assumir(agenteId, contato, s.uid);
    } else {
      const claim = await assumirSeLivre(agenteId, contato, s.uid);
      if (!claim.ok)
        return NextResponse.json(
          { erro: `Esta conversa já está sendo atendida por ${claim.donoNome || "outro atendente"}.` },
          { status: 409 }
        );
    }
    const r = await enviarImagemAgente(agente, contato, base64, mime, legenda);
    await execute(
      `INSERT INTO mensagens (agente_id, contato, direcao, texto, wa_id, origem, media, media_tipo)
       VALUES ($1,$2,$3,$4,$5,'humano',$6,$7)`,
      [
        agente.id, contato,
        r.ok ? "out" : "erro",
        r.ok ? (legenda || "🖼️ Imagem") : `Falha no envio de imagem: ${r.erro}`,
        r.waId || null,
        r.ok ? dataUri : null,
        r.ok ? "imagem" : null,
      ]
    );
    if (!r.ok) return NextResponse.json({ erro: r.erro || "Falha ao enviar imagem." }, { status: 502 });
    await pausar(agente.id, contato);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
}
