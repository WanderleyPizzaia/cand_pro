import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { agentesDoCandidato } from "@/lib/metas";
import { responderTeste } from "@/lib/ia";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO"];

// Redige a resposta de crise com IA (nota de contenção + mensagens-chave),
// no tom do gabinete. Usa a persona e a chave de IA do agente do candidato.
export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !PERFIS_OK.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const titulo = String(b.titulo || "").trim();
  const severidade = String(b.severidade || "media");
  const portaVoz = String(b.portaVoz || "").trim();
  const gabinete = String(b.gabinete || s.escopoCandidato || s.nome || "o gabinete").trim();
  if (!titulo) return NextResponse.json({ erro: "Descreva o assunto da crise." }, { status: 400 });

  // Agente do candidato (persona + chave de IA).
  const escopo = s.escopoCandidato || (s.perfil === "CANDIDATO" ? s.nome : gabinete);
  let persona = "";
  let iaKey: string | null = null;
  try {
    const ids = await agentesDoCandidato(escopo, s.uid);
    const id = ids && ids.length ? ids[0] : null;
    if (id) {
      const ag = await queryOne<{ persona: string | null; ia_key: string | null }>(
        "SELECT persona, ia_key FROM agentes WHERE id = $1",
        [id]
      );
      persona = ag?.persona || "";
      iaKey = ag?.ia_key || null;
    }
  } catch {
    /* segue sem persona específica */
  }

  const sev =
    severidade === "alta" ? "alta (imprensa + viralização)" :
    severidade === "baixa" ? "baixa (ruído localizado)" : "média (crescendo nas redes)";

  const sistema =
    `Você é o ASSESSOR DE IMPRENSA do gabinete de ${gabinete}. Escreva de forma ` +
    `institucional, firme no conteúdo e serena na forma, linguagem simples e sem jargão. ` +
    `NUNCA invente fatos, números ou acusações; onde faltar informação, use marcadores entre [colchetes] ` +
    `para o gabinete preencher. Princípios: verdade sempre, uma só voz, foco na agenda, respeito. ` +
    (persona ? `Contexto do candidato (para tom e posições): ${persona.slice(0, 1200)}` : "");

  const pedido =
    `CRISE: "${titulo}". Severidade: ${sev}. Porta-voz único: ${portaVoz || "[definir]"}.\n\n` +
    `Escreva, em português, pronto para uso AGORA, nesta estrutura:\n` +
    `1) NOTA OFICIAL de contenção (holding statement), curta, clara e verdadeira, com [colchetes] onde faltar dado;\n` +
    `2) 3 MENSAGENS-CHAVE (uma linha cada);\n` +
    `3) O QUE DIZER (3 itens) e O QUE EVITAR (3 itens).\n` +
    `Não use emojis. Seja objetivo.`;

  const r = await responderTeste(sistema, [{ role: "user", content: pedido }], iaKey);
  if (!r.ok || !r.texto)
    return NextResponse.json({ erro: r.erro || "Falha ao gerar" }, { status: 502 });
  return NextResponse.json({ ok: true, texto: r.texto });
}
