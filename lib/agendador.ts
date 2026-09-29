// ============================================================
// Agendador de disparos. Não há processo rodando o tempo todo na Vercel:
// um serviço externo (cron-job.org) chama /api/campanhas/agendador a cada
// minuto, e cada chamada envia o que der em ~20 s e devolve. Campanha grande
// continua na chamada seguinte.
//
// Regras:
//  - o público foi congelado ao agendar (campanha_destinatarios);
//  - cada contato é marcado 'enviando' ANTES de enviar: se a função cair no
//    meio, ele NÃO recebe de novo (repetir mensagem em massa é pior que perder
//    uma); ao terminar a campanha, esses contam como falha;
//  - respeita a cota diária do número: esgotou, pausa até meia-noite (SP);
//  - campanha que perdeu a hora por mais de 2 h não sai mais (o agendador
//    estava parado): fica 'expirada', com o motivo, para agendar de novo.
// ============================================================
import { query, queryOne, execute, Agente, Pessoa, Template, TemplateVar, quotaEfetiva, disparosUsadosHoje } from "@/lib/db";
import { getConfig, setConfig } from "@/lib/config";
import { enviarParaPessoa } from "@/lib/disparo";

const CONCORRENCIA = 10;
const TRAVA = "interval '2 minutes'";
export const TOLERANCIA_HORAS = 2;
// Sem chamada do cron há mais que isto, a tela avisa que o agendador parou.
export const AGENDADOR_PARADO_MIN = 10;

type Campanha = {
  id: number;
  agente_id: number | null;
  mensagem: string;
  template: string | null;
  idioma: string | null;
};

export type ResultadoAgendador = {
  campanhas: number;
  enviados: number;
  falhas: number;
  expiradas: number;
};

const MEIA_NOITE_SP =
  "((date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 day') AT TIME ZONE 'America/Sao_Paulo')";

export async function ultimaExecucao(): Promise<string | null> {
  return (await getConfig("AGENDADOR_ULTIMA")) || null;
}

export async function rodarAgendador(orcamentoMs = 20000): Promise<ResultadoAgendador> {
  const inicio = Date.now();
  const res: ResultadoAgendador = { campanhas: 0, enviados: 0, falhas: 0, expiradas: 0 };
  await setConfig("AGENDADOR_ULTIMA", new Date().toISOString());

  // Não sai mais: sem público congelado (agendada antes do agendador existir,
  // ou todos os contatos excluídos) ou atrasada demais.
  const exp = await query<{ id: number }>(
    `UPDATE campanhas c
        SET status = 'expirada', processando_ate = NULL,
            motivo = CASE
              WHEN NOT EXISTS (SELECT 1 FROM campanha_destinatarios d WHERE d.campanha_id = c.id)
                THEN 'Sem lista de contatos guardada (agendada na versão antiga). Agende de novo.'
              ELSE 'Perdeu a hora: agendador parado por mais de ${TOLERANCIA_HORAS} h. Agende de novo.'
            END
      WHERE c.status = 'agendada' AND c.agendado_para IS NOT NULL
        AND (c.agendado_para < now() - interval '${TOLERANCIA_HORAS} hours'
             OR NOT EXISTS (SELECT 1 FROM campanha_destinatarios d WHERE d.campanha_id = c.id))
      RETURNING c.id`
  );
  res.expiradas = exp.length;

  const vistas: number[] = [];
  while (Date.now() - inicio < orcamentoMs) {
    // Pega UMA campanha vencida (ou em andamento cuja trava expirou) e trava.
    // Cada campanha uma vez por chamada: a que parou continua na próxima.
    const c = await queryOne<Campanha>(
      `UPDATE campanhas SET status = 'enviando', motivo = NULL, processando_ate = now() + ${TRAVA}
        WHERE id = (
          SELECT id FROM campanhas
           WHERE agendado_para IS NOT NULL
             AND ((status = 'agendada' AND agendado_para <= now())
                  OR (status IN ('enviando', 'pausada') AND (processando_ate IS NULL OR processando_ate < now())))
             AND id <> ALL($1::bigint[])
           ORDER BY agendado_para, id
           LIMIT 1
           FOR UPDATE SKIP LOCKED)
        RETURNING id, agente_id, mensagem, template, idioma`,
      [vistas]
    );
    if (!c) break;
    vistas.push(c.id);
    res.campanhas++;
    const r = await enviarCampanha(c, inicio, orcamentoMs);
    res.enviados += r.enviados;
    res.falhas += r.falhas;
  }
  return res;
}

async function encerrar(id: number, status: string, motivo: string | null, ate: string | null) {
  await execute(
    // Cancelada no meio do envio continua cancelada (só atualiza os números).
    `UPDATE campanhas SET status = CASE WHEN status = 'cancelada' THEN status ELSE $2 END,
            motivo = CASE WHEN status = 'cancelada' THEN motivo ELSE $3 END,
            processando_ate = CASE WHEN status = 'cancelada' THEN NULL::timestamptz ELSE (${ate ?? "NULL"})::timestamptz END,
            enviados = (SELECT COUNT(*) FROM campanha_destinatarios WHERE campanha_id = $1 AND status = 'ok'),
            falhas = (SELECT COUNT(*) FROM campanha_destinatarios WHERE campanha_id = $1 AND status = 'falha')
      WHERE id = $1`,
    [id, status, motivo]
  );
}

async function enviarCampanha(c: Campanha, inicio: number, orcamentoMs: number) {
  const out = { enviados: 0, falhas: 0 };
  const ag = c.agente_id ? await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [c.agente_id]) : null;
  const ehMeta = ag?.provedor === "meta";
  const pronto = !!ag && (ehMeta ? !!(ag.meta_phone_id && ag.meta_token && c.template) : !!ag.instancia);
  if (!ag || !pronto) {
    await encerrar(c.id, "erro", "Número excluído ou sem WhatsApp configurado.", null);
    return out;
  }

  let tplVars: TemplateVar[] | null = null;
  if (ehMeta && c.template) {
    const t = await queryOne<Template>("SELECT variaveis FROM templates WHERE agente_id = $1 AND nome = $2", [ag.id, c.template]);
    if (t) tplVars = (t.variaveis as TemplateVar[]) || [];
  }
  const disparo = { mensagem: c.mensagem || "", template: c.template || "", idioma: c.idioma || "pt_BR", tplVars, campanhaId: c.id };

  let saldo = Math.max(0, quotaEfetiva(ag) - (await disparosUsadosHoje(ag.id)));
  while (saldo > 0 && Date.now() - inicio < orcamentoMs) {
    const st = await queryOne<{ status: string }>("SELECT status FROM campanhas WHERE id = $1", [c.id]);
    if (st?.status === "cancelada") break;
    // CTE MATERIALIZED: com "pessoa_id IN (SELECT ... LIMIT n)" o Postgres
    // reavalia a subconsulta e marca MAIS que n linhas (furava a cota).
    const lote = await query<{ pessoa_id: number }>(
      `WITH l AS MATERIALIZED (
         SELECT pessoa_id FROM campanha_destinatarios
          WHERE campanha_id = $1 AND status IS NULL
          ORDER BY pessoa_id LIMIT $2
          FOR UPDATE SKIP LOCKED)
       UPDATE campanha_destinatarios d SET status = 'enviando', atualizado_em = now()
         FROM l
        WHERE d.campanha_id = $1 AND d.pessoa_id = l.pessoa_id
        RETURNING d.pessoa_id`,
      [c.id, Math.min(CONCORRENCIA, saldo)]
    );
    if (!lote.length) break;
    const pessoas = await query<Pessoa>("SELECT * FROM pessoas WHERE id = ANY($1::bigint[])", [lote.map((l) => l.pessoa_id)]);
    await Promise.all(
      pessoas.map(async (p) => {
        const ok = await enviarParaPessoa(ag, p, disparo).catch(() => false);
        if (ok) {
          out.enviados++;
          saldo--;
        } else out.falhas++;
        await execute(
          `UPDATE campanha_destinatarios SET status = $3, atualizado_em = now() WHERE campanha_id = $1 AND pessoa_id = $2`,
          [c.id, p.id, ok ? "ok" : "falha"]
        );
      })
    );
    await execute(`UPDATE campanhas SET processando_ate = now() + ${TRAVA} WHERE id = $1`, [c.id]);
  }

  const falta = await queryOne<{ n: number }>(
    "SELECT COUNT(*)::int n FROM campanha_destinatarios WHERE campanha_id = $1 AND status IS NULL",
    [c.id]
  );
  const cancelada = (await queryOne<{ status: string }>("SELECT status FROM campanhas WHERE id = $1", [c.id]))?.status === "cancelada";
  if (cancelada) {
    await encerrar(c.id, "cancelada", null, null);
  } else if (!falta?.n) {
    // Marcados 'enviando' por uma execução que caiu: não reenvia, conta como falha.
    await execute(
      "UPDATE campanha_destinatarios SET status = 'falha', atualizado_em = now() WHERE campanha_id = $1 AND status = 'enviando'",
      [c.id]
    );
    await encerrar(c.id, "enviada", null, null);
  } else if (saldo <= 0) {
    await encerrar(c.id, "pausada", `Cota do dia esgotada. Continua sozinho à meia-noite (faltam ${falta.n}).`, MEIA_NOITE_SP);
  } else {
    // Acabou o tempo desta chamada: a próxima continua de onde parou.
    await encerrar(c.id, "enviando", null, "now()");
  }
  return out;
}
