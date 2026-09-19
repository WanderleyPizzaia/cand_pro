import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute, Agente, Pessoa, Template, TemplateVar, quotaEfetiva, disparosUsadosHoje } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { normalizarNumero } from "@/lib/evolution";
import { agentesDaSessao } from "@/lib/escopo";
import {
  enviarMensagemAgente,
  enviarTemplateMeta,
  listarTemplatesMeta,
} from "@/lib/meta";

export const dynamic = "force-dynamic";
// Envio síncrono em paralelo (blocos de CONCORRENCIA). Damos mais tempo à função.
export const maxDuration = 60;

// Envios simultâneos por bloco. Sobe o volume sem estourar o tempo nem bater
// forte no rate limit da Meta. ~0,3s/envio ÷ 6 → ~600 em ~30s.
const CONCORRENCIA = 10;
const MAX = 500; // limite por disparo SÍNCRONO (paralelismo 10 + margem p/ 60s)
// Modo n8n: o envio é assíncrono (o n8n faz o loop com intervalo), então aceitamos
// listas grandes. Teto de segurança para não montar um payload gigante de uma vez.
const MAX_N8N = 5000;

function autorizado() {
  const s = getSessao();
  if (!s || !["ADMIN", "COORDENACAO", "CANDIDATO"].includes(s.perfil)) return null;
  return s;
}

function personalizar(msg: string, p: Pessoa): string {
  const primeiro = (p.nome || "").split(" ")[0];
  return msg
    .replace(/\{nome\}/gi, p.nome || "")
    .replace(/\{primeiro_nome\}/gi, primeiro)
    .replace(/\{cidade\}/gi, p.cidade || "");
}

// Valor de uma variável do template a partir da coluna mapeada de `pessoas`.
function valorCampo(campo: string | null, p: Pessoa): string {
  if (!campo) return "";
  if (campo === "primeiro_nome") return (p.nome || "").split(" ")[0];
  const v = (p as any)[campo];
  return v == null ? "" : String(v);
}

// Monta os parâmetros do CORPO do template na ordem de `pos` — um por {{n}}.
// É isto que conserta o erro (#131009): antes mandávamos SEMPRE 0 ou 1 variável,
// ignorando quantas o template realmente tem. Prioridade por variável:
//   1) campo mapeado em `pessoas`  2) mensagem livre (só se houver 1 variável
//   sem campo)  3) exemplo do template — nunca vazio (a Meta rejeita vazio).
function montarVarsTemplate(vars: TemplateVar[], p: Pessoa, mensagem: string): string[] {
  const ord = [...vars].sort((a, b) => a.pos - b.pos);
  return ord.map((v) => {
    let val = valorCampo(v.campo, p).trim();
    if (!val && !v.campo && ord.length === 1 && mensagem.trim())
      val = personalizar(mensagem, p).trim();
    // Campo de NOME vazio (contato sem nome salvo): usa cumprimento neutro em
    // vez do exemplo do template (senão sairia "Olá Maria!" pra todo mundo).
    if (!val && (v.campo === "nome" || v.campo === "primeiro_nome")) val = "amigo(a)";
    if (!val) val = (v.exemplo || "").trim() || "-";
    return val;
  });
}

// GET                 -> histórico de campanhas
// GET ?templates=<id> -> templates aprovados da WABA do agente (provedor Meta)
export async function GET(req: NextRequest) {
  if (!autorizado())
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const tpl = Number(new URL(req.url).searchParams.get("templates"));
  if (tpl) {
    const a = await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [tpl]);
    if (!a || a.provedor !== "meta") return NextResponse.json([]);
    const r = await listarTemplatesMeta(a.meta_waba_id || "", a.meta_token || "");
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 });
    return NextResponse.json(
      (r.templates ?? []).filter((t) => t.status === "APPROVED")
    );
  }

  // Isolamento: coordenação vinculada só vê as campanhas do candidato dela.
  const s2 = getSessao();
  const meus = s2 ? await agentesDaSessao(s2) : [-1];
  const filtroCand = meus
    ? `WHERE c.agente_id IN (${(meus.length ? meus : [-1]).join(",")})`
    : "";
  const linhas = await query(
    `SELECT c.*, to_char(c.criado_em,'YYYY-MM-DD HH24:MI') AS criado_fmt,
            a.candidato AS agente_nome
       FROM campanhas c
       LEFT JOIN agentes a ON a.id = c.agente_id
      ${filtroCand}
      ORDER BY c.id DESC LIMIT 50`
  );
  return NextResponse.json(linhas);
}

// POST -> cria e dispara a campanha
export async function POST(req: NextRequest) {
  const s = autorizado();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  try {
  const b = await req.json();
  const mensagem = (b.mensagem ?? "").toString().trim();
  const agenteId = Number(b.agente_id);
  const titulo = (b.titulo ?? "").toString().trim() || null;
  const cidade = (b.cidade ?? "").toString().trim();
  const categoria = (b.categoria ?? "").toString().trim();
  const listaId = Number(b.lista_id) > 0 ? Math.floor(Number(b.lista_id)) : 0;
  const template = (b.template ?? "").toString().trim();
  const idioma = (b.idioma ?? "pt_BR").toString().trim();
  const agendadoRaw = (b.agendado_para ?? "").toString().trim();
  // Envio pontual: para UM contato da base (pessoa_id) OU um número digitado (+55 DDD NÚMERO),
  // que é cadastrado na base na hora e depois segue o mesmo fluxo rastreável.
  let pessoaId = Number(b.pessoa_id) || 0;
  const numeroDigitado = (b.numero ?? "").toString().trim();
  const contatoNome = (b.contato_nome ?? "").toString().trim();

  if (!mensagem && !template)
    return NextResponse.json({ erro: "Escreva a mensagem." }, { status: 400 });
  if (!agenteId)
    return NextResponse.json({ erro: "Escolha o número (agente)." }, { status: 400 });

  const agente = await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [
    agenteId,
  ]);
  if (!agente)
    return NextResponse.json({ erro: "Agente não encontrado." }, { status: 404 });

  // Isolamento: usuário vinculado (candidato/equipe) só dispara pelos próprios números.
  const meusEnvio = await agentesDaSessao(s);
  if (meusEnvio && !meusEnvio.includes(agente.id)) {
    return NextResponse.json(
      { erro: "Sem permissão para disparar por este número." },
      { status: 403 }
    );
  }

  const ehMeta = agente.provedor === "meta";
  if (ehMeta && (!agente.meta_phone_id || !agente.meta_token))
    return NextResponse.json(
      { erro: "O agente oficial (Meta) está sem credenciais." },
      { status: 400 }
    );
  if (!ehMeta && !agente.instancia)
    return NextResponse.json(
      { erro: "O agente escolhido não tem instância configurada (tela WhatsApp)." },
      { status: 400 }
    );
  // Fora da janela de 24h a Meta só aceita template aprovado — exigimos sempre no disparo.
  if (ehMeta && !template)
    return NextResponse.json(
      { erro: "Disparo pela API oficial exige um template aprovado da Meta." },
      { status: 400 }
    );

  // ===== Número digitado (+55 DDD NÚMERO): cadastra/reaproveita na base e vira envio pontual =====
  // Mantém tudo rastreável (o contato passa a existir na base, com histórico e monitoramento).
  if (!pessoaId && numeroDigitado) {
    const num = normalizarNumero(numeroDigitado);
    if (!num || num.length < 12)
      return NextResponse.json(
        { erro: "Número inválido. Use o formato +55 DDD NÚMERO (ex.: 5511987654321)." },
        { status: 400 }
      );
    const criadoPor = String(s.uid);
    // Reaproveita se o número já existir na base (compara só os dígitos).
    const existente = await queryOne<{ id: number }>(
      `SELECT id FROM pessoas
        WHERE regexp_replace(COALESCE(whatsapp,''),'\\D','','g') = $1
        ORDER BY id LIMIT 1`,
      [num]
    );
    if (existente) {
      pessoaId = existente.id;
    } else {
      const novo = await queryOne<{ id: number }>(
        `INSERT INTO pessoas (nome, whatsapp, categoria, criado_por)
         VALUES ($1,$2,'Contato pontual',$3) RETURNING id`,
        [contatoNome || "Contato WhatsApp", num, criadoPor]
      );
      pessoaId = novo?.id ?? 0;
    }
    if (!pessoaId)
      return NextResponse.json({ erro: "Não foi possível cadastrar o contato." }, { status: 500 });
  }

  // Destinatários (com WhatsApp), aplicando filtros
  const params: any[] = [];
  let where = "whatsapp IS NOT NULL AND whatsapp <> ''";
  if (cidade) {
    params.push(cidade);
    where += ` AND cidade = $${params.length}`;
  }
  if (categoria) {
    params.push(categoria);
    where += ` AND categoria = $${params.length}`;
  }
  // Envio pontual: restringe a UM contato da base (direcionado, não lista avulsa).
  if (pessoaId > 0) {
    params.push(pessoaId);
    where += ` AND id = $${params.length}`;
  }
  // Lista de disparo: público = membros da lista (que deve ser deste número).
  if (listaId > 0) {
    const lst = await queryOne<{ agente_id: number }>(
      "SELECT agente_id FROM listas WHERE id = $1",
      [listaId]
    );
    if (!lst)
      return NextResponse.json({ erro: "Lista não encontrada." }, { status: 404 });
    if (lst.agente_id !== agente.id)
      return NextResponse.json(
        { erro: "Esta lista pertence a outro número. Escolha o número dono da lista." },
        { status: 400 }
      );
    params.push(listaId);
    where += ` AND id IN (SELECT pessoa_id FROM lista_membros WHERE lista_id = $${params.length})`;

    // Continuação de lista: pula quem JÁ recebeu deste número HOJE (origem
    // campanha). Usa NOT IN com subconsulta NÃO-correlacionada (o conjunto de
    // já-enviados-hoje é calculado UMA vez e comparado por hash) — antes era um
    // NOT EXISTS por linha, que numa lista grande estourava o tempo (504).
    params.push(agente.id);
    const pAg = params.length;
    where += ` AND (
      CASE
        WHEN regexp_replace(COALESCE(whatsapp,''),'\\D','','g') LIKE '55%'
             AND length(regexp_replace(COALESCE(whatsapp,''),'\\D','','g')) >= 12
          THEN regexp_replace(COALESCE(whatsapp,''),'\\D','','g')
        WHEN length(regexp_replace(COALESCE(whatsapp,''),'\\D','','g')) IN (10,11)
          THEN '55' || regexp_replace(COALESCE(whatsapp,''),'\\D','','g')
        ELSE regexp_replace(COALESCE(whatsapp,''),'\\D','','g')
      END
    ) NOT IN (
      SELECT mm.contato FROM mensagens mm
       WHERE mm.agente_id = $${pAg}
         AND mm.origem = 'campanha' AND mm.direcao = 'out'
         AND mm.contato IS NOT NULL
         AND (mm.criado_em AT TIME ZONE 'America/Sao_Paulo')::date
             = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    )`;
  }
  // Modo n8n ativo quando a URL do webhook de disparo está configurada.
  const n8nUrl = (await getConfig("N8N_DISPARO_URL")).trim();
  // Só usa o n8n com N8N_TOKEN: sem ele o callback de status seria recusado.
  const usarN8n = !!n8nUrl && !!(await getConfig("N8N_TOKEN")).trim();

  // Cota diária: quanto ainda resta enviar hoje por este agente (fuso SP).
  const quota = quotaEfetiva(agente);
  const usadoHoje = await disparosUsadosHoje(agente.id);
  const saldo = Math.max(0, quota - usadoHoje);
  if (saldo <= 0)
    return NextResponse.json(
      { erro: `Cota diária esgotada para ${agente.candidato} (${quota}/dia). Tente amanhã ou aumente a cota.` },
      { status: 429 }
    );

  // Quantidade desejada (opcional): o operador pode limitar o tamanho do disparo.
  const quantidade = Number(b.quantidade) > 0 ? Math.floor(Number(b.quantidade)) : Infinity;
  // Limite deste disparo = min(teto do modo, saldo da cota do dia, quantidade pedida).
  const limite = Math.min(usarN8n ? MAX_N8N : MAX, saldo, quantidade);

  // Deduplica por número (só os dígitos): a base tem contatos repetidos de
  // importações, e sem isso o mesmo número receberia a mensagem 2x e a cota
  // seria gasta à toa. Mantém 1 linha por número (a de menor id).
  const destinatarios = await query<Pessoa>(
    `SELECT * FROM (
       SELECT DISTINCT ON (regexp_replace(COALESCE(whatsapp,''),'\\D','','g')) *
         FROM pessoas
        WHERE ${where}
        ORDER BY regexp_replace(COALESCE(whatsapp,''),'\\D','','g'), id
     ) d
     ORDER BY d.id
     LIMIT ${limite}`,
    params
  );

  if (destinatarios.length === 0)
    return NextResponse.json(
      { erro: "Nenhum destinatário com WhatsApp para esse filtro." },
      { status: 400 }
    );

  // ===== AGENDAMENTO: guarda a campanha para disparar depois (não envia agora) =====
  if (agendadoRaw) {
    const dt = new Date(agendadoRaw);
    if (!isNaN(dt.getTime()) && dt.getTime() > Date.now() + 30000) {
      const ag = await queryOne<{ id: number }>(
        `INSERT INTO campanhas
           (titulo, agente_id, mensagem, filtro_cidade, filtro_categoria, total, status, agendado_para, criado_por)
         VALUES ($1,$2,$3,$4,$5,$6,'agendada',$7,$8) RETURNING id`,
        [titulo, agente.id, mensagem, cidade || null, categoria || null, destinatarios.length, dt.toISOString(), String(s.uid)]
      );
      return NextResponse.json({ id: ag?.id, total: destinatarios.length, agendada: true, agendado_para: dt.toISOString() });
    }
  }

  // Variáveis do template Meta: lê a cópia local (guarda pos + campo mapeado das
  // {{n}}). É a fonte da verdade p/ montar os parâmetros na ordem certa e resolve
  // o (#131009). tplVars = [] (template sem variáveis) também é válido: manda 0.
  let tplVars: TemplateVar[] | null = null;
  if (ehMeta && template) {
    const tplRow = await queryOne<Template>(
      "SELECT variaveis FROM templates WHERE agente_id = $1 AND nome = $2",
      [agente.id, template]
    );
    if (tplRow) tplVars = (tplRow.variaveis as TemplateVar[]) || [];
  }

  // ===== MODO n8n: enfileira e delega o loop com cadência ao n8n =====
  if (usarN8n) {
    // Cria a campanha "enfileirada" primeiro para ter o id de correlação do callback.
    const nova = await queryOne<{ id: number }>(
      `INSERT INTO campanhas
         (titulo, agente_id, mensagem, filtro_cidade, filtro_categoria, total, enviados, falhas, status, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,0,0,'enfileirada',$7) RETURNING id`,
      [
        titulo,
        agente.id,
        mensagem,
        cidade || null,
        categoria || null,
        destinatarios.length,
        String(s.uid),
      ]
    );

    const origin = new URL(req.url).origin;
    const token = (await getConfig("N8N_TOKEN")).trim();
    // Credenciais globais da Evolution (o n8n usa quando o agente não tem apikey própria).
    const [evolutionUrl, evolutionApikey] = await Promise.all([
      getConfig("EVOLUTION_URL"),
      getConfig("EVOLUTION_APIKEY"),
    ]);
    // Lista já normalizada e personalizada — o n8n só precisa entregar.
    const lista = destinatarios
      .map((p) => {
        const numero = normalizarNumero(p.whatsapp || "");
        if (!numero) return null;
        return {
          numero,
          nome: p.nome || "",
          primeiro_nome: (p.nome || "").split(" ")[0],
          cidade: p.cidade || "",
          texto: personalizar(mensagem, p), // texto livre (Evolution)
          // Variáveis do template Meta na ordem correta (o fluxo n8n usa isto no
          // envio oficial). Vazio quando o template não tem variáveis.
          variaveis: tplVars ? montarVarsTemplate(tplVars, p, mensagem) : mensagem ? [personalizar(mensagem, p)] : [],
        };
      })
      .filter(Boolean);

    const payload = {
      campanha_id: nova?.id,
      token,
      callback_url: `${origin}/api/campanhas/callback`,
      // Saldo da cota do dia — o n8n não deve enviar além disso.
      saldo_restante: saldo,
      evolution_url: (evolutionUrl || "").replace(/\/+$/, ""),
      evolution_apikey: evolutionApikey || "",
      agente: {
        id: agente.id,
        provedor: agente.provedor,
        meta_phone_id: agente.meta_phone_id,
        meta_token: agente.meta_token,
        meta_waba_id: agente.meta_waba_id,
        instancia: agente.instancia,
        apikey: agente.apikey,
      },
      template,
      idioma,
      mensagem,
      destinatarios: lista,
    };

    try {
      const r = await fetch(n8nUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-Candpro-Token": token } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const txt = (await r.text().catch(() => "")).slice(0, 200);
        await execute("UPDATE campanhas SET status = 'erro' WHERE id = $1", [nova?.id]);
        return NextResponse.json(
          { erro: `n8n recusou o disparo (HTTP ${r.status}). ${txt}` },
          { status: 502 }
        );
      }
    } catch (e: any) {
      await execute("UPDATE campanhas SET status = 'erro' WHERE id = $1", [nova?.id]);
      return NextResponse.json(
        { erro: `Falha ao acionar o n8n: ${e.message}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      id: nova?.id,
      total: destinatarios.length,
      modo: "n8n",
      enfileirada: true,
      quota,
      usadoHoje: usadoHoje + destinatarios.length,
      limitadoPorQuota: destinatarios.length >= saldo,
    });
  }

  // ===== MODO SÍNCRONO (fallback): envia agora, no próprio request =====
  // Cria a campanha PRIMEIRO para ligar cada mensagem a ela (monitoramento:
  // entregues/lidos/responderam por campanha).
  const nova = await queryOne<{ id: number }>(
    `INSERT INTO campanhas
       (titulo, agente_id, mensagem, filtro_cidade, filtro_categoria, total, enviados, falhas, status, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,0,0,'enviando',$7) RETURNING id`,
    [titulo, agente.id, mensagem, cidade || null, categoria || null, destinatarios.length, String(s.uid)]
  );
  const campId = nova?.id ?? null;
  let enviados = 0;
  let falhas = 0;

  // Agente já validado acima (não-nulo); fixa a referência para o closure.
  const ag = agente;
  // Envia UM destinatário (Meta template ou Evolution texto) e loga no histórico.
  async function enviarUm(p: Pessoa): Promise<void> {
    const numero = normalizarNumero(p.whatsapp || "");
    if (!numero) {
      falhas++;
      return;
    }
    const texto = personalizar(mensagem, p);
    const r = ehMeta
      ? await enviarTemplateMeta(
          ag.meta_phone_id!,
          ag.meta_token!,
          numero,
          template,
          idioma,
          tplVars ? montarVarsTemplate(tplVars, p, mensagem) : mensagem ? [texto] : []
        )
      : await enviarMensagemAgente(ag, numero, texto);
    if (r.ok) enviados++;
    else falhas++;
    await execute(
      `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, wa_id, origem, campanha_id)
       VALUES ($1,$2,$3,$4,$5,$6,'campanha',$7)`,
      [
        ag.id,
        numero,
        p.nome,
        r.ok ? "out" : "erro",
        r.ok ? texto || `[template ${template}]` : `Campanha falhou: ${r.erro}`,
        r.waId || null,
        campId,
      ]
    );
  }

  // Envia em PARALELO, em blocos de CONCORRENCIA por vez. Assim cabe muito mais
  // gente dentro do tempo da função (o gargalo era o envio 1-a-1 sequencial).
  for (let i = 0; i < destinatarios.length; i += CONCORRENCIA) {
    const bloco = destinatarios.slice(i, i + CONCORRENCIA);
    await Promise.all(bloco.map((p) => enviarUm(p)));
  }

  await execute(
    `UPDATE campanhas SET enviados = $1, falhas = $2, status = 'enviada' WHERE id = $3`,
    [enviados, falhas, campId]
  );

  return NextResponse.json({
    id: campId,
    total: destinatarios.length,
    enviados,
    falhas,
    limitado: destinatarios.length >= MAX,
    quota,
    usadoHoje: usadoHoje + enviados,
    limitadoPorQuota: destinatarios.length >= saldo,
  });
  } catch (e: any) {
    // Nunca deixa o disparo estourar 500 mudo — devolve o motivo real.
    console.error("[campanhas POST]", e?.message);
    return NextResponse.json(
      { erro: "Falha no disparo: " + (e?.message || "erro interno do servidor") },
      { status: 500 }
    );
  }
}
