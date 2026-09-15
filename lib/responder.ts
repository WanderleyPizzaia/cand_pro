import { execute, Agente } from "./db";
import { getConfig } from "./config";
import { gerarResposta } from "./ia";
import {
  enviarTexto,
  enviarPresenca,
  enviarAudioEvolution,
  dividirEmMensagens,
  atrasoDigitando,
  pausaEntreBolhas,
  normalizarNumero,
} from "./evolution";
import { enviarTextoMeta, enviarTypingMeta } from "./meta";
import { vozDoAgente, sintetizarVoz } from "./voz";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tarefa B: quando N8N_AGENTE_URL está configurada, o inbound é encaminhado ao
// n8n (que orquestra debounce/cadência e chama de volta /api/agente/responder).
// Retorna true se encaminhou (o webhook então NÃO responde inline). Best-effort:
// se o encaminhamento falhar, retorna false para o webhook responder direto
// (degradação graciosa — a IA nunca fica muda por causa do n8n).
export async function encaminharAgenteN8n(
  agente: Agente,
  origin: string,
  msg: { numero: string; nome: string | null; texto: string; waId?: string | null; canal: "meta" | "evolution" }
): Promise<boolean> {
  const url = (await getConfig("N8N_AGENTE_URL")).trim();
  const token = (await getConfig("N8N_TOKEN")).trim();
  // Sem token o retorno do n8n seria recusado (/api/agente/responder exige):
  // responde direto pela plataforma.
  if (!url || !token) return false;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Candpro-Token": token } : {}),
      },
      body: JSON.stringify({
        token,
        responder_url: `${origin}/api/agente/responder`,
        agente_id: agente.id,
        canal: msg.canal,
        numero: msg.numero,
        nome: msg.nome,
        wa_id: msg.waId ?? null,
        texto: msg.texto,
      }),
    });
    return r.ok;
  } catch {
    return false; // n8n fora do ar: cai no fallback inline
  }
}

// Gera a resposta da IA e a envia de forma humanizada (digitando + bolhas),
// no canal do agente (Meta oficial ou Evolution). Registra cada bolha em
// `mensagens`. É a lógica ÚNICA de resposta, reusada por:
//  - /api/agente/responder (quando o n8n orquestra o inbound), e
//  - fallback inline dos webhooks (degradação graciosa se o n8n estiver fora).
//
// `waId` é o id da mensagem RECEBIDA (necessário para o "digitando…" da Meta).
export async function responderIA(
  agente: Agente,
  opts: { numero: string; nome: string | null; waId?: string | null; entradaAudio?: boolean }
): Promise<{ ok: boolean; enviados: number; erro?: string }> {
  const numero = opts.numero;
  const nome = opts.nome ?? null;
  const ehMeta = agente.provedor === "meta";

  const resposta = await gerarResposta(
    agente.id,
    agente.persona || "",
    numero,
    agente.ia_key
  );
  if (!resposta.ok || !resposta.texto) {
    await execute(
      "INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto) VALUES ($1, $2, $3, 'erro', $4)",
      [agente.id, numero, nome, resposta.erro || "Falha ao gerar resposta"]
    );
    return { ok: false, enviados: 0, erro: resposta.erro || "Falha ao gerar resposta" };
  }

  // ── Atraso humano inicial ("pensando") antes de começar a responder ──
  // Config RESPOSTA_ATRASO_SEG = "8-12" (Evolution). Mostra "digitando" no meio.
  if (!ehMeta) {
    const cfg = ((await getConfig("RESPOSTA_ATRASO_SEG")) || "").trim();
    const m = cfg.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const min = +m[1], max = Math.max(+m[1], +m[2]);
      const seg = min + Math.random() * (max - min);
      if (seg > 0) {
        const num = normalizarNumero(numero);
        await enviarPresenca(agente.instancia || "", num, agente.apikey, "composing", Math.round(seg * 1000));
        await dormir(seg * 1000);
      }
    }
  }

  // ── Resposta em ÁUDIO (voz clonada via ElevenLabs) ──
  // Só quando o agente é Evolution e tem voz configurada (VOZ:<id> + chave global).
  // Envia UM áudio com a resposta completa; se falhar, cai no texto (degradação).
  if (!ehMeta) {
    const voz = await vozDoAgente(agente.id);
    const deveAudio = !!voz && (voz.modo === "sempre" || (voz.modo === "quando_audio" && !!opts.entradaAudio));
    if (voz && deveAudio) {
      const apiKey = await getConfig("ELEVENLABS_API_KEY");
      if (apiKey) {
        const num = normalizarNumero(numero);
        const espera = Math.min(6000, Math.max(1500, atrasoDigitando(resposta.texto)));
        await enviarPresenca(agente.instancia || "", num, agente.apikey, "recording", espera);
        const tts = await sintetizarVoz(resposta.texto, voz.voiceId, apiKey);
        if (tts.ok && tts.base64) {
          await dormir(espera);
          const a = await enviarAudioEvolution(agente.instancia || "", num, tts.base64, agente.apikey);
          await execute(
            `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, origem, wa_id, status)
             VALUES ($1, $2, $3, $4, $5, 'ia', $6, $7)`,
            [
              agente.id,
              numero,
              nome,
              a.ok ? "out" : "erro",
              a.ok ? "🎙️ " + resposta.texto.slice(0, 400) : `Falha no áudio: ${a.erro}`,
              a.waId || null,
              a.ok ? "sent" : null,
            ]
          );
          if (a.ok) return { ok: true, enviados: 1 };
          // áudio falhou: segue para o texto abaixo (não deixa o eleitor sem resposta)
        }
      }
    }
  }

  const partes = dividirEmMensagens(resposta.texto);
  let enviados = 0;

  for (let idx = 0; idx < partes.length; idx++) {
    const parte = partes[idx];
    // Pausa "pensando" antes de começar a digitar a próxima bolha (menos a 1ª).
    if (idx > 0) await dormir(pausaEntreBolhas());
    let envio: { ok: boolean; waId?: string | null; erro?: string };

    if (ehMeta) {
      // Meta: "digitando…" pela mensagem recebida + atraso proporcional, depois envia.
      if (opts.waId)
        await enviarTypingMeta(agente.meta_phone_id || "", agente.meta_token || "", opts.waId);
      await dormir(atrasoDigitando(parte));
      envio = await enviarTextoMeta(
        agente.meta_phone_id || "",
        agente.meta_token || "",
        numero,
        parte
      );
    } else {
      // Evolution: mostra "digitando…" de verdade e PAUSA no servidor entre as
      // bolhas (o delay do sendText sozinho não sequencia — as bolhas saíam juntas).
      const num = normalizarNumero(numero);
      const espera = atrasoDigitando(parte);
      await enviarPresenca(agente.instancia || "", num, agente.apikey, "composing", espera);
      await dormir(espera);
      const r = await enviarTexto(agente.instancia || "", num, parte, agente.apikey, 0);
      envio = { ok: r.ok, waId: r.waId, erro: r.erro };
    }

    await execute(
      `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, origem, wa_id, status)
       VALUES ($1, $2, $3, $4, $5, 'ia', $6, $7)`,
      [
        agente.id,
        numero,
        nome,
        envio.ok ? "out" : "erro",
        envio.ok ? parte : `Falha no envio: ${envio.erro}`,
        envio.waId || null,
        envio.ok ? "sent" : null,
      ]
    );
    if (!envio.ok) break; // conexão caiu: não insiste nas próximas bolhas
    enviados++;
  }

  return { ok: enviados > 0, enviados };
}
