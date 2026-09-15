import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { agenteIdDoUsuario } from "@/lib/agenteUsuario";
import { transcreverAudio, responderTeste, consolidarEntrevista } from "@/lib/ia";
import { reconstruirPersona } from "@/lib/treino";

export const dynamic = "force-dynamic";

// Resolve o agente do usuário logado (candidato) ou, se gestor, aceita ?id=.
async function resolver(req: NextRequest) {
  const s = getSessao();
  if (!s) return { erro: "Sem sessão", status: 401 as const };
  const gestor = ["ADMIN", "COORDENACAO"].includes(s.perfil);
  if (!gestor && s.perfil !== "CANDIDATO")
    return { erro: "Acesso negado", status: 403 as const };
  const q = Number(new URL(req.url).searchParams.get("id"));
  const id = (gestor && q) || (await agenteIdDoUsuario(s.uid, s.nome));
  if (!id) return { erro: "Você ainda não tem um agente vinculado.", status: 404 as const };
  const a = await queryOne<{ id: number; ia_key: string | null; persona: string | null }>(
    "SELECT id, ia_key, persona FROM agentes WHERE id = $1",
    [id]
  );
  if (!a) return { erro: "Agente não encontrado", status: 404 as const };
  return { s, id: a.id, iaKey: a.ia_key, persona: a.persona || "" };
}

// GET -> lista os itens de treino (base de conhecimento) do agente.
export async function GET(req: NextRequest) {
  const r = await resolver(req);
  if ("erro" in r) return NextResponse.json({ erro: r.erro }, { status: r.status });
  const itens = await query(
    `SELECT id, tipo, titulo, conteudo,
            to_char(criado_em, 'DD/MM HH24:MI') AS criado_em
       FROM agente_conhecimento WHERE agente_id = $1 ORDER BY criado_em DESC`,
    [r.id]
  );
  return NextResponse.json({ itens });
}

// POST { acao, ... }
export async function POST(req: NextRequest) {
  const r = await resolver(req);
  if ("erro" in r) return NextResponse.json({ erro: r.erro }, { status: r.status });
  const b = await req.json().catch(() => ({}));
  const acao = (b.acao || "").toString();

  // Transcrição de áudio (gravado no navegador) -> texto.
  if (acao === "transcrever") {
    const base64 = (b.audioBase64 || "").toString().replace(/^data:[^;]+;base64,/, "");
    const t = await transcreverAudio(base64, b.mimetype || null, r.iaKey);
    if (!t.ok) return NextResponse.json({ erro: t.erro || "Falha na transcrição" }, { status: 400 });
    return NextResponse.json({ texto: t.texto });
  }

  // Chat de teste: candidato conversa com o próprio agente (persona atual).
  if (acao === "conversar") {
    const historico = Array.isArray(b.historico) ? b.historico : [];
    const resp = await responderTeste(r.persona, historico, r.iaKey);
    if (!resp.ok) return NextResponse.json({ erro: resp.erro || "Falha ao responder" }, { status: 400 });
    return NextResponse.json({ texto: resp.texto });
  }

  // Consolidar a entrevista guiada: salva as respostas + gera o "perfil" (persona).
  if (acao === "consolidar") {
    const respostas: { pergunta: string; resposta: string }[] = Array.isArray(b.respostas)
      ? b.respostas
          .map((x: any) => ({
            pergunta: (x?.pergunta || "").toString().trim(),
            resposta: (x?.resposta || "").toString().trim(),
          }))
          .filter((x: any) => x.resposta)
      : [];
    if (!respostas.length)
      return NextResponse.json({ erro: "Responda ao menos uma pergunta." }, { status: 400 });

    // Guarda as respostas cruas (auditoria) e refaz o item de perfil.
    for (const qa of respostas) {
      await execute(
        "INSERT INTO agente_conhecimento (agente_id, tipo, titulo, conteudo) VALUES ($1, 'entrevista', $2, $3)",
        [r.id, qa.pergunta.slice(0, 200), qa.resposta]
      );
    }
    const cons = await consolidarEntrevista(respostas, r.iaKey);
    await execute("DELETE FROM agente_conhecimento WHERE agente_id = $1 AND tipo = 'perfil'", [r.id]);
    if (cons.ok && cons.texto) {
      await execute(
        "INSERT INTO agente_conhecimento (agente_id, tipo, titulo, conteudo) VALUES ($1, 'perfil', 'Perfil do candidato', $2)",
        [r.id, cons.texto]
      );
    }
    const persona = await reconstruirPersona(r.id);
    return NextResponse.json({ ok: true, persona, consolidou: cons.ok });
  }

  // Correção vinda do chat de teste: vira um ajuste que o agente segue.
  if (acao === "corrigir") {
    const titulo = (b.pergunta || "").toString().trim().slice(0, 200);
    const conteudo = (b.resposta || "").toString().trim();
    if (!conteudo) return NextResponse.json({ erro: "Escreva a resposta correta." }, { status: 400 });
    await execute(
      "INSERT INTO agente_conhecimento (agente_id, tipo, titulo, conteudo) VALUES ($1, 'correcao', $2, $3)",
      [r.id, titulo || null, conteudo]
    );
    const persona = await reconstruirPersona(r.id);
    return NextResponse.json({ ok: true, persona });
  }

  // Remover um item de treino (e reconstruir a persona sem ele).
  if (acao === "excluir") {
    const id = Number(b.id);
    if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });
    await execute("DELETE FROM agente_conhecimento WHERE id = $1 AND agente_id = $2", [id, r.id]);
    const persona = await reconstruirPersona(r.id);
    return NextResponse.json({ ok: true, persona });
  }

  return NextResponse.json({ erro: "Ação inválida" }, { status: 400 });
}
