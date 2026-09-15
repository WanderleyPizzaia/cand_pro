import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute, Agente } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { gerarResposta, transcreverAudio } from "@/lib/ia";
import { dividirEmMensagens, atrasoDigitando } from "@/lib/evolution";
import { capturarEleitor } from "@/lib/eleitores";
import { encaminharAgenteN8n } from "@/lib/responder";
import { estaPausado } from "@/lib/atendimento";
import { distribuir } from "@/lib/atendimentoCrm";
import { saudacaoBot } from "@/lib/botSaudacao";
import {
  enviarTextoMeta,
  enviarTypingMeta,
  obterMidiaMeta,
  extrairMensagens,
  extrairStatuses,
} from "@/lib/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // humanização lenta (ritmo pastor) pode segurar mais

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// GET: verificação do webhook (Meta chama com hub.mode/hub.verify_token/hub.challenge).
// Deve devolver o challenge em texto puro quando o verify token bate.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const esperado =
    (await getConfig("META_VERIFY_TOKEN")) || process.env.META_VERIFY_TOKEN || "";

  if (mode === "subscribe" && token && esperado && token === esperado) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// POST: eventos da Cloud API (mensagens recebidas + status). Formato Meta.
export async function POST(req: NextRequest) {
  const raw = await req.text();

  // Assinatura (X-Hub-Signature-256) OBRIGATÓRIA, com o App Secret do app da Meta
  // (META_APP_SECRET, em Configurações). Sem ele o webhook recusa tudo: sem a
  // assinatura, qualquer um poderia forjar mensagens e status.
  const appSecret = (await getConfig("META_APP_SECRET")).trim();
  if (!appSecret)
    return NextResponse.json({ erro: "META_APP_SECRET não configurado" }, { status: 503 });
  const sig = req.headers.get("x-hub-signature-256") || "";
  const esperado =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(raw).digest("hex");
  const ok =
    sig.length === esperado.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado));
  if (!ok) return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // 1. Atualiza os ticks (sent/delivered/read) das mensagens que enviamos.
  try {
    for (const s of extrairStatuses(body)) {
      await execute("UPDATE mensagens SET status = $1 WHERE wa_id = $2", [s.status, s.waId]);
    }
  } catch {
    /* status é best-effort */
  }

  // 2. Processa mensagens recebidas.
  const mensagens = extrairMensagens(body);
  for (const m of mensagens) {
    // Localiza o agente pelo phone_number_id da Meta.
    const agente = await queryOne<Agente>(
      "SELECT * FROM agentes WHERE provedor = 'meta' AND meta_phone_id = $1 LIMIT 1",
      [m.phoneId]
    );
    if (!agente) continue;

    // Voz do eleitor: guarda o ÁUDIO (data-URI base64) pra ouvir no chat.
    // Sem transcrição por ora. Registra, distribui e segue.
    let texto = m.texto;
    if (!texto && m.audio) {
      const media = await obterMidiaMeta(m.audio.id, agente.meta_token || "");
      const dataUri = media.ok && media.base64
        ? `data:${media.mimetype || "audio/ogg"};base64,${media.base64}`
        : null;
      const ins = await execute(
        `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, wa_id, media, media_tipo)
         VALUES ($1, $2, $3, 'in', $4, $5, $6, $7)
         ON CONFLICT (wa_id) WHERE wa_id IS NOT NULL DO NOTHING`,
        [agente.id, m.numero, m.nome, "🎤 Áudio", m.waId, dataUri, dataUri ? "audio" : null]
      );
      if (ins > 0) {
        try { await distribuir(agente.id, m.numero); } catch {}
        await capturarEleitor(agente, m.numero, m.nome).catch(() => {});
      }
      continue;
    }

    // Imagem recebida: guarda o data-URI base64 para exibir no chat.
    if (!texto && m.imagem) {
      const media = await obterMidiaMeta(m.imagem.id, agente.meta_token || "");
      const dataUri = media.ok && media.base64
        ? `data:${media.mimetype || "image/jpeg"};base64,${media.base64}`
        : null;
      const ins = await execute(
        `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, wa_id, media, media_tipo)
         VALUES ($1, $2, $3, 'in', $4, $5, $6, $7)
         ON CONFLICT (wa_id) WHERE wa_id IS NOT NULL DO NOTHING`,
        [agente.id, m.numero, m.nome, m.imagem.caption || "🖼️ Imagem", m.waId, dataUri, dataUri ? "imagem" : null]
      );
      if (ins > 0) {
        try { await distribuir(agente.id, m.numero); } catch {}
        await capturarEleitor(agente, m.numero, m.nome).catch(() => {});
      }
      continue;
    }

    // Registra a mensagem recebida (dedup por wa_id).
    const inseriu = await execute(
      `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, wa_id)
       VALUES ($1, $2, $3, 'in', $4, $5)
       ON CONFLICT (wa_id) WHERE wa_id IS NOT NULL DO NOTHING`,
      [agente.id, m.numero, m.nome, texto, m.waId]
    );

    // Idempotência: a Meta reentrega o mesmo evento em caso de timeout/erro.
    // Se este wamid já foi recebido, NÃO responde de novo (evita repetir mensagem).
    if (inseriu === 0 && m.waId) continue;

    // CRM de Atendimento: registra a conversa e distribui no rodízio. Best-effort.
    try {
      await distribuir(agente.id, m.numero);
    } catch (e) {
      console.error("[meta] atendimento distribuir:", (e as Error).message);
    }

    // Bot de 1ª resposta: manda a acolhida automática uma vez e entrega ao humano.
    // Roda ANTES da checagem de agente ativo — tem o próprio liga/desliga.
    if (await saudacaoBot(agente, m.numero, m.nome)) {
      await capturarEleitor(agente, m.numero, m.nome).catch(() => {});
      continue;
    }

    if (!agente.ativo) continue; // agente desligado: só registra

    // Atendimento humano: contato pausado (equipe assumiu) → IA não responde.
    if (await estaPausado(agente.id, m.numero)) {
      await capturarEleitor(agente, m.numero, m.nome).catch(() => {});
      continue;
    }

    // Tarefa B: se o roteamento pelo n8n estiver ligado, encaminha e encerra aqui.
    // Fallback gracioso: se o encaminhamento falhar, responde inline abaixo.
    const origin = new URL(req.url).origin;
    if (await encaminharAgenteN8n(agente, origin, {
      numero: m.numero, nome: m.nome, texto, waId: m.waId, canal: "meta",
    })) {
      continue;
    }

    // "Digitando…" imediato (usa o wamid da mensagem recebida). Best-effort.
    await enviarTypingMeta(agente.meta_phone_id || "", agente.meta_token || "", m.waId);

    // Gera a resposta com a IA (mesma persona/chave por agente).
    const resposta = await gerarResposta(
      agente.id,
      agente.persona || "",
      m.numero,
      agente.ia_key
    );
    if (!resposta.ok || !resposta.texto) {
      await execute(
        "INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto) VALUES ($1, $2, $3, 'erro', $4)",
        [agente.id, m.numero, m.nome, resposta.erro || "Falha ao gerar resposta"]
      );
      continue;
    }

    // Envio humanizado: quebra a resposta em bolhas curtas, cada uma precedida de
    // "digitando…" com atraso proporcional — igual à rota Evolution.
    const partes = dividirEmMensagens(resposta.texto);
    for (const parte of partes) {
      // Reforça o "digitando…" antes de cada bolha e espera o tempo de digitação.
      await enviarTypingMeta(agente.meta_phone_id || "", agente.meta_token || "", m.waId);
      await dormir(atrasoDigitando(parte));

      const envio = await enviarTextoMeta(
        agente.meta_phone_id || "",
        agente.meta_token || "",
        m.numero,
        parte
      );
      await execute(
        `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, wa_id, status, origem)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ia')`,
        [
          agente.id,
          m.numero,
          m.nome,
          envio.ok ? "out" : "erro",
          envio.ok ? parte : `Falha no envio: ${envio.erro}`,
          envio.waId || null,
          envio.ok ? "sent" : null,
        ]
      );
      if (!envio.ok) break; // falhou: não insiste nas próximas bolhas
    }

    // Cadastro automático do eleitor (nome/cidade da conversa → mapa). Best-effort.
    await capturarEleitor(agente, m.numero, m.nome);
  }

  return NextResponse.json({ ok: true });
}
