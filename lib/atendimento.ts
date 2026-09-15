import { queryOne, execute } from "./db";

// ============================================================
// Controle de atendimento humano x IA por contato.
// Quando a equipe (Alyson, Sara, Luan, assessoria) assume um contato pelo
// WhatsApp Web, a IA pausa para aquele contato para não falar por cima do humano.
// O comando "Deus Abençoe" (digitado pelo operador) ALTERNA: pausa <-> retoma.
// ============================================================

export const COMANDO = "Deus Abençoe";

// Detecta o comando de alternância (sem acento, sem caixa).
export function contemComando(texto: string | null | undefined): boolean {
  const t = (texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return t.includes("deus abencoe");
}

export async function estaPausado(agenteId: number, contato: string): Promise<boolean> {
  const r = await queryOne<{ x: number }>(
    "SELECT 1 x FROM atendimento_pausado WHERE agente_id = $1 AND contato = $2",
    [agenteId, contato]
  );
  return !!r;
}

export async function pausar(agenteId: number, contato: string): Promise<void> {
  await execute(
    "INSERT INTO atendimento_pausado (agente_id, contato) VALUES ($1, $2) ON CONFLICT (agente_id, contato) DO NOTHING",
    [agenteId, contato]
  );
}

export async function retomar(agenteId: number, contato: string): Promise<void> {
  await execute(
    "DELETE FROM atendimento_pausado WHERE agente_id = $1 AND contato = $2",
    [agenteId, contato]
  );
}

// Alterna e retorna o novo estado (true = agora pausado; false = agora ativo/IA).
export async function alternar(agenteId: number, contato: string): Promise<boolean> {
  if (await estaPausado(agenteId, contato)) {
    await retomar(agenteId, contato);
    return false;
  }
  await pausar(agenteId, contato);
  return true;
}
