import { getConfig } from "./config";

// Normaliza um número brasileiro para o formato da Evolution (com DDI 55).
// Normaliza para o formato que a Evolution espera (DDI + DDD + número).
// Só assume Brasil quando o número REALMENTE parece brasileiro sem DDI. Colar
// "55" em qualquer número de 10-11 dígitos quebrava contatos estrangeiros
// (ex.: +1 701 555 7208 virava 5517015557208 -> "número não existe").
export function normalizarNumero(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d; // já tem DDI
  if (d.length === 10) return "55" + d; // DDD + fixo (8 dígitos)
  if (d.length === 11 && d[2] === "9") return "55" + d; // DDD + celular (9 dígitos)
  return d; // já vem completo com DDI (inclusive de outros países)
}

// Cliente mínimo da Evolution API (WhatsApp).
// Envia uma mensagem de texto por uma instância.
// `delayMs` (opcional): a Evolution mostra "digitando..." por esse tempo antes
// de entregar a mensagem — é o que dá o toque humano na resposta do agente.
// Envia ÁUDIO (nota de voz) pela Evolution. Recebe base64 puro (sem data-URI).
// A Evolution/Baileys converte para o formato do WhatsApp automaticamente.
export async function enviarAudioEvolution(
  instancia: string,
  numero: string,
  base64: string,
  apikeyOverride?: string | null
): Promise<{ ok: boolean; waId?: string | null; erro?: string }> {
  const base = (await getConfig("EVOLUTION_URL")).replace(/\/$/, "");
  const apikey = apikeyOverride || (await getConfig("EVOLUTION_APIKEY"));
  if (!base || !apikey) return { ok: false, erro: "Evolution não configurada" };
  try {
    const r = await fetch(`${base}/message/sendWhatsAppAudio/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ number: numero, audio: base64 }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return { ok: false, erro: `Evolution ${r.status}: ${t.slice(0, 200)}` };
    }
    const d = await r.json().catch(() => null);
    return { ok: true, waId: d?.key?.id ?? null };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// Envia IMAGEM pela Evolution (endpoint sendMedia). Recebe base64 puro.
export async function enviarImagemEvolution(
  instancia: string,
  numero: string,
  base64: string,
  mime = "image/jpeg",
  legenda = "",
  apikeyOverride?: string | null
): Promise<{ ok: boolean; waId?: string | null; erro?: string }> {
  const base = (await getConfig("EVOLUTION_URL")).replace(/\/$/, "");
  const apikey = apikeyOverride || (await getConfig("EVOLUTION_APIKEY"));
  if (!base || !apikey) return { ok: false, erro: "Evolution não configurada" };
  try {
    const ext = /png/i.test(mime) ? "png" : /webp/i.test(mime) ? "webp" : "jpg";
    const r = await fetch(`${base}/message/sendMedia/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({
        number: numero,
        mediatype: "image",
        mimetype: mime,
        media: base64,
        fileName: `imagem.${ext}`,
        caption: legenda || undefined,
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return { ok: false, erro: `Evolution ${r.status}: ${t.slice(0, 200)}` };
    }
    const d = await r.json().catch(() => null);
    return { ok: true, waId: d?.key?.id ?? null };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

export async function enviarTexto(
  instancia: string,
  numero: string,
  texto: string,
  apikeyOverride?: string | null,
  delayMs?: number
): Promise<{ ok: boolean; waId?: string | null; erro?: string }> {
  const base = (await getConfig("EVOLUTION_URL")).replace(/\/$/, "");
  // Cada instância pode ter sua própria apikey (Evolution self-hosted sem chave
  // global). Usa a do agente quando houver; senão cai na global do config.
  const apikey = apikeyOverride || (await getConfig("EVOLUTION_APIKEY"));
  if (!base || !apikey) return { ok: false, erro: "Evolution não configurada" };

  try {
    const r = await fetch(`${base}/message/sendText/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({
        number: numero,
        text: texto,
        // delay > 0 => a instância emite presença "composing" (digitando) por
        // esse intervalo antes de mandar. Omitido quando não informado.
        ...(delayMs && delayMs > 0 ? { delay: Math.round(delayMs) } : {}),
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return { ok: false, erro: `Evolution ${r.status}: ${t.slice(0, 200)}` };
    }
    // Guarda o id da mensagem: é por ele que o evento messages.update casa o
    // status e os ticks aparecem na conversa.
    const d = await r.json().catch(() => null);
    return { ok: true, waId: d?.key?.id ?? null };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// Mostra "digitando…" (ou pausa/grava) no chat do contato. Presença explícita —
// garante o indicador mesmo quando o `delay` do sendText não é respeitado.
// presence: 'composing' (digitando), 'recording' (gravando áudio), 'paused'.
export async function enviarPresenca(
  instancia: string,
  numero: string,
  apikeyOverride?: string | null,
  presence: "composing" | "recording" | "paused" = "composing",
  delayMs = 1200
): Promise<void> {
  try {
    const base = (await getConfig("EVOLUTION_URL")).replace(/\/$/, "");
    const apikey = apikeyOverride || (await getConfig("EVOLUTION_APIKEY"));
    if (!base || !apikey || !instancia || !numero) return;
    await fetch(`${base}/chat/sendPresence/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ number: numero, presence, delay: Math.round(delayMs) }),
    });
  } catch {
    /* presença é enfeite: nunca derruba o atendimento */
  }
}

// ===== Resposta humanizada (quebra em partes + "digitando") =====

// Quebra o texto da IA em mensagens curtas, como uma pessoa mandaria no
// WhatsApp: primeiro por parágrafos (linha em branco), depois por frases
// quando o parágrafo é longo. Junta o excesso na última para não virar spam.
export function dividirEmMensagens(texto: string, maxPartes = 3): string[] {
  const limpo = (texto || "").trim();
  if (!limpo) return [];

  const LIMITE = 110; // bolha curta de WhatsApp (favorece quebrar em várias)
  const brutos: string[] = [];

  for (const par of limpo.split(/\n{2,}/)) {
    const p = par.trim();
    if (!p) continue;
    if (p.length <= LIMITE) {
      brutos.push(p);
      continue;
    }
    // Parágrafo longo: acumula frases até ~LIMITE e fecha a bolha.
    const frases = p.match(/[^.!?…]+[.!?…]+(?:\s|$)|[^.!?…]+$/g) || [p];
    let buf = "";
    for (const f of frases) {
      const t = f.trim();
      if (!t) continue;
      if (buf && (buf + " " + t).length > LIMITE) {
        brutos.push(buf.trim());
        buf = t;
      } else {
        buf = buf ? buf + " " + t : t;
      }
    }
    if (buf.trim()) brutos.push(buf.trim());
  }

  if (brutos.length <= maxPartes) return brutos;
  // Excesso de bolhas: mantém as primeiras e concatena o resto na última.
  const cabeca = brutos.slice(0, maxPartes - 1);
  const resto = brutos.slice(maxPartes - 1).join(" ");
  return [...cabeca, resto];
}

// Tempo de "digitando" por bolha, no RITMO DE UM SENHOR PASTOR digitando:
// mais lento e deliberado (3,5s a 7s), proporcional ao tamanho. Teto p/ não
// estourar o tempo do webhook.
export function atrasoDigitando(texto: string): number {
  const len = (texto || "").length;
  return Math.min(7000, Math.max(3500, Math.round(1200 + len * 46)));
}

// Pausa "pensando" ENTRE uma bolha e a próxima (ele relê antes de continuar).
export function pausaEntreBolhas(): number {
  return 1600 + Math.round(Math.random() * 1400); // ~1,6s a 3,0s
}

// Configura o webhook da instância (evento messages.upsert) apontando para a
// nossa rota pública. Idempotente: pode ser chamado a cada conexão. Best-effort.
export async function definirWebhook(
  instancia: string,
  url: string,
  apikeyOverride?: string | null
): Promise<{ ok: boolean; erro?: string }> {
  const base = (await getConfig("EVOLUTION_URL")).replace(/\/$/, "");
  const apikey = apikeyOverride || (await getConfig("EVOLUTION_APIKEY"));
  if (!base || !apikey) return { ok: false, erro: "Evolution não configurada" };
  try {
    const r = await fetch(`${base}/webhook/set/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({
        webhook: {
          url,
          enabled: true,
          // UPSERT = mensagem nova · UPDATE = mudança de status (os ✓✓ dos ticks)
          events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE"],
          webhookByEvents: false,
          webhookBase64: false,
        },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return { ok: false, erro: `Evolution ${r.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// Lê o webhook configurado na instância. É assim que a tela sabe se o tempo
// real está de pé: sem webhook, mensagem só chega na próxima varredura.
export async function buscarWebhook(
  instancia: string,
  apikeyOverride?: string | null
): Promise<{ ok: boolean; url?: string; ativo?: boolean; erro?: string }> {
  const base = (await getConfig("EVOLUTION_URL")).replace(/\/$/, "");
  const apikey = apikeyOverride || (await getConfig("EVOLUTION_APIKEY"));
  if (!base || !apikey) return { ok: false, erro: "Evolution não configurada" };
  try {
    const r = await fetch(`${base}/webhook/find/${encodeURIComponent(instancia)}`, {
      headers: { apikey },
      cache: "no-store",
    });
    if (!r.ok) return { ok: false, erro: `Evolution ${r.status}` };
    const d = await r.json();
    // A Evolution ora devolve o objeto direto, ora dentro de `webhook`.
    const w = d?.webhook && typeof d.webhook === "object" ? d.webhook : d;
    return { ok: true, url: w?.url || "", ativo: !!(w?.enabled ?? w?.url) };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// Configuração padrão de toda instância do sistema:
// baixa o histórico ao conectar, ignora grupos e mantém "sempre online".
export const CONFIG_PADRAO = {
  syncFullHistory: true, // baixa as conversas ao conectar
  groupsIgnore: true, // ignora mensagens de grupos
  alwaysOnline: true, // mantém o número "online"
  readMessages: false,
  readStatus: false,
  rejectCall: false,
  msgCall: "",
};

// Aplica a configuração padrão na instância (idempotente, best-effort).
export async function definirConfiguracoes(
  instancia: string,
  apikeyOverride?: string | null
): Promise<{ ok: boolean; erro?: string }> {
  const base = (await getConfig("EVOLUTION_URL")).replace(/\/$/, "");
  const apikey = apikeyOverride || (await getConfig("EVOLUTION_APIKEY"));
  if (!base || !apikey) return { ok: false, erro: "Evolution não configurada" };
  try {
    const r = await fetch(`${base}/settings/set/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify(CONFIG_PADRAO),
    });
    if (!r.ok) {
      const t = await r.text();
      return { ok: false, erro: `Evolution ${r.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// ===== Conexão / status de instância (plug-and-play QR) =====

async function baseEApikey(apikeyOverride?: string | null) {
  const base = (await getConfig("EVOLUTION_URL")).replace(/\/$/, "");
  const apikey = apikeyOverride || (await getConfig("EVOLUTION_APIKEY"));
  return { base, apikey };
}

// Slug simples para nome de instância (a partir do candidato), só ASCII.
export function slugInstancia(nome: string): string {
  return (nome || "")
    .normalize("NFD")
    .replace(new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g"), "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Estado de conexão: 'open' (conectada), 'connecting', 'close', 'inexistente'
// (a instância sumiu da Evolution) ou null se não deu para consultar.
export async function estadoInstancia(
  instancia: string,
  apikeyOverride?: string | null
): Promise<{ ok: boolean; state: string | null; erro?: string }> {
  const { base, apikey } = await baseEApikey(apikeyOverride);
  if (!base || !apikey) return { ok: false, state: null, erro: "Evolution não configurada" };
  try {
    const r = await fetch(`${base}/instance/connectionState/${encodeURIComponent(instancia)}`, {
      headers: { apikey },
      cache: "no-store",
    });
    // 404 = a instância não existe mais lá (apagada no painel ou nome trocado
    // à mão). É diferente de "caiu": aqui só reconectar não resolve, tem que
    // recriar — e a tela precisa dizer isso.
    if (r.status === 404) return { ok: true, state: "inexistente" };
    if (!r.ok) return { ok: false, state: null, erro: `Evolution ${r.status}` };
    const d = await r.json();
    const state = d?.instance?.state ?? d?.state ?? null;
    return { ok: true, state };
  } catch (e: any) {
    return { ok: false, state: null, erro: e.message };
  }
}

// Lista o que existe DE FATO no servidor Evolution. Serve para descobrir
// descompasso entre o cadastro daqui e as instâncias de lá (renomeada,
// apagada, ou uma segunda instância segurando o mesmo número).
export async function listarInstancias(): Promise<{
  ok: boolean;
  instancias: { nome: string; state: string | null; numero: string | null }[];
  erro?: string;
}> {
  const { base, apikey } = await baseEApikey();
  if (!base || !apikey)
    return { ok: false, instancias: [], erro: "Evolution não configurada" };
  try {
    const r = await fetch(`${base}/instance/fetchInstances`, {
      headers: { apikey },
      cache: "no-store",
    });
    if (!r.ok) return { ok: false, instancias: [], erro: `Evolution ${r.status}` };
    const d = await r.json();
    const lista = Array.isArray(d) ? d : d?.instances || [];
    return {
      ok: true,
      instancias: lista.map((x: any) => {
        const i = x?.instance || x;
        return {
          nome: i?.instanceName ?? i?.name ?? "",
          state: i?.connectionStatus ?? i?.state ?? i?.status ?? null,
          numero: (i?.owner ?? i?.number ?? i?.ownerJid ?? "").toString().split("@")[0] || null,
        };
      }),
    };
  } catch (e: any) {
    return { ok: false, instancias: [], erro: e.message };
  }
}

// Cria a instância (caso ainda não exista) - necessário para conectar agentes
// que nunca tiveram WhatsApp. Idempotente: ignora erro de "já existe".
export async function criarInstancia(
  instancia: string,
  apikeyOverride?: string | null
): Promise<{ ok: boolean; erro?: string }> {
  const { base, apikey } = await baseEApikey(apikeyOverride);
  if (!base || !apikey) return { ok: false, erro: "Evolution não configurada" };
  try {
    const r = await fetch(`${base}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({
        instanceName: instancia,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        // Já nasce com a config padrão (histórico, sem grupos, sempre online).
        ...CONFIG_PADRAO,
      }),
    });
    if (r.ok) return { ok: true };
    const t = await r.text();
    // 403/409 normalmente = instância já existe; tratamos como sucesso.
    if (r.status === 403 || r.status === 409 || /already|exists|in use/i.test(t))
      return { ok: true };
    // 401 = a chave de conexão do WhatsApp rotacionou no servidor. Erro em
    // linguagem de gente: o cliente não tem como resolver, é com o suporte.
    if (r.status === 401)
      return {
        ok: false,
        erro:
          "A chave de conexão do WhatsApp expirou no servidor. " +
          "Fale com o suporte do CAND PRO para renovar — depois disso o QR volta a funcionar normalmente.",
      };
    return { ok: false, erro: `Evolution ${r.status}: ${t.slice(0, 200)}` };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// Desconecta a sessão de WhatsApp da instância (logout). Idempotente.
export async function logoutInstancia(
  instancia: string,
  apikeyOverride?: string | null
): Promise<{ ok: boolean; erro?: string }> {
  const { base, apikey } = await baseEApikey(apikeyOverride);
  if (!base || !apikey) return { ok: false, erro: "Evolution não configurada" };
  try {
    const r = await fetch(`${base}/instance/logout/${encodeURIComponent(instancia)}`, {
      method: "DELETE",
      headers: { apikey },
    });
    // 404/400 = já estava deslogada -> tratamos como sucesso
    if (r.ok || r.status === 404 || r.status === 400) return { ok: true };
    const t = await r.text();
    return { ok: false, erro: `Evolution ${r.status}: ${t.slice(0, 200)}` };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// Exclui a instância na Evolution (apaga de vez). Faz logout antes.
export async function deletarInstancia(
  instancia: string,
  apikeyOverride?: string | null
): Promise<{ ok: boolean; erro?: string }> {
  const { base, apikey } = await baseEApikey(apikeyOverride);
  if (!base || !apikey) return { ok: false, erro: "Evolution não configurada" };
  await logoutInstancia(instancia, apikeyOverride); // ignora erro de logout
  try {
    const r = await fetch(`${base}/instance/delete/${encodeURIComponent(instancia)}`, {
      method: "DELETE",
      headers: { apikey },
    });
    if (r.ok || r.status === 404) return { ok: true };
    const t = await r.text();
    return { ok: false, erro: `Evolution ${r.status}: ${t.slice(0, 200)}` };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// ============================================================
// Conteúdo de uma mensagem do WhatsApp em texto legível.
//
// O webhook lia só `conversation` e `extendedTextMessage.text`: qualquer coisa
// que não fosse texto puro (foto, vídeo, áudio, figurinha, documento, legenda,
// enquete) virava mensagem VAZIA na caixa de entrada — as bolhas em branco.
// Aqui todo tipo vira um rótulo, e a legenda da mídia (que é o que a pessoa
// escreveu de fato) tem prioridade.
// ============================================================
export type ConteudoMsg = { texto: string; tipo: string };

export function conteudoDaMensagem(msg: any, profundidade = 0): ConteudoMsg {
  const m = msg || {};
  // Mensagem dentro de mensagem: efêmera, "ver uma vez", documento com legenda.
  const embrulho =
    m.ephemeralMessage?.message ||
    m.viewOnceMessage?.message ||
    m.viewOnceMessageV2?.message ||
    m.viewOnceMessageV2Extension?.message ||
    m.documentWithCaptionMessage?.message ||
    m.editedMessage?.message?.protocolMessage?.editedMessage ||
    null;
  if (embrulho && profundidade < 3) return conteudoDaMensagem(embrulho, profundidade + 1);

  const txt = m.conversation || m.extendedTextMessage?.text || "";
  if (txt) return { texto: txt, tipo: "texto" };

  const comLegenda = (rotulo: string, tipo: string, legenda?: string) => ({
    texto: legenda ? `${rotulo} ${legenda}` : rotulo,
    tipo,
  });

  if (m.imageMessage) return comLegenda("📷 Imagem", "imagem", m.imageMessage.caption);
  if (m.videoMessage) return comLegenda("🎥 Vídeo", "video", m.videoMessage.caption);
  if (m.audioMessage || m.pttMessage) return { texto: "🎤 Áudio", tipo: "audio" };
  if (m.stickerMessage) return { texto: "🙂 Figurinha", tipo: "figurinha" };
  if (m.documentMessage)
    return comLegenda("📎 Documento", "documento", m.documentMessage.fileName || m.documentMessage.caption);
  if (m.contactMessage || m.contactsArrayMessage)
    return comLegenda("👤 Contato", "contato", m.contactMessage?.displayName);
  if (m.locationMessage || m.liveLocationMessage)
    return comLegenda("📍 Localização", "local", m.locationMessage?.name);
  if (m.reactionMessage)
    return { texto: `Reagiu ${m.reactionMessage.text || ""}`.trim(), tipo: "reacao" };
  if (m.pollCreationMessage || m.pollCreationMessageV3)
    return comLegenda("📊 Enquete", "enquete", (m.pollCreationMessage || m.pollCreationMessageV3)?.name);
  if (m.buttonsResponseMessage || m.templateButtonReplyMessage || m.listResponseMessage)
    return {
      texto:
        m.buttonsResponseMessage?.selectedDisplayText ||
        m.templateButtonReplyMessage?.selectedDisplayText ||
        m.listResponseMessage?.title ||
        "Respondeu um botão",
      tipo: "botao",
    };
  if (m.protocolMessage) return { texto: "", tipo: "protocolo" }; // apagar/editar: não é conversa
  return { texto: "", tipo: "desconhecida" };
}

export type MsgEvolution = {
  waId: string;
  numero: string;
  nome: string | null;
  fromMe: boolean;
  texto: string;
  timestamp: number; // epoch (s)
  status: string | null; // sent | delivered | read
};

// Traduz o ACK do WhatsApp para os ticks (✓ / ✓✓).
function mapStatus(rec: any): string | null {
  const ups = Array.isArray(rec?.MessageUpdate) ? rec.MessageUpdate : [];
  const raw = (ups.length ? ups[ups.length - 1]?.status : rec?.status) || "";
  const s = String(raw).toUpperCase();
  if (s.includes("READ") || s.includes("PLAYED")) return "read";
  if (s.includes("DELIVERY")) return "delivered";
  if (s.includes("SERVER") || s.includes("SENT") || s.includes("PENDING")) return "sent";
  return null;
}

// Busca uma página de mensagens da instância. A Evolution v2 retorna
// { messages: { records, pages, currentPage, total } }, mais novas primeiro.
export async function buscarMensagensPagina(
  instancia: string,
  page: number,
  apikeyOverride?: string | null
): Promise<{ ok: boolean; msgs: MsgEvolution[]; pages: number; erro?: string }> {
  const { base, apikey } = await baseEApikey(apikeyOverride);
  if (!base || !apikey)
    return { ok: false, msgs: [], pages: 0, erro: "Evolution não configurada" };
  try {
    const r = await fetch(`${base}/chat/findMessages/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ where: {}, page }),
      cache: "no-store",
    });
    if (!r.ok) {
      const t = await r.text();
      return { ok: false, msgs: [], pages: 0, erro: `Evolution ${r.status}: ${t.slice(0, 200)}` };
    }
    const d = await r.json();
    const box = d?.messages ?? d;
    const records: any[] = box?.records ?? [];
    const pages: number = box?.pages ?? 1;
    const msgs: MsgEvolution[] = [];
    for (const rec of records) {
      const key = rec?.key ?? {};
      // Contas novas usam LID (<id>@lid); o telefone real vem em remoteJidAlt.
      const bruto: string = key?.remoteJid ?? "";
      const alt: string = key?.remoteJidAlt ?? key?.senderPn ?? "";
      const jid: string = bruto.endsWith("@lid") && alt ? alt : bruto;
      if (!jid.endsWith("@s.whatsapp.net")) continue; // ignora grupos/broadcast
      const numero = jid.split("@")[0];
      const waId: string = key?.id ?? "";
      if (!waId || !numero) continue;
      const m = rec?.message ?? {};
      const { texto } = conteudoDaMensagem(m);
      msgs.push({
        waId,
        numero,
        nome: rec?.pushName ?? null,
        fromMe: !!key?.fromMe,
        texto,
        timestamp: Number(rec?.messageTimestamp) || 0,
        status: key?.fromMe ? mapStatus(rec) : null,
      });
    }
    return { ok: true, msgs, pages };
  } catch (e: any) {
    return { ok: false, msgs: [], pages: 0, erro: e.message };
  }
}

// Inicia a conexão e retorna o QR (base64) + pairingCode para parear.
export async function conectarInstancia(
  instancia: string,
  apikeyOverride?: string | null
): Promise<{ ok: boolean; qr?: string | null; pairingCode?: string | null; erro?: string }> {
  const { base, apikey } = await baseEApikey(apikeyOverride);
  if (!base || !apikey) return { ok: false, erro: "Evolution não configurada" };
  try {
    const r = await fetch(`${base}/instance/connect/${encodeURIComponent(instancia)}`, {
      headers: { apikey },
      cache: "no-store",
    });
    if (!r.ok) {
      const t = await r.text();
      return { ok: false, erro: `Evolution ${r.status}: ${t.slice(0, 200)}` };
    }
    const d = await r.json();
    // v2 retorna { base64, code, pairingCode } ou aninhado em { qrcode: {...} }.
    const qr = d?.base64 ?? d?.qrcode?.base64 ?? d?.qrcode ?? null;
    const pairingCode = d?.pairingCode ?? d?.qrcode?.pairingCode ?? null;
    return { ok: true, qr: typeof qr === "string" ? qr : null, pairingCode };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// ===== Mídia (áudio) =====

// Baixa a mídia de uma mensagem recebida (ex.: áudio/voz) e devolve em base64.
// A Evolution guarda a mensagem; pedimos o base64 por ela (o webhook vem sem o
// binário quando webhookBase64=false). Best-effort: nunca lança.
export async function obterMidiaBase64(
  instancia: string,
  mensagem: any,
  apikeyOverride?: string | null
): Promise<{ ok: boolean; base64?: string; mimetype?: string; erro?: string }> {
  const { base, apikey } = await baseEApikey(apikeyOverride);
  if (!base || !apikey) return { ok: false, erro: "Evolution não configurada" };
  try {
    const r = await fetch(
      `${base}/chat/getBase64FromMediaMessage/${encodeURIComponent(instancia)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey },
        body: JSON.stringify({ message: mensagem, convertToMp4: false }),
      }
    );
    if (!r.ok) {
      const t = await r.text();
      return { ok: false, erro: `Evolution ${r.status}: ${t.slice(0, 200)}` };
    }
    const d = await r.json().catch(() => null);
    const base64: string | null = d?.base64 ?? null;
    const mimetype: string | null =
      d?.mimetype ?? d?.mediaType ?? d?.message?.audioMessage?.mimetype ?? null;
    if (!base64) return { ok: false, erro: "sem base64 na resposta" };
    return { ok: true, base64, mimetype: mimetype || undefined };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// ===== Foto de perfil (réplica fiel do WhatsApp) =====

// Busca a foto de perfil de um número e devolve como data-URI base64.
// Guardamos em base64 de propósito: a URL do CDN do WhatsApp expira em horas
// e deixaria o avatar quebrado no dia seguinte.
export async function buscarFotoPerfil(
  instancia: string,
  numero: string,
  apikeyOverride?: string | null
): Promise<string | null> {
  const { base, apikey } = await baseEApikey(apikeyOverride);
  if (!base || !apikey || !instancia || !numero) return null;
  try {
    const r = await fetch(
      `${base}/chat/fetchProfilePictureUrl/${encodeURIComponent(instancia)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey },
        body: JSON.stringify({ number: normalizarNumero(numero) }),
      }
    );
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    const url: string | null = d?.profilePictureUrl ?? d?.url ?? null;
    if (!url || !/^https?:\/\//.test(url)) return null;
    return await baixarComoDataUri(url);
  } catch {
    return null;
  }
}

// Lista TODOS os contatos de uma instância (a caixa de entrada inteira).
// Usado pelo sincronizador: puxa a lista de uma vez e o servidor grava na base.
export type ContatoEvolution = { numero: string; nome: string | null };
export async function buscarContatos(
  instancia: string,
  apikeyOverride?: string | null
): Promise<{ ok: boolean; contatos: ContatoEvolution[]; erro?: string }> {
  const { base, apikey } = await baseEApikey(apikeyOverride);
  if (!base || !apikey || !instancia)
    return { ok: false, contatos: [], erro: "Evolution não configurada" };
  try {
    const r = await fetch(
      `${base}/chat/findContacts/${encodeURIComponent(instancia)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey },
        body: JSON.stringify({ where: {} }),
        cache: "no-store",
      }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return { ok: false, contatos: [], erro: `Evolution ${r.status}: ${t.slice(0, 200)}` };
    }
    const d = await r.json().catch(() => null);
    // A Evolution devolve um array direto ou {records:[...]} conforme a versão.
    const registros: any[] = Array.isArray(d) ? d : d?.records ?? d?.contacts ?? [];
    const vistos = new Set<string>();
    const contatos: ContatoEvolution[] = [];
    for (const c of registros) {
      const jid: string = c?.remoteJid ?? c?.jid ?? "";
      // Só contatos individuais (ignora grupos @g.us e broadcast).
      if (!jid.endsWith("@s.whatsapp.net")) continue;
      const numero = normalizarNumero(jid.split("@")[0]);
      if (!numero || vistos.has(numero)) continue;
      vistos.add(numero);
      const nomeBruto = (c?.pushName ?? c?.name ?? c?.notify ?? "").toString().trim();
      // Nome genérico (só número/vazio) fica NULL — não inventamos identidade.
      const nome = nomeBruto && !/^\+?\d[\d\s()+-]*$/.test(nomeBruto) ? nomeBruto : null;
      contatos.push({ numero, nome });
    }
    return { ok: true, contatos };
  } catch (e: any) {
    return { ok: false, contatos: [], erro: e.message };
  }
}

// Baixa uma imagem e converte para data-URI. Limite de 300KB para não estourar
// a linha do banco nem o payload das telas.
async function baixarComoDataUri(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const tipo = r.headers.get("content-type") || "image/jpeg";
    if (!tipo.startsWith("image/")) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > 300_000) return null;
    return `data:${tipo};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
