import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute, Agente } from "@/lib/db";
import { getConfig, conferirToken } from "@/lib/config";
import { gerarResposta, transcreverAudio } from "@/lib/ia";
import { capturarEleitor } from "@/lib/eleitores";
import { encaminharAgenteN8n, responderIA } from "@/lib/responder";
import { responderGrupoGestao } from "@/lib/gestao";
import { contemComando, alternar, pausar, estaPausado } from "@/lib/atendimento";
import { distribuir } from "@/lib/atendimentoCrm";
import { saudacaoBot } from "@/lib/botSaudacao";
import {
  enviarTexto,
  buscarFotoPerfil,
  dividirEmMensagens,
  atrasoDigitando,
  obterMidiaBase64,
} from "@/lib/evolution";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // humanização lenta (ritmo pastor) pode segurar mais

// Endereço REAL do contato. Contas novas do WhatsApp usam LID (<id>@lid), e o
// telefone vem em `remoteJidAlt`. Responder para o LID dá "número não existe".
function jidReal(key: any): string {
  const jid: string = key?.remoteJid || "";
  const alt: string = key?.remoteJidAlt || key?.senderPn || "";
  if (jid.endsWith("@lid") && alt) return alt;
  return jid;
}

// Webhook PÚBLICO que recebe eventos da Evolution API (messages.upsert).
// Evolution espera resposta 200 rápida - processamos e respondemos.
export async function POST(req: NextRequest) {
  // Token OBRIGATÓRIO (?token=... ou header x-webhook-token). O sistema gera o
  // WEBHOOK_TOKEN e o inclui na URL ao configurar a instância (urlWebhookEvolution).
  // Sem token válido, recusa: senão qualquer um forjaria mensagens de eleitores.
  const recebido =
    new URL(req.url).searchParams.get("token") || req.headers.get("x-webhook-token") || "";
  const token = await conferirToken("WEBHOOK_TOKEN", recebido);
  if (token !== "ok")
    return NextResponse.json(
      { erro: token === "ausente" ? "WEBHOOK_TOKEN não configurado" : "token inválido" },
      { status: token === "ausente" ? 503 : 401 }
    );

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const evento = body?.event || body?.type;
  const instancia = body?.instance || body?.instanceName;
  const data = body?.data || {};
  const key = data?.key || {};

  // messages.update = mudança de status da mensagem que ENVIAMOS.
  // É o que alimenta os ticks (✓ enviada, ✓✓ entregue, ✓✓ azul lida).
  if (evento && String(evento).includes("messages.update")) {
    const waId = key?.id || data?.keyId || null;
    const bruto = String(data?.status || data?.update?.status || "").toUpperCase();
    const status =
      bruto === "READ" || bruto === "PLAYED"
        ? "read"
        : bruto === "DELIVERY_ACK" || bruto === "DELIVERED"
        ? "delivered"
        : bruto === "SERVER_ACK" || bruto === "SENT"
        ? "sent"
        : null;
    if (waId && status) {
      // Nunca regride o tick: lida não volta a ser entregue.
      await execute(
        `UPDATE mensagens SET status = $1
          WHERE wa_id = $2
            AND COALESCE(status,'') <> 'read'
            AND ($1 <> 'delivered' OR COALESCE(status,'') <> 'read')`,
        [status, waId]
      );
    }
    return NextResponse.json({ ok: true });
  }

  // Fora isso, só processa mensagens recebidas (ignora as enviadas por nós)
  if (evento && !String(evento).includes("messages.upsert")) {
    return NextResponse.json({ ok: true });
  }

  // ===== Mensagem ENVIADA (fromMe) =====
  // Pode ser o ECO das nossas próprias mensagens (IA/campanha/inbox) OU o operador
  // atendendo pelo WhatsApp Web. Se for humano: o comando "/ia" ALTERNA a pausa da
  // IA; qualquer outra digitação humana PAUSA a IA (o humano assumiu o contato).
  if (key?.fromMe) {
    const waId = key?.id || null;
    // Eco das nossas próprias mensagens (já gravadas com wa_id) → ignora.
    if (waId) {
      const nossa = await queryOne<{ x: number }>(
        "SELECT 1 x FROM mensagens WHERE wa_id = $1 LIMIT 1",
        [waId]
      );
      if (nossa) return NextResponse.json({ ok: true, eco: true });
    }
    const rjidOut: string = jidReal(key);
    if (!rjidOut.endsWith("@s.whatsapp.net")) return NextResponse.json({ ok: true });
    const numOut = rjidOut.split("@")[0];
    const txtOut =
      data?.message?.conversation || data?.message?.extendedTextMessage?.text || "";
    const agOut = await queryOne<Agente>("SELECT * FROM agentes WHERE instancia = $1", [instancia]);
    if (!agOut || !numOut) return NextResponse.json({ ok: true });
    // Anti-corrida: se ACABAMOS de enviar (IA/campanha/inbox) exatamente este texto
    // a este contato (últimos 120s), o fromMe é ECO nosso — o INSERT do wa_id pode
    // não ter comitado antes do eco chegar. Não trata como humano (senão a IA se
    // auto-pausaria). Só entra aqui quando o wa_id ainda não bateu acima.
    if (txtOut) {
      const nossoRecente = await queryOne<{ x: number }>(
        `SELECT 1 x FROM mensagens
          WHERE agente_id = $1 AND contato = $2 AND direcao = 'out'
            AND origem IN ('ia','campanha','humano') AND texto = $3
            AND criado_em > now() - interval '120 seconds'
          LIMIT 1`,
        [agOut.id, numOut, txtOut]
      );
      if (nossoRecente) return NextResponse.json({ ok: true, eco: "texto" });
    }
    // Registra a mensagem do operador (para o inbox mostrar o atendimento humano).
    await execute(
      `INSERT INTO mensagens (agente_id, contato, direcao, texto, wa_id, origem)
       VALUES ($1, $2, 'out', $3, $4, 'humano')
       ON CONFLICT (wa_id) WHERE wa_id IS NOT NULL DO NOTHING`,
      [agOut.id, numOut, txtOut, waId]
    );
    if (contemComando(txtOut)) {
      const pausadoAgora = await alternar(agOut.id, numOut);
      console.log(`[webhook] WhatsApp Web comando '/ia' agente=${agOut.id} contato=${numOut} -> ${pausadoAgora ? "PAUSADA" : "RETOMADA"}`);
      return NextResponse.json({ ok: true, ia: pausadoAgora ? "pausada" : "retomada" });
    }
    // Digitação humana comum: o operador assumiu → pausa a IA neste contato.
    await pausar(agOut.id, numOut);
    console.log(`[webhook] WhatsApp Web takeover agente=${agOut.id} contato=${numOut} -> IA PAUSADA`);
    return NextResponse.json({ ok: true, ia: "pausada-humano" });
  }

  let texto =
    data?.message?.conversation ||
    data?.message?.extendedTextMessage?.text ||
    "";
  // Voz do eleitor: sem texto, mas com áudio (ptt/audioMessage) — transcrevemos.
  const audioMsg =
    data?.message?.audioMessage || data?.message?.pttMessage || null;
  const imageMsg = data?.message?.imageMessage || null;
  // Contas novas do WhatsApp chegam com endereço LID (<id>@lid) no lugar do
  // telefone. O telefone real vem em `remoteJidAlt` — é ele que serve para
  // responder e para casar com o cadastro do eleitor.
  const remoteJid: string = jidReal(key);
  const numero = remoteJid.split("@")[0];
  const nome = data?.pushName || null;

  // Precisa de instância, número e (texto OU áudio OU imagem).
  if (!instancia || !numero || (!texto && !audioMsg && !imageMsg)) {
    return NextResponse.json({ ok: true });
  }

  // Localiza o agente pela instância
  const agente = await queryOne<Agente>(
    "SELECT * FROM agentes WHERE instancia = $1",
    [instancia]
  );

  if (!agente) return NextResponse.json({ ok: true });

  // ===== Mensagem de GRUPO (equipe): responde com DADOS REAIS quando endereçada =====
  // remoteJid terminando em @g.us é grupo. Só responde se o agente foi endereçado
  // (nome do candidato citado ou @menção), pra NÃO spammar o grupo da equipe.
  if (remoteJid.endsWith("@g.us")) {
    if (!texto || !agente.ativo) return NextResponse.json({ ok: true, grupo: "ignorado" });
    const primeiroNome = (agente.candidato || "").split(" ")[0].toLowerCase();
    const mencionados: string[] =
      data?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const enderecado =
      !!primeiroNome && texto.toLowerCase().includes(primeiroNome)
        ? true
        : mencionados.some((j) => String(j).includes((agente.telefone || "").replace(/\D/g, "")));
    if (!enderecado) return NextResponse.json({ ok: true, grupo: "nao-enderecado" });
    // Registra a pergunta. Idempotência: só responde se for mensagem nova (retry não repete).
    const inseriuG = await execute(
      `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, wa_id, origem)
       VALUES ($1, $2, $3, 'in', $4, $5, 'gestao')
       ON CONFLICT (wa_id) WHERE wa_id IS NOT NULL DO NOTHING`,
      [agente.id, remoteJid, nome, texto, key?.id || null]
    );
    if (inseriuG === 0 && key?.id) return NextResponse.json({ ok: true, grupo: "duplicado" });
    const g = await responderGrupoGestao(agente, remoteJid, texto, nome);
    return NextResponse.json({ ok: true, gestao: g.ok, erro: g.erro });
  }

  // Áudio → texto: baixa a mídia na Evolution, guarda o ÁUDIO (data-URI) para o
  // atendente ouvir E TRANSCREVE com a IA (Whisper). Se transcrever, segue o fluxo
  // normal (a IA entende e responde) e a resposta sai em ÁUDIO (voz clonada).
  let entradaAudio = false;
  let jaRegistrado = false;
  if (!texto && audioMsg) {
    const media = await obterMidiaBase64(instancia, data, agente.apikey);
    const dataUri = media.ok && media.base64
      ? `data:${media.mimetype || "audio/ogg"};base64,${media.base64}`
      : null;
    let transcricao = "";
    if (media.ok && media.base64) {
      const tr = await transcreverAudio(media.base64, media.mimetype, agente.ia_key).catch(() => null);
      if (tr && tr.ok && tr.texto) transcricao = tr.texto.trim();
    }
    const ins = await execute(
      `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, wa_id, media, media_tipo)
       VALUES ($1, $2, $3, 'in', $4, $5, $6, $7)
       ON CONFLICT (wa_id) WHERE wa_id IS NOT NULL DO NOTHING`,
      [agente.id, numero, nome, transcricao ? "🎤 " + transcricao : "🎤 Áudio", key?.id || null, dataUri, dataUri ? "audio" : null]
    );
    if (ins === 0 && key?.id) return NextResponse.json({ ok: true, duplicado: true });
    if (!transcricao) {
      // Sem transcrição (sem chave/falha): comportamento antigo — registra e encerra.
      try { await distribuir(agente.id, numero); } catch {}
      await capturarEleitor(agente, numero, nome).catch(() => {});
      return NextResponse.json({ ok: true, audio: true });
    }
    // Com transcrição: entende o áudio e segue o fluxo normal, respondendo em áudio.
    texto = transcricao;
    entradaAudio = true;
    jaRegistrado = true;
  }

  // Imagem recebida: guarda o data-URI base64 (com legenda, se houver) no chat.
  if (!texto && imageMsg) {
    const media = await obterMidiaBase64(instancia, data, agente.apikey);
    const dataUri = media.ok && media.base64
      ? `data:${media.mimetype || "image/jpeg"};base64,${media.base64}`
      : null;
    const legenda = imageMsg?.caption || "🖼️ Imagem";
    const ins = await execute(
      `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, wa_id, media, media_tipo)
       VALUES ($1, $2, $3, 'in', $4, $5, $6, $7)
       ON CONFLICT (wa_id) WHERE wa_id IS NOT NULL DO NOTHING`,
      [agente.id, numero, nome, legenda, key?.id || null, dataUri, dataUri ? "imagem" : null]
    );
    if (ins > 0) {
      try { await distribuir(agente.id, numero); } catch {}
      await capturarEleitor(agente, numero, nome).catch(() => {});
    }
    return NextResponse.json({ ok: true, imagem: true });
  }

  // Registra a mensagem recebida (wa_id = key.id p/ dedup com o sync de histórico).
  // Se veio de áudio, a linha já foi inserida (com a transcrição + mídia) acima.
  const inseriu = jaRegistrado
    ? 1
    : await execute(
        `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, wa_id)
         VALUES ($1, $2, $3, 'in', $4, $5)
         ON CONFLICT (wa_id) WHERE wa_id IS NOT NULL DO NOTHING`,
        [agente.id, numero, nome, texto, key?.id || null]
      );

  // Idempotência: se este wa_id já tinha sido recebido (retry do webhook /
  // entrega duplicada pela Evolution), NÃO responde de novo — era isso que fazia
  // o agente repetir a mesma mensagem várias vezes ao mesmo contato.
  if (inseriu === 0 && key?.id) {
    return NextResponse.json({ ok: true, duplicado: true });
  }

  // CRM de Atendimento: registra/atualiza a conversa e distribui no rodízio
  // (round-robin) para um atendente disponível. Best-effort — a IA segue
  // respondendo normalmente até o humano assumir. Nunca quebra o webhook.
  try {
    await distribuir(agente.id, numero);
  } catch (e) {
    console.error("[webhook] atendimento distribuir:", (e as Error).message);
  }

  // Bot de 1ª resposta: acolhida automática uma vez, depois entrega ao humano.
  // Roda ANTES da checagem de agente ativo — tem o próprio liga/desliga.
  if (await saudacaoBot(agente, numero, nome)) {
    await capturarEleitor(agente, numero, nome).catch(() => {});
    return NextResponse.json({ ok: true, bot: true });
  }

  // Se o agente estiver desligado, apenas registra (não responde)
  if (!agente.ativo) return NextResponse.json({ ok: true, registrado: true });

  // Atendimento humano: se a equipe assumiu este contato (pausado), a IA NÃO
  // responde. Só captura o lead. O comando "/ia" do operador retoma a IA.
  if (await estaPausado(agente.id, numero)) {
    await capturarEleitor(agente, numero, nome);
    return NextResponse.json({ ok: true, pausado: true });
  }

  // Tarefa B: se o roteamento pelo n8n estiver ligado, encaminha e encerra aqui.
  // Fallback gracioso: se o encaminhamento falhar, responde inline abaixo.
  const origin = new URL(req.url).origin;
  if (await encaminharAgenteN8n(agente, origin, {
    numero, nome, texto, waId: key?.id || null, canal: "evolution",
  })) {
    return NextResponse.json({ ok: true, encaminhado: "n8n" });
  }

  // Resposta humanizada (digitando explícito + bolhas com pausa real entre elas +
  // registro de cada bolha). Centralizado em responderIA para consistência.
  await responderIA(agente, { numero, nome, waId: key?.id || null, entradaAudio });

  // Cadastro automático do eleitor (nome/cidade da conversa → mapa). Best-effort.
  await capturarEleitor(agente, numero, nome);

  // Foto de perfil do contato (réplica fiel do WhatsApp). Só busca quem ainda
  // não tem foto — evita chamada repetida a cada mensagem. Best-effort.
  await capturarFoto(agente, numero);

  return NextResponse.json({ ok: true });
}

// Alguns provedores fazem um GET de verificação
export async function GET() {
  return NextResponse.json({ ok: true, servico: "webhook whatsapp" });
}

// Guarda a foto de perfil do contato em `pessoas.foto` (base64, não expira).
// Silencioso: foto é enfeite, nunca pode derrubar o atendimento.
async function capturarFoto(agente: Agente, numero: string): Promise<void> {
  try {
    if (!agente.instancia) return;
    const digits = (numero || "").replace(/\D/g, "");
    if (!digits) return;
    const p = await queryOne<{ id: number }>(
      `SELECT id FROM pessoas
        WHERE regexp_replace(COALESCE(whatsapp,''),'\\D','','g') = $1
          AND (foto IS NULL OR foto = '')
        LIMIT 1`,
      [digits]
    );
    if (!p) return; // sem cadastro ainda, ou já tem foto
    const foto = await buscarFotoPerfil(agente.instancia, digits, agente.apikey);
    if (foto) await execute("UPDATE pessoas SET foto = $1 WHERE id = $2", [foto, p.id]);
  } catch {
    /* foto é best-effort */
  }
}
