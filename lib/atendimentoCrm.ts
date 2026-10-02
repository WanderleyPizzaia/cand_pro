import { query, queryOne, execute } from "./db";
import { normalizarNumero } from "./evolution";

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

// ============================================================
// Iniciar atendimento a partir de Contatos.
// ============================================================

// Formas do mesmo celular brasileiro: com e sem 55, com e sem o 9 depois do
// DDD (o WhatsApp e a Meta ainda entregam alguns números antigos sem o 9).
export function variantesNumero(raw: string): string[] {
  const d = normalizarNumero(raw);
  if (!d) return [];
  const out = new Set([d]);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const local = d.slice(2); // DDD + número
    out.add(local);
    if (local.length === 11 && local[2] === "9") {
      const sem9 = local.slice(0, 2) + local.slice(3);
      out.add("55" + sem9);
      out.add(sem9);
    } else if (local.length === 10 && /[6-9]/.test(local[2])) {
      const com9 = local.slice(0, 2) + "9" + local.slice(2);
      out.add("55" + com9);
      out.add(com9);
    }
  }
  return Array.from(out);
}

// Chave da conversa para um contato: a forma do número que já tem conversa ou
// mensagem neste número (para cair no mesmo histórico); senão, a normalizada.
export async function contatoDaConversa(agenteId: number, whatsapp: string): Promise<string | null> {
  const vars = variantesNumero(whatsapp);
  if (!vars.length) return null;
  const achado = await queryOne<{ contato: string }>(
    `SELECT contato FROM (
        SELECT contato, atualizado_em AS t FROM atendimentos WHERE agente_id = $1 AND contato = ANY($2::text[])
        UNION ALL
        SELECT contato, criado_em AS t FROM mensagens WHERE agente_id = $1 AND contato = ANY($2::text[])
      ) x ORDER BY t DESC NULLS LAST LIMIT 1`,
    [agenteId, vars]
  );
  return achado?.contato ?? vars[0];
}

// Atendente só age em conversa que já existe ou em contato CADASTRADO deste
// número (nunca num telefone qualquer digitado na requisição).
export async function atendentePodeUsar(agenteId: number, contato: string): Promise<boolean> {
  const existe = await queryOne(
    `SELECT 1 FROM atendimentos WHERE agente_id = $1 AND contato = $2
     UNION ALL
     SELECT 1 FROM mensagens WHERE agente_id = $1 AND contato = $2
     LIMIT 1`,
    [agenteId, contato]
  );
  if (existe) return true;
  if (contato.startsWith("ig:")) return false;
  const vars = variantesNumero(contato);
  if (!vars.length) return false;
  const cadastrado = await queryOne(
    `SELECT 1 FROM pessoas
      WHERE agente_id = $1 AND regexp_replace(COALESCE(whatsapp,''),'\\D','','g') = ANY($2::text[])
      LIMIT 1`,
    [agenteId, vars]
  );
  return !!cadastrado;
}

// Número oficial (Meta): mensagem livre só vale até 24 h depois da última
// mensagem da pessoa. Fora disso a Meta aceita o envio e depois o descarta
// (erro 131047), então a tela avisaria "enviado" sem a pessoa receber.
export async function janelaMetaAberta(agenteId: number, contato: string): Promise<boolean> {
  const vars = contato.startsWith("ig:") ? [contato] : variantesNumero(contato);
  const r = await queryOne<{ ok: boolean }>(
    `SELECT COALESCE(max(criado_em) > now() - interval '24 hours', false) AS ok
       FROM mensagens WHERE agente_id = $1 AND contato = ANY($2::text[]) AND direcao = 'in'`,
    [agenteId, vars.length ? vars : [contato]]
  );
  return !!r?.ok;
}
