import { queryOne, execute, Agente } from "./db";
import { getConfig } from "./config";
import { enviarMensagemAgente } from "./meta";
import { pausar } from "./atendimento";

// Bot de PRIMEIRA RESPOSTA: quando o contato responde e ainda não foi saudado,
// o bot manda UMA mensagem automática de acolhida, registra, marca a conversa
// como saudada e PAUSA a IA (daí em diante é humano). A conversa segue no
// rodízio/fila (distribuir é chamado no webhook antes daqui). Retorna true se
// tratou a saudação (o webhook então NÃO deve acionar a IA neste evento).
//
// Config:
//   BOT_SAUDACAO_ATIVA = "1" liga
//   BOT_SAUDACAO_TEXTO = texto da mensagem (fallback abaixo)
const PADRAO = "Que prazer falar contigo, obrigado por nos responder!";

export async function saudacaoBot(
  agente: Agente,
  numero: string,
  nome: string | null
): Promise<boolean> {
  if ((await getConfig("BOT_SAUDACAO_ATIVA")) !== "1") return false;
  const texto = ((await getConfig("BOT_SAUDACAO_TEXTO")) || PADRAO).trim();
  if (!texto) return false;

  // Já saudou esta conversa? (a linha de atendimento é criada no distribuir)
  const conv = await queryOne<{ bot_saudou: boolean }>(
    "SELECT bot_saudou FROM atendimentos WHERE agente_id = $1 AND contato = $2",
    [agente.id, numero]
  );
  if (conv?.bot_saudou) return false;

  // Marca ANTES de enviar (trava contra corrida: 2 mensagens quase juntas não
  // disparam 2 saudações). Só marca se ainda não estava marcada.
  const marcou = await execute(
    "UPDATE atendimentos SET bot_saudou = true WHERE agente_id = $1 AND contato = $2 AND bot_saudou = false",
    [agente.id, numero]
  );
  if (marcou === 0) return false; // outra execução já saudou

  const r = await enviarMensagemAgente(agente, numero, texto);
  await execute(
    `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, wa_id, origem)
     VALUES ($1,$2,$3,$4,$5,$6,'bot')`,
    [agente.id, numero, nome, r.ok ? "out" : "erro", r.ok ? texto : `Falha bot: ${r.erro}`, r.waId || null]
  );
  if (!r.ok) {
    // Envio falhou: desmarca para tentar de novo na próxima e NÃO pausa
    // (deixa o fluxo normal seguir). Assim não fica "saudou" sem ter enviado.
    await execute(
      "UPDATE atendimentos SET bot_saudou = false WHERE agente_id = $1 AND contato = $2",
      [agente.id, numero]
    );
    return false;
  }
  await pausar(agente.id, numero).catch(() => {}); // daqui em diante é humano
  return true;
}
