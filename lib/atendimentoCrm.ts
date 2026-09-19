import { query, queryOne, execute } from "./db";

// ============================================================
// CRM de Atendimento em equipe (inbox multi-atendente).
//
// Uma CONVERSA = (agente_id + contato). `atendimentos.atendente_id` é o dono
// humano; NULL = está na fila (ninguém assumiu). O round-robin distribui
// automaticamente para atendentes DISPONÍVEIS e ONLINE; se ninguém estiver
// online, a conversa fica na fila (visível a todos) em vez de cair em quem
// não vai olhar — igual ao CRM de referência.
//
// A IA continua respondendo normalmente; ela só PAUSA para o contato quando
// um humano de fato responde (isso é tratado em lib/atendimento.ts). Assim:
// "a IA atende primeiro, o humano assume quando quer".
// ============================================================

// Online = deu sinal de vida nos últimos 2 minutos (heartbeat da tela aberta).
export const PRESENCA_MS = 2 * 60 * 1000;

export type LinhaAtendimento = {
  id: number;
  agente_id: number;
  contato: string;
  atendente_id: number | null;
  status: string; // 'fila' | 'atribuido' | 'resolvido'
  assumido_em: string | null;
  resolvido_em: string | null;
};

// Atendentes que entram no rodízio DESTE número (agente): perfil ATENDENTE,
// VINCULADOS ao agente, disponíveis e com heartbeat recente. Ordenado por id
// para o cursor ser estável.
export async function atendentesOnline(
  agenteId: number
): Promise<{ id: number; nome: string }[]> {
  return query<{ id: number; nome: string }>(
    `SELECT u.id, u.nome FROM usuarios u
       JOIN usuario_agentes va ON va.usuario_id = u.id AND va.agente_id = $2
      WHERE u.perfil = 'ATENDENTE'
        AND u.disponivel = true
        AND u.visto_em IS NOT NULL
        AND u.visto_em > now() - ($1::int * interval '1 millisecond')
      ORDER BY u.id`,
    [PRESENCA_MS, agenteId]
  );
}

// Números (agentes) marcados para um usuário. Vale para qualquer perfil:
// quem tem números marcados enxerga exatamente esses.
export async function agentesDoUsuario(usuarioId: number): Promise<number[]> {
  const r = await query<{ agente_id: number }>(
    "SELECT agente_id FROM usuario_agentes WHERE usuario_id = $1 ORDER BY agente_id",
    [usuarioId]
  );
  return r.map((x) => x.agente_id);
}

// Redefine os números vinculados a um usuário (substitui o conjunto).
export async function definirAgentesDoUsuario(
  usuarioId: number,
  agenteIds: number[]
): Promise<void> {
  await execute("DELETE FROM usuario_agentes WHERE usuario_id = $1", [usuarioId]);
  const ids = [...new Set(agenteIds.filter((n) => Number.isInteger(n) && n > 0))];
  for (const ag of ids) {
    await execute(
      `INSERT INTO usuario_agentes (usuario_id, agente_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [usuarioId, ag]
    );
  }
}

// Garante a linha da conversa (uma por agente+contato). Não distribui aqui.
// Se a conversa estava 'resolvido' e chegou algo novo, reabre para a fila.
export async function garantirConversa(
  agenteId: number,
  contato: string
): Promise<LinhaAtendimento> {
  await execute(
    `INSERT INTO atendimentos (agente_id, contato)
       VALUES ($1, $2)
     ON CONFLICT (agente_id, contato) DO NOTHING`,
    [agenteId, contato]
  );
  // Reabre se estava resolvida e voltou a falar.
  await execute(
    `UPDATE atendimentos
        SET status = CASE WHEN atendente_id IS NULL THEN 'fila' ELSE 'atribuido' END,
            resolvido_em = NULL, resolvido_por = NULL,
            atualizado_em = now()
      WHERE agente_id = $1 AND contato = $2 AND status = 'resolvido'`,
    [agenteId, contato]
  );
  const r = await queryOne<LinhaAtendimento>(
    `SELECT id, agente_id, contato, atendente_id, status, assumido_em, resolvido_em
       FROM atendimentos WHERE agente_id = $1 AND contato = $2`,
    [agenteId, contato]
  );
  return r!;
}

// Round-robin: se a conversa está sem dono e há atendente online, atribui ao
// próximo do rodízio (cursor por agente). Retorna o atendente_id escolhido ou
// null (ninguém online → segue na fila). Idempotente e barato.
export async function distribuir(
  agenteId: number,
  contato: string
): Promise<number | null> {
  const conv = await garantirConversa(agenteId, contato);
  if (conv.atendente_id) return conv.atendente_id; // já tem dono
  if (conv.status === "resolvido") return null;

  const online = await atendentesOnline(agenteId);
  if (online.length === 0) return null; // ninguém vinculado/online → fila do grupo

  // Avança o cursor de forma atômica e escolhe pela posição.
  const cur = await queryOne<{ cursor: number }>(
    `INSERT INTO atendimento_rr (agente_id, cursor) VALUES ($1, 1)
     ON CONFLICT (agente_id) DO UPDATE SET cursor = atendimento_rr.cursor + 1
     RETURNING cursor`,
    [agenteId]
  );
  const escolhido = online[(cur!.cursor - 1) % online.length];

  // Só grava se ainda estiver sem dono (evita corrida com um "assumir" manual).
  const r = await execute(
    `UPDATE atendimentos
        SET atendente_id = $3, status = 'atribuido',
            assumido_em = COALESCE(assumido_em, now()), atualizado_em = now()
      WHERE agente_id = $1 AND contato = $2 AND atendente_id IS NULL`,
    [agenteId, contato, escolhido.id]
  );
  return r > 0 ? escolhido.id : conv.atendente_id;
}

// Assumir manualmente (o atendente pega da fila, ou o gestor puxa pra si).
export async function assumir(
  agenteId: number,
  contato: string,
  userId: number
): Promise<void> {
  await garantirConversa(agenteId, contato);
  await execute(
    `UPDATE atendimentos
        SET atendente_id = $3, status = 'atribuido',
            assumido_em = now(), resolvido_em = NULL, resolvido_por = NULL,
            atualizado_em = now()
      WHERE agente_id = $1 AND contato = $2`,
    [agenteId, contato, userId]
  );
}

// Assume a conversa SOMENTE se estiver livre (na fila) ou já for do próprio
// usuário. É atômico (o WHERE com atendente_id decide na hora), então dois
// atendentes NUNCA conseguem assumir a mesma conversa — o segundo é barrado.
// Retorna { ok, donoAtual }: ok=false quando já está com outro atendente.
export async function assumirSeLivre(
  agenteId: number,
  contato: string,
  userId: number
): Promise<{ ok: boolean; donoAtual: number | null; donoNome: string | null }> {
  await garantirConversa(agenteId, contato);
  const upd = await query<{ atendente_id: number }>(
    `UPDATE atendimentos
        SET atendente_id = $3, status = 'atribuido',
            assumido_em = COALESCE(assumido_em, now()),
            resolvido_em = NULL, resolvido_por = NULL, atualizado_em = now()
      WHERE agente_id = $1 AND contato = $2
        AND (atendente_id IS NULL OR atendente_id = $3)
      RETURNING atendente_id`,
    [agenteId, contato, userId]
  );
  if (upd.length > 0) return { ok: true, donoAtual: userId, donoNome: null };
  // Já tem outro dono: descobre quem para avisar.
  const dono = await queryOne<{ atendente_id: number | null; nome: string | null }>(
    `SELECT at.atendente_id, u.nome
       FROM atendimentos at LEFT JOIN usuarios u ON u.id = at.atendente_id
      WHERE at.agente_id = $1 AND at.contato = $2`,
    [agenteId, contato]
  );
  return { ok: false, donoAtual: dono?.atendente_id ?? null, donoNome: dono?.nome ?? null };
}

// SLA: devolve à fila conversas ATRIBUÍDAS que ficaram SEM RESPOSTA HUMANA por
// mais de `slaMs`. Assim, se o atendente pegou (ou o rodízio distribuiu) e
// ninguém respondeu no prazo, a conversa volta para a fila e pode ser reassumida
// por outro. Idempotente e barato (só mexe no que passou do prazo).
export async function liberarInativos(slaMs: number): Promise<number> {
  const r = await execute(
    `UPDATE atendimentos at
        SET atendente_id = NULL, status = 'fila', assumido_em = NULL, atualizado_em = now()
      WHERE at.status = 'atribuido'
        AND at.assumido_em IS NOT NULL
        AND at.assumido_em < now() - ($1::bigint * interval '1 millisecond')
        AND NOT EXISTS (
          SELECT 1 FROM mensagens m
           WHERE m.agente_id = at.agente_id AND m.contato = at.contato
             AND m.direcao = 'out' AND m.origem = 'humano'
             AND m.criado_em >= at.assumido_em
        )`,
    [slaMs]
  );
  return r ?? 0;
}

// Transferir para outro atendente (ou devolver à fila com paraUserId = null).
export async function transferir(
  agenteId: number,
  contato: string,
  paraUserId: number | null
): Promise<void> {
  await execute(
    `UPDATE atendimentos
        SET atendente_id = $3,
            status = CASE WHEN $3::bigint IS NULL THEN 'fila' ELSE 'atribuido' END,
            assumido_em = CASE WHEN $3::bigint IS NULL THEN NULL ELSE now() END,
            atualizado_em = now()
      WHERE agente_id = $1 AND contato = $2`,
    [agenteId, contato, paraUserId]
  );
}

// Resolver (finalizar) — some das ativas, some do "Minhas"; reabre se o
// contato voltar a falar (garantirConversa).
export async function resolver(
  agenteId: number,
  contato: string,
  userId: number
): Promise<void> {
  await execute(
    `UPDATE atendimentos
        SET status = 'resolvido', resolvido_em = now(), resolvido_por = $3,
            bot_saudou = false, atualizado_em = now()
      WHERE agente_id = $1 AND contato = $2`,
    [agenteId, contato, userId]
  );
}

// Reabrir manualmente uma conversa resolvida.
export async function reabrir(agenteId: number, contato: string): Promise<void> {
  await execute(
    `UPDATE atendimentos
        SET status = CASE WHEN atendente_id IS NULL THEN 'fila' ELSE 'atribuido' END,
            resolvido_em = NULL, resolvido_por = NULL, atualizado_em = now()
      WHERE agente_id = $1 AND contato = $2`,
    [agenteId, contato]
  );
}

// Heartbeat + disponibilidade do atendente (chamado pela tela aberta).
export async function baterPresenca(
  userId: number,
  disponivel?: boolean
): Promise<void> {
  if (typeof disponivel === "boolean") {
    await execute(
      `UPDATE usuarios SET visto_em = now(), disponivel = $2 WHERE id = $1`,
      [userId, disponivel]
    );
  } else {
    await execute(`UPDATE usuarios SET visto_em = now() WHERE id = $1`, [userId]);
  }
}
