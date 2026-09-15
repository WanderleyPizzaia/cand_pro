import { queryOne } from "./db";

// Resolve o agente "dono" de um usuário candidato: primeiro pelo vínculo
// explícito (agentes.usuario_id), com fallback pelo primeiro nome
// (candidato ILIKE 'Fulano%'). Mesmo padrão usado no inbox.
export async function agenteIdDoUsuario(
  uid: number,
  nome: string
): Promise<number | null> {
  const porId = await queryOne<{ id: number }>(
    "SELECT id FROM agentes WHERE usuario_id = $1 LIMIT 1",
    [uid]
  );
  if (porId) return porId.id;
  const primeiro = (nome || "").split(" ")[0];
  if (!primeiro) return null;
  const porNome = await queryOne<{ id: number }>(
    "SELECT id FROM agentes WHERE candidato ILIKE $1 ORDER BY id LIMIT 1",
    [`${primeiro}%`]
  );
  return porNome?.id ?? null;
}
