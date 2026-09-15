import { query, queryOne, execute } from "./db";

// A persona ATIVA do agente (usada nas respostas) é reconstruída a partir da
// persona_base (original) + os itens de treino (agente_conhecimento). Assim o
// treino é acumulativo e reversível, e o caminho de resposta (gerarResposta,
// que só lê agentes.persona) não muda.

export const MARCADOR_TREINO = "===== TREINO DO CANDIDATO =====";

// Reconstrói e persiste a persona ativa. Retorna a persona final.
export async function reconstruirPersona(agenteId: number): Promise<string> {
  const a = await queryOne<{ persona: string | null; persona_base: string | null }>(
    "SELECT persona, persona_base FROM agentes WHERE id = $1",
    [agenteId]
  );
  if (!a) return "";

  // Base = persona original. Na 1ª vez, tira o snapshot da persona atual
  // (cortando qualquer bloco de treino que já exista, por segurança).
  let base = (a.persona_base ?? "").trim();
  if (!base) {
    base = (a.persona ?? "").split(MARCADOR_TREINO)[0].trim();
    await execute("UPDATE agentes SET persona_base = $1 WHERE id = $2", [base || null, agenteId]);
  }

  const itens = await query<{ tipo: string; titulo: string | null; conteudo: string }>(
    "SELECT tipo, titulo, conteudo FROM agente_conhecimento WHERE agente_id = $1 ORDER BY criado_em LIMIT 80",
    [agenteId]
  );

  let persona = base;
  if (itens.length) {
    const perfil = itens
      .filter((i) => i.tipo === "perfil")
      .map((i) => i.conteudo.trim())
      .filter(Boolean)
      .join("\n");
    const correcoes = itens
      .filter((i) => i.tipo === "correcao")
      .map((i) => `- ${i.titulo ? i.titulo.trim() + " -> " : ""}${i.conteudo.trim()}`);
    const extras = itens
      .filter((i) => i.tipo !== "perfil" && i.tipo !== "correcao")
      .map((i) => `- ${i.titulo ? i.titulo.trim() + ": " : ""}${i.conteudo.trim()}`);

    const partes: string[] = [];
    if (perfil) partes.push(perfil);
    if (extras.length) partes.push("Informações do candidato:\n" + extras.join("\n"));
    if (correcoes.length) partes.push("Correções e ajustes (siga à risca):\n" + correcoes.join("\n"));
    if (partes.length) persona = base + "\n\n" + MARCADOR_TREINO + "\n" + partes.join("\n\n");
  }

  await execute("UPDATE agentes SET persona = $1 WHERE id = $2", [persona || null, agenteId]);
  return persona;
}
