import { getConfig } from "./config";
import { query, Mensagem } from "./db";
import { FUNCOES } from "./opcoes";
import { TEMAS, TIPOS } from "./pautas";

// Lista de cargos configurável (config FUNCOES_CARGO), fallback = FUNCOES fixas.
async function listaFuncoes(): Promise<string[]> {
  try {
    const raw = await getConfig("FUNCOES_CARGO");
    const c = raw ? JSON.parse(raw) : null;
    if (Array.isArray(c) && c.length) return c.map((x) => String(x)).filter(Boolean);
  } catch {
    /* ignora */
  }
  return [...FUNCOES];
}

// ============================================================
// Motor de IA dos agentes. Provider-agnóstico (endpoint compatível com a
// OpenAI Chat Completions). A chave é por agente (cost por candidato), com
// fallback para a chave global do config. NUNCA expor o provedor ao cliente.
// ============================================================

const IA_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const IA_MODEL_PADRAO = "gpt-4o-mini";
const TIMEOUT_MS = 25000;

// Guard-rails anexados à persona para resposta natural no WhatsApp.
const GUARDA =
  "\n\nRegras de resposta: escreva de forma curta e natural para WhatsApp " +
  "(1 a 3 frases), sem markdown e sem listas longas. Seja cordial e objetivo. " +
  "Quando fizer sentido, pergunte o primeiro nome e a cidade do eleitor. " +
  "Nunca prometa nada em nome do candidato sem confirmação. " +
  "Nunca faça orações, bênçãos ou pregações religiosas — você pode mencionar valores de fé do candidato, mas não tem autonomia para orar pelo eleitor ou conduzir momentos espirituais.";

// Resolve a chave de IA: a do agente primeiro, senão a global do config.
// Descarta chave de OUTRO fornecedor (legado 'sk-ant-'): o endpoint atual não a
// aceita, e é melhor dizer 'sem chave' do que fingir que existe uma válida.
async function resolverChave(iaKey?: string | null): Promise<string | null> {
  const c =
    iaKey ||
    (await getConfig("IA_API_KEY")) ||
    (await getConfig("ANTHROPIC_API_KEY")); // legado
  if (!c) return null;
  return c.startsWith("sk-ant-") ? null : c;
}

async function chamarIA(
  key: string,
  model: string,
  messages: { role: string; content: string }[]
): Promise<{ ok: boolean; texto?: string; erro?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(IA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        temperature: 0.6,
        messages,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const tx = await r.text();
      console.error("[ia] HTTP", r.status, tx.slice(0, 300));
      return { ok: false, erro: `ia_${r.status}` };
    }
    const d = await r.json();
    const texto = (d?.choices?.[0]?.message?.content ?? "").trim();
    if (!texto) return { ok: false, erro: "vazio" };
    return { ok: true, texto };
  } catch (e: any) {
    console.error("[ia] erro", e?.name, e?.message);
    return { ok: false, erro: e?.name === "AbortError" ? "timeout" : "rede" };
  } finally {
    clearTimeout(t);
  }
}

// Resposta de GESTÃO no grupo interno da equipe: o agente responde perguntas
// com DADOS REAIS do banco (não é atendimento de eleitor). Usa a mesma voz do
// candidato, mas sem pedir nome/cidade e sem tratar como eleitor.
export async function perguntarGestao(
  persona: string,
  contexto: string,
  pergunta: string,
  iaKey?: string | null
): Promise<{ ok: boolean; texto?: string; erro?: string }> {
  const key = await resolverChave(iaKey);
  if (!key) return { ok: false, erro: "Chave de IA não configurada" };
  const model = (await getConfig("IA_MODELO")) || IA_MODEL_PADRAO;
  const system =
    (persona || "Você é o assistente do candidato.") +
    "\n\nCONTEXTO: você está no GRUPO INTERNO da equipe de campanha (não é um eleitor). " +
    "Responda a pergunta da equipe usando SOMENTE os DADOS REAIS abaixo. Seja natural e na sua voz, " +
    "curto (1 a 4 frases), pode usar 1 ou 2 emojis. Se a informação pedida não estiver nos dados, " +
    "diga com sinceridade que ainda não tem esse número. Não invente dados. Não peça nome/cidade, não trate como eleitor.\n\n" +
    "===== DADOS REAIS (agora) =====\n" +
    contexto;
  return chamarIA(key, model, [
    { role: "system", content: system },
    { role: "user", content: pergunta },
  ]);
}

// ===== Treino do agente (Meu Agente) =====

// Chat de TESTE: o candidato conversa com o próprio agente para treiná-lo.
// Usa a persona atual + as mesmas regras de resposta do WhatsApp, mas com um
// histórico avulso (não lê a tabela de mensagens). Retorna sempre um objeto.
export async function responderTeste(
  persona: string,
  historico: { role: string; content: string }[],
  iaKey?: string | null
): Promise<{ ok: boolean; texto?: string; erro?: string }> {
  const key = await resolverChave(iaKey);
  if (!key) return { ok: false, erro: "Chave de IA não configurada" };
  const model = (await getConfig("IA_MODEL")) || IA_MODEL_PADRAO;
  const hist = (historico || [])
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .slice(-20);
  while (hist.length && hist[0].role !== "user") hist.shift();
  if (!hist.length) return { ok: false, erro: "Sem mensagem" };
  return chamarIA(key, model, [
    { role: "system", content: (persona || "Você é um assistente cordial.") + GUARDA },
    ...hist,
  ]);
}

// Consolida as respostas da entrevista guiada em INSTRUÇÕES de persona (na voz
// do candidato). Não inventa fatos. Retorna sempre um objeto.
export async function consolidarEntrevista(
  qa: { pergunta: string; resposta: string }[],
  iaKey?: string | null
): Promise<{ ok: boolean; texto?: string; erro?: string }> {
  const key = await resolverChave(iaKey);
  if (!key) return { ok: false, erro: "Chave de IA não configurada" };
  const model = (await getConfig("IA_MODEL")) || IA_MODEL_PADRAO;
  const entrevista = (qa || [])
    .filter((x) => x && x.resposta && x.resposta.trim())
    .map((x, i) => `P${i + 1}. ${x.pergunta}\nR: ${x.resposta.trim()}`)
    .join("\n\n");
  if (!entrevista) return { ok: false, erro: "Entrevista vazia" };
  const system =
    "Você organiza as respostas de uma entrevista com um candidato político para virar INSTRUÇÕES " +
    "de um assistente de IA que responde eleitores no WhatsApp na voz do candidato. " +
    "Escreva um texto em português, em 2ª pessoa ('Você...'), curto e direto (no máximo 12 linhas), com: " +
    "quem é o candidato (bio essencial), as bandeiras e prioridades, o tom de voz, e como responder os temas citados. " +
    "NÃO invente fatos além do que foi dito. Não use markdown nem títulos: texto corrido ou marcadores simples. " +
    "Não repita instruções genéricas de cordialidade.";
  return chamarIA(key, model, [
    { role: "system", content: system },
    { role: "user", content: entrevista },
  ]);
}

// Estima a posição na matriz política (2 eixos) a partir da persona/posições do
// candidato. Aprendizado/calibragem: a IA lê o que já se sabe e sugere X e Y.
export async function estimarPosicaoPolitica(
  persona: string,
  iaKey?: string | null
): Promise<{ ok: boolean; economico?: number; social?: number; justificativa?: string; erro?: string }> {
  const key = await resolverChave(iaKey);
  if (!key) return { ok: false, erro: "Chave de IA não configurada" };
  const model = (await getConfig("IA_MODEL")) || IA_MODEL_PADRAO;
  const system =
    "Você é um cientista político. A partir da descrição/posições do candidato, estime a posição dele em DOIS eixos, " +
    "cada um de -10 a +10. Eixo 'economico': -10 = esquerda (Estado forte, coletivo) e +10 = direita (mercado livre, iniciativa privada). " +
    "Eixo 'social': -10 = libertário/progressista (liberdade de costumes, pautas de diversidade) e +10 = autoritário/conservador (valores tradicionais, mais rigor). " +
    "Responda SOMENTE com JSON válido: {\"economico\": <número>, \"social\": <número>, \"justificativa\": \"<1 a 2 frases>\"}. " +
    "Se a informação for insuficiente, aproxime do centro (0) e diga isso na justificativa. Não escreva nada além do JSON.";
  const r = await chamarIA(key, model, [
    { role: "system", content: system },
    { role: "user", content: (persona || "").slice(0, 4000) || "Sem informações." },
  ]);
  if (!r.ok || !r.texto) return { ok: false, erro: r.erro || "vazio" };
  try {
    const bruto = r.texto.replace(/```json|```/gi, "").trim();
    const ini = bruto.indexOf("{");
    const fim = bruto.lastIndexOf("}");
    if (ini < 0 || fim < 0) return { ok: false, erro: "sem json" };
    const o = JSON.parse(bruto.slice(ini, fim + 1));
    const num = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(-10, Math.min(10, Math.round(n * 10) / 10)) : 0;
    };
    return {
      ok: true,
      economico: num(o.economico),
      social: num(o.social),
      justificativa: (o.justificativa ?? "").toString().slice(0, 400),
    };
  } catch {
    return { ok: false, erro: "parse" };
  }
}

// Transcreve um áudio (voz do eleitor) para texto, usando o endpoint de
// transcrição compatível com a OpenAI (Whisper). A chave é a do agente (custo
// por candidato), com fallback para a global. Retorna sempre um objeto.
const IA_TRANSCRICAO_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const IA_TRANSCRICAO_MODELO = "whisper-1";

export async function transcreverAudio(
  base64: string,
  mimetype: string | null | undefined,
  iaKey?: string | null
): Promise<{ ok: boolean; texto?: string; erro?: string }> {
  const key = await resolverChave(iaKey);
  if (!key) return { ok: false, erro: "Chave de IA não configurada" };
  if (!base64) return { ok: false, erro: "áudio vazio" };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const buf = Buffer.from(base64, "base64");
    const tipo = mimetype || "audio/ogg";
    // A extensão ajuda o provedor a decodificar; voz do WhatsApp é ogg/opus.
    const ext = tipo.includes("mp4") || tipo.includes("m4a")
      ? "m4a"
      : tipo.includes("mpeg") || tipo.includes("mp3")
      ? "mp3"
      : tipo.includes("webm")
      ? "webm"
      : tipo.includes("wav")
      ? "wav"
      : "ogg";
    const form = new FormData();
    form.append("file", new Blob([buf], { type: tipo }), `audio.${ext}`);
    form.append("model", (await getConfig("IA_TRANSCRICAO_MODELO")) || IA_TRANSCRICAO_MODELO);
    form.append("language", "pt");
    const r = await fetch(IA_TRANSCRICAO_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const tx = await r.text();
      console.error("[ia] transcricao HTTP", r.status, tx.slice(0, 300));
      return { ok: false, erro: `transcricao_${r.status}` };
    }
    const d = await r.json().catch(() => null);
    const texto = (d?.text ?? "").trim();
    if (!texto) return { ok: false, erro: "vazio" };
    return { ok: true, texto };
  } catch (e: any) {
    console.error("[ia] transcricao erro", e?.name, e?.message);
    return { ok: false, erro: e?.name === "AbortError" ? "timeout" : "rede" };
  } finally {
    clearTimeout(t);
  }
}

// Extrai nome + cidade da conversa (para cadastro automático do eleitor).
// Reusa o mesmo histórico e motor de IA. Retorna sempre um objeto (nunca lança).
export async function extrairNomeCidade(
  agenteId: number,
  contato: string,
  iaKey?: string | null
): Promise<{ nome: string | null; cidade: string | null; funcao: string | null; funcao_outro: string | null }> {
  const vazio = { nome: null, cidade: null, funcao: null, funcao_outro: null };
  const key = await resolverChave(iaKey);
  if (!key) return vazio;
  const cargos = await listaFuncoes();
  const model = (await getConfig("IA_MODEL")) || IA_MODEL_PADRAO;

  const historico = await query<Pick<Mensagem, "direcao" | "texto">>(
    "SELECT direcao, texto FROM mensagens WHERE agente_id = $1 AND contato = $2 AND direcao IN ('in','out') ORDER BY id DESC LIMIT 12",
    [agenteId, contato]
  );
  const conversa = historico
    .reverse()
    .filter((m) => m.texto)
    .map((m) => `${m.direcao === "in" ? "Eleitor" : "Assistente"}: ${m.texto}`)
    .join("\n");
  if (!conversa) return vazio;

  const messages = [
    {
      role: "system",
      content:
        "Você extrai dados de uma conversa de WhatsApp entre um assistente político e um eleitor. " +
        "Responda SOMENTE com JSON válido no formato {\"nome\": <primeiro nome do eleitor ou null>, " +
        "\"cidade\": <cidade do eleitor ou null>, \"funcao\": <um cargo da lista ou 'Outro' ou null>, " +
        "\"funcao_outro\": <o cargo específico quando funcao='Outro', senão null>}. " +
        "Para 'funcao', escolha EXATAMENTE um destes: " + cargos.join(", ") + ". " +
        "Se a profissão/cargo mencionado não estiver na lista, use \"Outro\" e coloque o cargo em \"funcao_outro\". " +
        "Use null quando a informação não estiver clara. Nunca invente. Não escreva mais nada além do JSON.",
    },
    { role: "user", content: conversa },
  ];

  const r = await chamarIA(key, model, messages);
  if (!r.ok || !r.texto) return vazio;
  try {
    const bruto = r.texto.replace(/```json|```/gi, "").trim();
    const ini = bruto.indexOf("{");
    const fim = bruto.lastIndexOf("}");
    if (ini < 0 || fim < 0) return vazio;
    const obj = JSON.parse(bruto.slice(ini, fim + 1));
    const limpa = (v: any) => {
      const s = (v ?? "").toString().trim();
      if (!s || /^(null|n\/a|-)$/i.test(s)) return null;
      return s.slice(0, 80);
    };
    // Valida a função contra a lista (case-insensitive); fora dela vira "Outro".
    let funcao = limpa(obj.funcao);
    let funcaoOutro = limpa(obj.funcao_outro);
    if (funcao) {
      const casa = cargos.find((c) => c.toLowerCase() === funcao!.toLowerCase());
      if (casa) funcao = casa;
      else { funcaoOutro = funcaoOutro || funcao; funcao = "Outro"; }
    }
    if (funcao !== "Outro") funcaoOutro = null;
    return { nome: limpa(obj.nome), cidade: limpa(obj.cidade), funcao, funcao_outro: funcaoOutro };
  } catch {
    return vazio;
  }
}

// Extrai uma PAUTA (demanda/denúncia/sugestão) de uma conversa de WhatsApp.
// Retorna null quando não há pauta clara. Nunca lança.
export async function extrairPauta(
  agenteId: number,
  contato: string,
  iaKey?: string | null
): Promise<{ tema: string; tipo: string; titulo: string; descricao: string } | null> {
  const key = await resolverChave(iaKey);
  if (!key) return null;
  const model = (await getConfig("IA_MODEL")) || IA_MODEL_PADRAO;
  const historico = await query<Pick<Mensagem, "direcao" | "texto">>(
    "SELECT direcao, texto FROM mensagens WHERE agente_id = $1 AND contato = $2 AND direcao IN ('in','out') ORDER BY id DESC LIMIT 20",
    [agenteId, contato]
  );
  const conversa = historico
    .reverse()
    .filter((m) => m.texto)
    .map((m) => `${m.direcao === "in" ? "Eleitor" : "Assistente"}: ${m.texto}`)
    .join("\n");
  if (!conversa) return null;

  const temas = TEMAS.map((t) => t.v).join(", ");
  const tipos = TIPOS.map((t) => t.v).join(", ");
  const r = await chamarIA(key, model, [
    {
      role: "system",
      content:
        "Você extrai uma PAUTA (pedido, denúncia ou sugestão) que o eleitor trouxe nesta conversa de WhatsApp com um gabinete. " +
        "Responda SOMENTE com JSON: {\"tem_pauta\": true|false, \"tema\": <um de: " + temas + ">, \"tipo\": <um de: " + tipos + ">, " +
        "\"titulo\": <resumo curto>, \"descricao\": <a pauta em 1 a 3 frases, com o que a pessoa precisa>}. " +
        "Se a conversa for só saudação/agradecimento sem demanda, use tem_pauta=false. Não invente. Nada além do JSON.",
    },
    { role: "user", content: conversa },
  ]);
  if (!r.ok || !r.texto) return null;
  try {
    const bruto = r.texto.replace(/```json|```/gi, "").trim();
    const o = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1));
    if (!o.tem_pauta) return null;
    const descricao = (o.descricao ?? "").toString().trim();
    if (!descricao) return null;
    const tema = TEMAS.some((t) => t.v === o.tema) ? o.tema : "outros";
    const tipo = TIPOS.some((t) => t.v === o.tipo) ? o.tipo : "solicitacao";
    return { tema, tipo, titulo: (o.titulo ?? "").toString().trim().slice(0, 160), descricao: descricao.slice(0, 2000) };
  } catch {
    return null;
  }
}

// Gera a resposta do agente para um contato. `iaKey` = chave do agente.
export async function gerarResposta(
  agenteId: number,
  persona: string,
  contato: string,
  iaKey?: string | null
): Promise<{ ok: boolean; texto?: string; erro?: string }> {
  const key = await resolverChave(iaKey);
  if (!key) return { ok: false, erro: "Chave de IA não configurada" };

  const model = (await getConfig("IA_MODEL")) || IA_MODEL_PADRAO;

  // Histórico recente (últimas 24 mensagens reais dessa conversa) - mais contexto
  // para NÃO repetir perguntas já respondidas.
  const historico = await query<Pick<Mensagem, "direcao" | "texto">>(
    "SELECT direcao, texto FROM mensagens WHERE agente_id = $1 AND contato = $2 AND direcao IN ('in','out') ORDER BY id DESC LIMIT 24",
    [agenteId, contato]
  );

  const hist = historico
    .reverse()
    .filter((m) => m.texto)
    .map((m) => ({
      role: m.direcao === "in" ? "user" : "assistant",
      content: m.texto as string,
    }));

  // Garante que comece com o usuário.
  while (hist.length && hist[0].role !== "user") hist.shift();
  if (!hist.length) return { ok: false, erro: "Sem mensagem do contato" };

  // Dados que já sabemos deste contato (cadastro): a IA NUNCA deve reperguntar.
  let fatos = "";
  try {
    const digitos = (contato || "").replace(/\D/g, "");
    const p = await query<{ nome: string | null; cidade: string | null; funcao: string | null }>(
      `SELECT nome, cidade, funcao FROM pessoas
        WHERE regexp_replace(COALESCE(whatsapp,''),'\\D','','g') = $1 AND agente_id = $2 LIMIT 1`,
      [digitos, agenteId]
    );
    const r0 = p[0];
    if (r0) {
      const partes: string[] = [];
      const nomeOk = (r0.nome || "").trim();
      if (nomeOk && !/^\d+$/.test(nomeOk) && !/contato/i.test(nomeOk)) partes.push(`Nome: ${nomeOk}`);
      if ((r0.cidade || "").trim()) partes.push(`Cidade: ${r0.cidade}`);
      if ((r0.funcao || "").trim()) partes.push(`Função/cargo: ${r0.funcao}`);
      if (partes.length)
        fatos = "\n\nDADOS QUE VOCÊ JÁ SABE DESTE CONTATO (não pergunte de novo o que já está aqui; use com naturalidade): " + partes.join("; ") + ".";
    }
  } catch {
    /* fatos é enriquecimento, best-effort */
  }

  const messages = [
    { role: "system", content: (persona || "Você é um assistente cordial.") + fatos + GUARDA },
    ...hist,
  ];

  // Estabilidade: 1 retry em falha transitória (timeout/rede/5xx).
  let r = await chamarIA(key, model, messages);
  if (!r.ok && (r.erro === "timeout" || r.erro === "rede" || /^ia_5/.test(r.erro || ""))) {
    r = await chamarIA(key, model, messages);
  }
  if (r.ok) return r;

  // Erro genérico para o cliente (provedor nunca exposto); detalhe fica no log.
  return { ok: false, erro: "Falha ao gerar resposta da IA" };
}
