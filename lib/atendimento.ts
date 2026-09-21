import { queryOne, execute } from "./db";

// ============================================================
// Controle de atendimento humano x IA por contato.
// Quando a equipe assume um contato pelo WhatsApp Web, a IA pausa para aquele
// contato para não falar por cima do humano. O comando "/ia" (digitado pelo
// operador na conversa) ALTERNA: pausa <-> retoma.
//
// O comando era a frase "Deus Abençoe" — e numa campanha onde a equipe se
// despede assim o tempo todo, qualquer bênção no fim da mensagem desligava a
// IA da conversa sem ninguém perceber. Agora é um comando que ninguém escreve
// por acaso, e só vale quando é a mensagem INTEIRA.
// A pausa por digitação humana expira sozinha (ver estaPausado); a do comando não.
// ============================================================

export const COMANDO = "/ia";

// Detecta o comando de alternância. Exige a mensagem inteira (só espaços e
// pontuação em volta), para nunca confundir com conversa normal.
export function contemComando(texto: string | null | undefined): boolean {
  const t = (texto || "").trim().toLowerCase().replace(/[.!…]+$/, "");
  return t === "/ia" || t === "/ia on" || t === "/ia off";
}

// A pausa de "humano assumiu" expira sozinha depois de N horas sem ninguém da
// equipe escrever (N vem do agente: config.limites.pausa_humana_horas, padrão
// 6; 0 = não expira). A pausa pedida pelo comando é decisão da equipe e só sai
// quando alguém mandar voltar. Expirou: some a linha, então a caixa de entrada
// também volta a mostrar "IA ativa".
export async function estaPausado(agenteId: number, contato: string): Promise<boolean> {
  const r = await queryOne<{ tipo: string; vencida: boolean; horas: string }>(
    `SELECT p.tipo,
            COALESCE((a.config->'limites'->>'pausa_humana_horas'), '6') AS horas,
            (p.pausado_em < now() - (COALESCE(NULLIF(a.config->'limites'->>'pausa_humana_horas','')::numeric, 6)
                                     * interval '1 hour')) AS vencida
       FROM atendimento_pausado p
       LEFT JOIN agentes a ON a.id = p.agente_id
      WHERE p.agente_id = $1 AND p.contato = $2`,
    [agenteId, contato]
  );
  if (!r) return false;
  if (r.tipo === "comando") return true; // pausa pedida pela equipe: fica
  if (Number(r.horas) <= 0) return true; // agente configurado para não expirar
  if (!r.vencida) return true;
  await retomar(agenteId, contato); // venceu: a IA volta a atender
  return false;
}

// `tipo`: 'humano' (alguém respondeu pelo celular — expira) ou 'comando' (a
// equipe calou a IA de propósito — não expira). Repausar renova o relógio.
export async function pausar(
  agenteId: number,
  contato: string,
  tipo: "humano" | "comando" = "humano"
): Promise<void> {
  await execute(
    `INSERT INTO atendimento_pausado (agente_id, contato, tipo) VALUES ($1, $2, $3)
     ON CONFLICT (agente_id, contato) DO UPDATE SET pausado_em = now(), tipo = EXCLUDED.tipo`,
    [agenteId, contato, tipo]
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
  await pausar(agenteId, contato, "comando"); // decisão da equipe: não expira
  return true;
}
