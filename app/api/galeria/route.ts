import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute, type AgenteConfig } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { agenteIdDoUsuario } from "@/lib/agenteUsuario";
import { responderTeste } from "@/lib/ia";
import {
  GALERIA_MAX_ARQUIVOS,
  GALERIA_MAX_BYTES,
  MIMES_GALERIA,
  extrairMarcador,
  galeriaLigada,
  instrucoesGaleria,
  listarArquivos,
  resolverArquivo,
} from "@/lib/galeria";

export const dynamic = "force-dynamic";

// Mesmo acesso do treino: gestor (ADMIN/COORDENACAO) em qualquer agente via
// ?id=; candidato só no próprio agente.
async function resolver(req: NextRequest) {
  const s = getSessao();
  if (!s) return { erro: "Sem sessão", status: 401 as const };
  const gestor = ["ADMIN", "COORDENACAO"].includes(s.perfil);
  if (!gestor && s.perfil !== "CANDIDATO") return { erro: "Acesso negado", status: 403 as const };
  const q = Number(new URL(req.url).searchParams.get("id"));
  const id = (gestor && q) || (await agenteIdDoUsuario(s.uid, s.nome));
  if (!id) return { erro: "Você ainda não tem um agente vinculado.", status: 404 as const };
  const a = await queryOne<{
    id: number;
    ia_key: string | null;
    persona: string | null;
    provedor: string;
    config: AgenteConfig;
  }>("SELECT id, ia_key, persona, provedor, config FROM agentes WHERE id = $1", [id]);
  if (!a) return { erro: "Agente não encontrado", status: 404 as const };
  return { agente: a };
}

const texto = (v: unknown, max: number) => (v ?? "").toString().trim().slice(0, max);

// Nome do arquivo como o eleitor vê no WhatsApp: sem caminho nem caracteres
// estranhos, com a extensão do tipo real.
function nomeDoArquivo(bruto: string, nome: string, ext: string): string {
  const base = (bruto.split(/[\\/]/).pop() || "").replace(/\.[a-z0-9]{2,5}$/i, "");
  const limpo = (base || nome)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 _-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${limpo || "arquivo"}.${ext}`;
}

// Os códigos do motor de IA ("ia_401", "timeout"...) em frase de gente.
function erroDaIA(codigo?: string): string {
  const c = codigo || "";
  if (/^ia_(401|403)$/.test(c)) return "A chave de IA foi recusada. Confira a chave do agente ou a chave global.";
  if (c === "ia_429") return "A IA está sem crédito ou no limite de uso. Tente mais tarde ou confira o saldo da chave.";
  if (c === "timeout") return "A IA demorou demais para responder. Tente de novo.";
  if (c === "rede" || /^ia_5/.test(c)) return "Não deu para falar com a IA agora. Tente de novo em instantes.";
  return c || "A IA não respondeu. Tente de novo.";
}

const MIME_POR_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

// GET -> estado da galeria (ligada?) + arquivos, sem o conteúdo.
export async function GET(req: NextRequest) {
  const r = await resolver(req);
  if ("erro" in r) return NextResponse.json({ erro: r.erro }, { status: r.status });
  return NextResponse.json({
    ligado: galeriaLigada(r.agente),
    provedor: r.agente.provedor,
    arquivos: await listarArquivos(r.agente.id),
    limiteBytes: GALERIA_MAX_BYTES,
    maxArquivos: GALERIA_MAX_ARQUIVOS,
  });
}

// POST { acao: ligar | adicionar | editar | excluir | testar, ... }
export async function POST(req: NextRequest) {
  const r = await resolver(req);
  if ("erro" in r) return NextResponse.json({ erro: r.erro }, { status: r.status });
  const agenteId = r.agente.id;
  const b = await req.json().catch(() => ({}));
  const acao = texto(b.acao, 20);

  // Chave geral: é a ferramenta "Enviar material de campanha" do agente.
  if (acao === "ligar") {
    await execute(
      `UPDATE agentes
          SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('ferramentas',
                COALESCE(config->'ferramentas', '{}'::jsonb)
                || jsonb_build_object('enviar_material', $1::boolean))
        WHERE id = $2`,
      [b.valor === true, agenteId]
    );
    return NextResponse.json({ ok: true, ligado: b.valor === true });
  }

  if (acao === "adicionar") {
    const nome = texto(b.nome, 60);
    const quando = texto(b.quando, 300);
    const legenda = texto(b.legenda, 300) || null;
    if (!nome) return NextResponse.json({ erro: "Dê um nome ao arquivo." }, { status: 400 });
    if (!quando)
      return NextResponse.json({ erro: "Diga em que situação a IA deve enviar." }, { status: 400 });
    const total = await queryOne<{ n: number }>(
      "SELECT COUNT(*)::int n FROM agente_arquivos WHERE agente_id = $1 AND removido_em IS NULL",
      [agenteId]
    );
    if ((total?.n ?? 0) >= GALERIA_MAX_ARQUIVOS)
      return NextResponse.json(
        { erro: `A galeria aceita até ${GALERIA_MAX_ARQUIVOS} arquivos. Exclua um para adicionar outro.` },
        { status: 400 }
      );

    let mime = "";
    let conteudo: string | null = null;
    let url: string | null = null;
    let tamanho: number | null = null;
    let bruto = texto(b.nomeArquivo, 200);

    if (typeof b.arquivo === "string" && b.arquivo) {
      const m = b.arquivo.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
      if (!m) return NextResponse.json({ erro: "Arquivo inválido." }, { status: 400 });
      mime = m[1].toLowerCase();
      const b64 = m[2];
      conteudo = b64;
      tamanho = Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
      if (tamanho > GALERIA_MAX_BYTES)
        return NextResponse.json(
          { erro: "Arquivo acima de 3 MB. Comprima o PDF ou use um link direto para o arquivo." },
          { status: 413 }
        );
    } else if (typeof b.url === "string" && b.url.trim()) {
      const link = b.url.trim().slice(0, 1000);
      url = link;
      let u: URL;
      try {
        u = new URL(link);
      } catch {
        return NextResponse.json({ erro: "Link inválido." }, { status: 400 });
      }
      if (u.protocol !== "https:")
        return NextResponse.json({ erro: "O link precisa começar com https://" }, { status: 400 });
      const ext = (u.pathname.split(".").pop() || "").toLowerCase();
      mime = MIME_POR_EXT[ext] || "";
      if (!mime)
        return NextResponse.json(
          { erro: "Use o link direto do arquivo, terminando em .pdf, .jpg ou .png." },
          { status: 400 }
        );
      bruto = bruto || decodeURIComponent(u.pathname);
    } else {
      return NextResponse.json({ erro: "Escolha um arquivo ou cole um link." }, { status: 400 });
    }

    const tipo = MIMES_GALERIA[mime];
    if (!tipo)
      return NextResponse.json({ erro: "Formato aceito: JPG, PNG ou PDF (o WhatsApp não manda WEBP como imagem)." }, { status: 400 });

    const novo = await queryOne<{ id: number }>(
      `INSERT INTO agente_arquivos (agente_id, nome, quando, legenda, tipo, mime, nome_arquivo, conteudo, url, tamanho)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [agenteId, nome, quando, legenda, tipo.tipo, mime, nomeDoArquivo(bruto, nome, tipo.ext), conteudo, url, tamanho]
    );
    return NextResponse.json({ ok: true, id: novo?.id });
  }

  if (acao === "editar") {
    const id = Number(b.arquivoId);
    const nome = texto(b.nome, 60);
    const quando = texto(b.quando, 300);
    if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });
    if (!nome || !quando)
      return NextResponse.json({ erro: "Nome e situação são obrigatórios." }, { status: 400 });
    const n = await execute(
      `UPDATE agente_arquivos SET nome = $1, quando = $2, legenda = $3
        WHERE id = $4 AND agente_id = $5 AND removido_em IS NULL`,
      [nome, quando, texto(b.legenda, 300) || null, id, agenteId]
    );
    if (!n) return NextResponse.json({ erro: "Arquivo não encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (acao === "excluir") {
    const id = Number(b.arquivoId);
    if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });
    // Sai da galeria (a IA para de mandar), mas continua visível nas conversas
    // em que já foi enviado.
    await execute(
      "UPDATE agente_arquivos SET removido_em = now() WHERE id = $1 AND agente_id = $2 AND removido_em IS NULL",
      [id, agenteId]
    );
    return NextResponse.json({ ok: true });
  }

  // Simula uma mensagem de eleitor: mostra o que a IA responderia e qual
  // arquivo mandaria. Usa a galeria mesmo desligada (é para testar antes).
  if (acao === "testar") {
    const mensagem = texto(b.mensagem, 500);
    if (!mensagem) return NextResponse.json({ erro: "Escreva a mensagem do eleitor." }, { status: 400 });
    const arquivos = await listarArquivos(agenteId);
    const resp = await responderTeste(
      r.agente.persona || "",
      [{ role: "user", content: mensagem }],
      r.agente.ia_key,
      instrucoesGaleria(arquivos)
    );
    if (!resp.ok) return NextResponse.json({ erro: erroDaIA(resp.erro) }, { status: 400 });
    const { texto: resposta, alvo } = extrairMarcador(resp.texto || "");
    const arq = resolverArquivo(alvo, arquivos);
    return NextResponse.json({
      texto: resposta,
      arquivo: arq ? { id: arq.id, nome: arq.nome, tipo: arq.tipo } : null,
    });
  }

  return NextResponse.json({ erro: "Ação inválida" }, { status: 400 });
}
