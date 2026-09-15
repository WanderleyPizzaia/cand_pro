import { getConfig } from "./config";
import { enviarTexto, enviarAudioEvolution, enviarImagemEvolution, normalizarNumero } from "./evolution";
import { paraOggOpus } from "./audioConv";
import type { Agente, TemplateVar } from "./db";

// ============================================================
// Cliente da WhatsApp Cloud API oficial (Meta / Graph API).
// Usado pelos agentes com provedor = 'meta'. Fala DIRETO com
// graph.facebook.com (sem Evolution no meio). Token e phone_number_id
// são por agente (colunas meta_token / meta_phone_id).
// ============================================================

async function apiVersion(): Promise<string> {
  return (await getConfig("META_API_VERSION")) || "v21.0";
}

// Envia uma mensagem de TEXTO livre (válido dentro da janela de 24h após
// o contato ter mandado mensagem). Retorna o wamid para dedup/ticks.
// Envia ÁUDIO pela Meta Cloud API: (1) faz upload da mídia (multipart) para
// obter um media id, (2) envia a mensagem type=audio com esse id.
// A Meta aceita voz em audio/ogg (opus), mp3, aac, amr. WebM do navegador NÃO
// é aceito — o chamador deve mandar ogg/opus (ou mp3).
export async function enviarAudioMeta(
  phoneId: string,
  token: string,
  numero: string,
  base64: string,
  mime = "audio/ogg"
): Promise<{ ok: boolean; waId?: string | null; erro?: string }> {
  if (!phoneId || !token) return { ok: false, erro: "Credenciais Meta ausentes" };
  // A Meta recusa WebM (formato que o Chrome grava). Convertemos no servidor
  // para OGG/Opus, que a Meta aceita, antes de subir a mídia.
  if (/webm/i.test(mime)) {
    const conv = await paraOggOpus(base64, mime);
    if (!conv)
      return {
        ok: false,
        erro:
          "Não foi possível converter o áudio WebM para o formato da Meta. Tente novamente ou grave no Firefox/Safari.",
      };
    base64 = conv.base64;
    mime = conv.mime;
  }
  const ver = await apiVersion();
  const to = normalizarNumero(numero);
  try {
    // 1) Upload da mídia. Extensão do arquivo casada com o mime.
    const bin = Buffer.from(base64, "base64");
    const ext = /mp4/i.test(mime) ? "m4a" : /mpeg/i.test(mime) ? "mp3" : /aac/i.test(mime) ? "aac" : /amr/i.test(mime) ? "amr" : "ogg";
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mime);
    form.append("file", new Blob([bin], { type: mime }), `audio.${ext}`);
    const up = await fetch(`https://graph.facebook.com/${ver}/${phoneId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const ud = await up.json().catch(() => ({}));
    if (!up.ok || !ud?.id)
      return { ok: false, erro: `Meta upload: ${String(ud?.error?.message || up.status).slice(0, 200)}` };

    // 2) Envia a mensagem de áudio com o media id.
    const r = await fetch(`https://graph.facebook.com/${ver}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "audio", audio: { id: ud.id } }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: `Meta: ${String(d?.error?.message || r.status).slice(0, 200)}` };
    return { ok: true, waId: d?.messages?.[0]?.id ?? null };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// Envia IMAGEM pela Meta Cloud API: upload da mídia + mensagem type=image.
// `mime` = image/jpeg | image/png. `legenda` opcional (caption).
export async function enviarImagemMeta(
  phoneId: string,
  token: string,
  numero: string,
  base64: string,
  mime = "image/jpeg",
  legenda = ""
): Promise<{ ok: boolean; waId?: string | null; erro?: string }> {
  if (!phoneId || !token) return { ok: false, erro: "Credenciais Meta ausentes" };
  const ver = await apiVersion();
  const to = normalizarNumero(numero);
  try {
    const bin = Buffer.from(base64, "base64");
    const ext = /png/i.test(mime) ? "png" : /webp/i.test(mime) ? "webp" : "jpg";
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mime);
    form.append("file", new Blob([bin], { type: mime }), `imagem.${ext}`);
    const up = await fetch(`https://graph.facebook.com/${ver}/${phoneId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const ud = await up.json().catch(() => ({}));
    if (!up.ok || !ud?.id)
      return { ok: false, erro: `Meta upload: ${String(ud?.error?.message || up.status).slice(0, 200)}` };

    const img: any = { id: ud.id };
    if (legenda) img.caption = legenda;
    const r = await fetch(`https://graph.facebook.com/${ver}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "image", image: img }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: `Meta: ${String(d?.error?.message || r.status).slice(0, 200)}` };
    return { ok: true, waId: d?.messages?.[0]?.id ?? null };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// Dispatcher: envia imagem pelo provedor do agente (Meta ou Evolution).
export async function enviarImagemAgente(
  agente: Agente,
  numero: string,
  base64: string,
  mime = "image/jpeg",
  legenda = ""
): Promise<{ ok: boolean; waId?: string | null; erro?: string }> {
  if (agente.provedor === "meta")
    return enviarImagemMeta(agente.meta_phone_id || "", agente.meta_token || "", numero, base64, mime, legenda);
  if (!agente.instancia) return { ok: false, erro: "Agente sem instância configurada." };
  return enviarImagemEvolution(agente.instancia, normalizarNumero(numero), base64, mime, legenda, agente.apikey);
}

// Dispatcher: envia áudio pelo provedor do agente (Meta ou Evolution).
export async function enviarAudioAgente(
  agente: Agente,
  numero: string,
  base64: string,
  mime = "audio/ogg"
): Promise<{ ok: boolean; waId?: string | null; erro?: string }> {
  if (agente.provedor === "meta")
    return enviarAudioMeta(agente.meta_phone_id || "", agente.meta_token || "", numero, base64, mime);
  if (!agente.instancia) return { ok: false, erro: "Agente sem instância configurada." };
  return enviarAudioEvolution(agente.instancia, normalizarNumero(numero), base64, agente.apikey);
}

export async function enviarTextoMeta(
  phoneId: string,
  token: string,
  numero: string,
  texto: string
): Promise<{ ok: boolean; waId?: string | null; erro?: string }> {
  if (!phoneId || !token) return { ok: false, erro: "Credenciais Meta ausentes" };
  const ver = await apiVersion();
  const to = normalizarNumero(numero);
  try {
    const r = await fetch(`https://graph.facebook.com/${ver}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: texto, preview_url: false },
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = d?.error?.message || `HTTP ${r.status}`;
      return { ok: false, erro: `Meta: ${String(msg).slice(0, 200)}` };
    }
    const waId = d?.messages?.[0]?.id ?? null;
    return { ok: true, waId };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// Mostra "digitando…" no WhatsApp do contato (e marca a última mensagem como lida).
// A Cloud API expõe o typing indicator via o próprio endpoint /messages, usando o
// wamid da mensagem RECEBIDA. Dura ~25s ou até enviarmos a resposta. Best-effort.
export async function enviarTypingMeta(
  phoneId: string,
  token: string,
  messageId: string
): Promise<{ ok: boolean; erro?: string }> {
  if (!phoneId || !token || !messageId) return { ok: false, erro: "Parâmetros ausentes" };
  const ver = await apiVersion();
  try {
    const r = await fetch(`https://graph.facebook.com/${ver}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" },
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return { ok: false, erro: `Meta: ${String(d?.error?.message || r.status).slice(0, 160)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// Baixa uma mídia recebida (áudio/imagem) da Cloud API em base64.
// Passo 1: GET /{mediaId} -> devolve a URL temporária + mime_type.
// Passo 2: GET dessa URL (com o token) -> bytes -> base64. Best-effort.
export async function obterMidiaMeta(
  mediaId: string,
  token: string
): Promise<{ ok: boolean; base64?: string; mimetype?: string; erro?: string }> {
  if (!mediaId || !token) return { ok: false, erro: "Parâmetros ausentes" };
  const ver = await apiVersion();
  try {
    const meta = await fetch(`https://graph.facebook.com/${ver}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const info = await meta.json().catch(() => ({}));
    if (!meta.ok || !info?.url)
      return { ok: false, erro: `Meta: ${String(info?.error?.message || meta.status).slice(0, 160)}` };

    const bin = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!bin.ok) return { ok: false, erro: `Meta media HTTP ${bin.status}` };
    const buf = Buffer.from(await bin.arrayBuffer());
    return { ok: true, base64: buf.toString("base64"), mimetype: info.mime_type || "audio/ogg" };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// Envia um TEMPLATE aprovado. Único caminho permitido fora da janela de 24h
// (disparo ativo/campanha). `variaveis` preenche os {{1}}, {{2}}… do corpo.
export async function enviarTemplateMeta(
  phoneId: string,
  token: string,
  numero: string,
  template: string,
  idioma: string,
  variaveis: string[] = []
): Promise<{ ok: boolean; waId?: string | null; erro?: string }> {
  if (!phoneId || !token) return { ok: false, erro: "Credenciais Meta ausentes" };
  if (!template) return { ok: false, erro: "Template não informado" };
  const ver = await apiVersion();
  const to = normalizarNumero(numero);
  const components = variaveis.length
    ? [
        {
          type: "body",
          parameters: variaveis.map((v) => ({ type: "text", text: v || "" })),
        },
      ]
    : undefined;
  try {
    const r = await fetch(`https://graph.facebook.com/${ver}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template,
          language: { code: idioma || "pt_BR" },
          ...(components ? { components } : {}),
        },
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = d?.error?.message || `HTTP ${r.status}`;
      return { ok: false, erro: `Meta: ${String(msg).slice(0, 200)}` };
    }
    return { ok: true, waId: d?.messages?.[0]?.id ?? null };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

export type TemplateMeta = {
  nome: string;
  idioma: string;
  status: string;
  corpo: string;
  variaveis: number;
  motivo?: string | null;
  categoria?: string | null;
};

// Lista os templates da WABA (só os APROVADOS servem para disparo).
export async function listarTemplatesMeta(
  wabaId: string,
  token: string
): Promise<{ ok: boolean; templates?: TemplateMeta[]; erro?: string }> {
  if (!wabaId || !token) return { ok: false, erro: "Credenciais Meta ausentes" };
  const ver = await apiVersion();
  try {
    const r = await fetch(
      `https://graph.facebook.com/${ver}/${wabaId}/message_templates?limit=100&fields=name,language,status,category,components,rejected_reason`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const d = await r.json().catch(() => ({}));
    if (!r.ok)
      return { ok: false, erro: `Meta: ${String(d?.error?.message || r.status).slice(0, 200)}` };
    const templates: TemplateMeta[] = (d?.data ?? []).map((t: any) => {
      const body = (t.components ?? []).find((c: any) => c.type === "BODY");
      const corpo = body?.text ?? "";
      const vars = new Set<string>(
        (corpo.match(/\{\{\d+\}\}/g) ?? []) as string[]
      );
      return {
        nome: t.name,
        idioma: t.language,
        status: t.status,
        corpo,
        variaveis: vars.size,
        motivo: t.rejected_reason ?? null,
        categoria: t.category ?? null,
      };
    });
    return { ok: true, templates };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// Valida as credenciais consultando o número (status "conectado" no card).
export async function validarNumeroMeta(
  phoneId: string,
  token: string
): Promise<{ ok: boolean; numero?: string | null; erro?: string }> {
  if (!phoneId || !token) return { ok: false, erro: "Credenciais Meta ausentes" };
  const ver = await apiVersion();
  try {
    const r = await fetch(
      `https://graph.facebook.com/${ver}/${phoneId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = d?.error?.message || `HTTP ${r.status}`;
      return { ok: false, erro: String(msg).slice(0, 200) };
    }
    return { ok: true, numero: d?.display_phone_number ?? null };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// Envio provider-agnóstico: decide entre Meta (oficial) e Evolution pelo agente.
// Retorna waId quando disponível (Meta) para dedup/ticks.
export async function enviarMensagemAgente(
  agente: Agente,
  numero: string,
  texto: string
): Promise<{ ok: boolean; waId?: string | null; erro?: string }> {
  if (agente.provedor === "meta") {
    return enviarTextoMeta(agente.meta_phone_id || "", agente.meta_token || "", numero, texto);
  }
  if (!agente.instancia) return { ok: false, erro: "Agente sem instância configurada." };
  const r = await enviarTexto(agente.instancia, normalizarNumero(numero), texto, agente.apikey);
  // Repassa o waId — é por ele que o webhook casa entregue/lido (rastreamento).
  return { ok: r.ok, waId: r.waId, erro: r.erro };
}

// ===== Parse do webhook da Meta =====

export type MsgMeta = {
  waId: string; // id da mensagem (wamid) -> dedup
  numero: string; // remetente (só dígitos)
  nome: string | null;
  texto: string;
  // Áudio (voz do eleitor): id da mídia + mime para baixar e transcrever.
  audio?: { id: string; mime: string } | null;
  // Imagem recebida: id da mídia + mime + legenda.
  imagem?: { id: string; mime: string; caption: string } | null;
  timestamp: number; // epoch (s)
  phoneId: string; // metadata.phone_number_id -> identifica o agente
};

export type StatusMeta = {
  waId: string;
  status: string; // sent | delivered | read
};

// Extrai mensagens de texto recebidas de um payload da Meta.
export function extrairMensagens(body: any): MsgMeta[] {
  const out: MsgMeta[] = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const e of entries) {
    const changes = Array.isArray(e?.changes) ? e.changes : [];
    for (const ch of changes) {
      const v = ch?.value ?? {};
      const phoneId = v?.metadata?.phone_number_id ?? "";
      const contatos = Array.isArray(v?.contacts) ? v.contacts : [];
      const nomePorWa: Record<string, string> = {};
      for (const c of contatos) {
        if (c?.wa_id) nomePorWa[c.wa_id] = c?.profile?.name ?? "";
      }
      const msgs = Array.isArray(v?.messages) ? v.messages : [];
      for (const m of msgs) {
        const texto =
          m?.text?.body ||
          m?.button?.text ||
          m?.interactive?.list_reply?.title ||
          m?.interactive?.button_reply?.title ||
          "";
        // Voz do eleitor: sem texto, mas com áudio/ptt — capturamos para transcrever.
        const audioNode = m?.audio || m?.voice || null;
        const audio =
          audioNode?.id ? { id: audioNode.id, mime: audioNode.mime_type || "audio/ogg" } : null;
        const imagem =
          m?.image?.id ? { id: m.image.id, mime: m.image.mime_type || "image/jpeg", caption: m.image.caption || "" } : null;
        const numero = m?.from ?? "";
        const waId = m?.id ?? "";
        if (!numero || !waId || (!texto && !audio && !imagem)) continue;
        out.push({
          waId,
          numero,
          nome: nomePorWa[numero] || null,
          texto,
          audio,
          imagem,
          timestamp: Number(m?.timestamp) || 0,
          phoneId,
        });
      }
    }
  }
  return out;
}

// Extrai atualizações de status (ticks) de um payload da Meta.
export function extrairStatuses(body: any): StatusMeta[] {
  const out: StatusMeta[] = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const e of entries) {
    const changes = Array.isArray(e?.changes) ? e.changes : [];
    for (const ch of changes) {
      const sts = Array.isArray(ch?.value?.statuses) ? ch.value.statuses : [];
      for (const s of sts) {
        const waId = s?.id ?? "";
        const st = String(s?.status ?? "").toLowerCase();
        if (!waId || !st) continue;
        const mapeado =
          st === "read" || st === "played"
            ? "read"
            : st === "delivered"
            ? "delivered"
            : "sent";
        out.push({ waId, status: mapeado });
      }
    }
  }
  return out;
}

// ===== Criação/gestão de templates (Graph API) =====

export type TemplateInput = {
  header?: { formato: "TEXTO"; texto?: string } | null;
  corpo: string; // com {{1}}, {{2}}...
  variaveis: TemplateVar[];
  rodape?: string | null;
  botoes?: Array<{ tipo: "URL" | "RAPIDA"; texto: string; url?: string }>;
};

// Monta o array `components` exatamente no formato que a Meta espera.
export function montarComponents(input: TemplateInput): any[] {
  const comps: any[] = [];

  if (input.header) {
    if (input.header.formato === "TEXTO" && input.header.texto) {
      comps.push({ type: "HEADER", format: "TEXT", text: input.header.texto });
    }
  }

  const body: any = { type: "BODY", text: input.corpo };
  const exemplos = [...input.variaveis]
    .sort((a, b) => a.pos - b.pos)
    .map((v) => v.exemplo || "");
  if (exemplos.length) body.example = { body_text: [exemplos] };
  comps.push(body);

  if (input.rodape) comps.push({ type: "FOOTER", text: input.rodape });

  if (input.botoes && input.botoes.length) {
    comps.push({
      type: "BUTTONS",
      buttons: input.botoes.map((b) =>
        b.tipo === "URL"
          ? { type: "URL", text: b.texto, url: b.url || "" }
          : { type: "QUICK_REPLY", text: b.texto }
      ),
    });
  }

  return comps;
}

// Cria (submete para aprovação) um template na WABA.
export async function criarTemplateMeta(
  wabaId: string,
  token: string,
  payload: { name: string; category: string; language: string; components: any[] }
): Promise<{ ok: boolean; metaId?: string | null; status?: string | null; erro?: string }> {
  if (!wabaId || !token) return { ok: false, erro: "Credenciais Meta ausentes" };
  const ver = await apiVersion();
  try {
    const r = await fetch(`https://graph.facebook.com/${ver}/${wabaId}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payload.name,
        category: payload.category,
        language: payload.language,
        components: payload.components,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = d?.error || {};
      // Mostra o motivo real da Meta: error_user_msg é o texto amigável (ex.: qual
      // parâmetro está inválido); message é o técnico. type "OAuthException" é
      // genérico e NÃO significa, por si só, falta de permissão.
      let msg = err.error_user_msg || err.message || `HTTP ${r.status}`;
      // Só sugere a permissão quando o erro é REALMENTE de permissão/token.
      const code = err.code;
      const ehPermissao =
        r.status === 403 ||
        [10, 200, 803].includes(code) ||
        /permission|not have|scope/i.test(String(err.message));
      if (ehPermissao) {
        msg = `${msg} — verifique se o token tem a permissão 'whatsapp_business_management'.`;
      }
      return { ok: false, erro: `Meta: ${String(msg).slice(0, 280)}` };
    }
    return { ok: true, metaId: d?.id ?? null, status: d?.status ?? "PENDING" };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// Exclui um template da WABA (por nome).
export async function excluirTemplateMeta(
  wabaId: string,
  token: string,
  nome: string
): Promise<{ ok: boolean; erro?: string }> {
  if (!wabaId || !token) return { ok: false, erro: "Credenciais Meta ausentes" };
  const ver = await apiVersion();
  try {
    const r = await fetch(
      `https://graph.facebook.com/${ver}/${wabaId}/message_templates?name=${encodeURIComponent(nome)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: `Meta: ${String(d?.error?.message || r.status).slice(0, 200)}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}
