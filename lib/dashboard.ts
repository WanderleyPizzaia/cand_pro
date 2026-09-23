import { query, queryOne, quotaEfetiva } from "./db";
import type { Sessao } from "./auth";
import {
  listarMetasComProgresso,
  agentesDoCandidato,
  type MetaProgresso,
} from "./metas";
import { agentesDaSessao } from "./escopo";

// ===== Coleta dos indicadores do Dashboard inicial =====
// Reutilizado pela página (render inicial) e pela API /api/dashboard (real time).

export type LiderancaItem = { nome: string; perfil: string; total: number };

export type InstanciaItem = {
  candidato: string;
  instancia: string | null;
  ativo: boolean;
  mensagensHoje: number;
};

// Widget gerencial por candidato (visão do ADMIN/COORDENAÇÃO).
export type CandidatoStat = {
  candidato: string;
  ativo: boolean;
  alcance: number;      // contatos distintos alcançados no WhatsApp
  mensagens: number;    // total in+out
  mensagensHoje: number;
  disparosHoje: number;
  quota: number;
  respostas: number;    // contatos distintos que responderam
};

// Série de contatos ACUMULADOS ao longo do tempo (curva de crescimento da base).
export type SerieContatos = {
  dias: string[];                 // 'YYYY-MM-DD' — eixo X DIÁRIO contínuo até a votação
  global: (number | null)[];      // acumulado global; null nos dias futuros (vazio até a votação)
  series: { nome: string; valores: (number | null)[]; total: number }[]; // por candidato/instância
  hojeIdx: number;                // índice do dia de hoje em `dias`
  eleicaoIdx: number;             // índice da data da votação em `dias`
  eleicao: string;                // 'YYYY-MM-DD' da votação (marco)
};

export type DashboardData = {
  whats: { total: number; conectados: number };
  lideranca: LiderancaItem[];
  instancias: InstanciaItem[];
  metricas: {
    mensagens: number;
    entrada: number;
    saida: number;
    tempoRespMedioSeg: number | null;
  };
  contatos: { hoje: number; d7: number; d15: number; d30: number };
  totalCadastros: number;
  totalCidades: number;
  // Escopo da visão: 'global' (admin/mkt), 'candidato' (só o dele), 'lider'.
  escopo: "global" | "candidato" | "lider";
  candidatoNome?: string;
  // Visão gerencial por candidato (só no escopo global). Vazio nos demais.
  porCandidato: CandidatoStat[];
  // Curva de contatos acumulados (global + por instância) para o gráfico gerencial.
  serieContatos: SerieContatos;
  // Metas de captação com progresso ao vivo (filtradas por escopo).
  metas: MetaProgresso[];
  atualizadoEm: string;
};

// Datas no fuso de São Paulo (banco em UTC).
const DLOCAL = "(criado_em AT TIME ZONE 'America/Sao_Paulo')::date";
const HOJE = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

// Tempo médio entre uma mensagem recebida (in) e a primeira resposta (out)
// para o mesmo contato, considerando os últimos 30 dias.
async function tempoRespostaMedio(agenteIds?: number[]): Promise<number | null> {
  const filtroAg = agenteIds && agenteIds.length ? `AND agente_id IN (${agenteIds.join(",")})` : "";
  const rows = await query<{
    contato: string;
    direcao: string;
    criado_em: string;
  }>(
    `SELECT contato, direcao, criado_em
       FROM mensagens
      WHERE contato IS NOT NULL AND direcao IN ('in','out')
        AND criado_em >= now() - interval '30 days' ${filtroAg}
      ORDER BY contato, criado_em`
  );

  let soma = 0;
  let n = 0;
  let contatoAtual = "";
  let inPendente: number | null = null;

  for (const r of rows) {
    if (r.contato !== contatoAtual) {
      contatoAtual = r.contato;
      inPendente = null;
    }
    const t = new Date(String(r.criado_em).replace(" ", "T")).getTime();
    if (Number.isNaN(t)) continue;
    if (r.direcao === "in") {
      if (inPendente === null) inPendente = t;
    } else {
      if (inPendente !== null) {
        const d = (t - inPendente) / 1000;
        if (d >= 0) {
          soma += d;
          n++;
        }
        inPendente = null;
      }
    }
  }
  return n ? Math.round(soma / n) : null;
}

// Painel vazio: usado quando o banco engasga, para a tela abrir mesmo assim
// (o componente ao vivo recarrega os números sozinho segundos depois).
export function dashboardVazio(escopo: DashboardData["escopo"] = "global"): DashboardData {
  return {
    whats: { total: 0, conectados: 0 },
    lideranca: [],
    instancias: [],
    metricas: { mensagens: 0, entrada: 0, saida: 0, tempoRespMedioSeg: null },
    contatos: { hoje: 0, d7: 0, d15: 0, d30: 0 },
    totalCadastros: 0,
    totalCidades: 0,
    escopo,
    porCandidato: [],
    serieContatos: {
      dias: [],
      global: [],
      series: [],
      hojeIdx: 0,
      eleicaoIdx: 0,
      eleicao: "",
    },
    metas: [],
    atualizadoEm: new Date().toISOString(),
  };
}

export async function coletarDashboard(sessao: Sessao): Promise<DashboardData> {
  const ehLider = sessao.perfil === "LIDER";
  // Escopado ao candidato: CANDIDATO real OU usuário de equipe vinculado
  // (números marcados no usuário ou do gabinete). ADMIN nunca é escopado.
  const meus = await agentesDaSessao(sessao);
  const bound = meus !== null;
  const ehCandidato = sessao.perfil === "CANDIDATO" || bound;

  // Agentes (números) do escopo, quando aplicável: candidato/equipe = os dele.
  const agenteIds: number[] | null = bound ? (meus!.length ? meus! : [-1]) : null;
  const inIds = agenteIds ? `(${agenteIds.join(",")})` : "";

  const escopo = ehLider
    ? `AND criado_por = '${sessao.uid}'`
    : agenteIds
    ? `AND agente_id IN ${inIds}`
    : "";
  const escAgente = agenteIds ? `AND agente_id IN ${inIds}` : "";
  const escAgenteId = agenteIds ? `AND id IN ${inIds}` : "";
  const escopoGlobal = !ehLider && !ehCandidato;

  const num = async (where: string): Promise<number> => {
    const r = await queryOne<{ c: number }>(
      `SELECT COUNT(*) c FROM pessoas WHERE 1=1 ${escopo} ${where}`
    );
    return r?.c ?? 0;
  };

  // 1. Números de WhatsApp (nossas instâncias = agentes)
  const whatsTotal =
    (await queryOne<{ c: number }>(`SELECT COUNT(*) c FROM agentes WHERE 1=1 ${escAgenteId}`))?.c ?? 0;
  const whatsConectados =
    (
      await queryOne<{ c: number }>(
        `SELECT COUNT(*) c FROM agentes WHERE ativo = 1 AND instancia IS NOT NULL AND instancia <> '' ${escAgenteId}`
      )
    )?.c ?? 0;

  // 2. Indicador de liderança (ranking por nº de cadastros). Líder vê só a si.
  const lideranca = await query<LiderancaItem>(
    `SELECT u.nome AS nome, u.perfil AS perfil, COUNT(p.id) AS total
       FROM pessoas p
       JOIN usuarios u ON u.id = CASE WHEN p.criado_por ~ '^[0-9]+$' THEN p.criado_por::bigint END
      WHERE p.criado_por IS NOT NULL
        ${ehLider ? `AND p.criado_por = '${sessao.uid}'` : ""}
      GROUP BY p.criado_por, u.nome, u.perfil
      ORDER BY total DESC, u.nome
      LIMIT 8`
  );

  // 2b. Instâncias ativas (base real): por agente, status + mensagens de hoje
  const instancias = await query<InstanciaItem>(
    `SELECT a.candidato AS candidato,
            a.instancia AS instancia,
            (a.ativo = 1 AND a.instancia IS NOT NULL AND a.instancia <> '') AS ativo,
            COALESCE((
              SELECT COUNT(*) FROM mensagens m
               WHERE m.agente_id = a.id
                 AND ${DLOCAL.replace("criado_em", "m.criado_em")} = ${HOJE}
            ), 0) AS "mensagensHoje"
       FROM agentes a
      WHERE 1=1 ${escAgenteId.replace("AND id", "AND a.id")}
      ORDER BY ativo DESC, a.candidato`
  );

  // 3. Métricas chave (mensagens + tempo de resposta)
  const m = await queryOne<{
    total: number | null;
    entrada: number | null;
    saida: number | null;
  }>(
    `SELECT
       SUM(CASE WHEN direcao IN ('in','out') THEN 1 ELSE 0 END) total,
       SUM(CASE WHEN direcao = 'in'  THEN 1 ELSE 0 END) entrada,
       SUM(CASE WHEN direcao = 'out' THEN 1 ELSE 0 END) saida
     FROM mensagens WHERE 1=1 ${escAgente}`
  );

  // 4. Contatos que caíram (novos cadastros) por janela
  const contatos = {
    hoje: await num(`AND ${DLOCAL} = ${HOJE}`),
    d7: await num(`AND ${DLOCAL} >= ${HOJE} - 6`),
    d15: await num(`AND ${DLOCAL} >= ${HOJE} - 14`),
    d30: await num(`AND ${DLOCAL} >= ${HOJE} - 29`),
  };

  const totalCidades =
    (
      await queryOne<{ c: number }>(
        `SELECT COUNT(DISTINCT cidade) c FROM pessoas WHERE cidade IS NOT NULL ${escopo}`
      )
    )?.c ?? 0;

  // 5. Visão gerencial POR CANDIDATO (só no escopo global). Agrupa por 1º nome
  //    (cada candidato tem >1 número). Alcance/respostas = contatos distintos.
  const porCandidato: CandidatoStat[] = escopoGlobal
    ? await coletarPorCandidato()
    : [];

  // Curva de contatos acumulados (global + por instância), respeitando o escopo.
  const escSerie = ehLider
    ? `AND p.criado_por = '${sessao.uid}'`
    : agenteIds
    ? `AND p.agente_id IN ${inIds}`
    : "";
  const serieContatos = await coletarSerieContatos(escSerie);

  // 6. Metas com progresso ao vivo (candidato vê as globais + as dele).
  const metas = ehCandidato
    ? await listarMetasComProgresso(sessao.escopoCandidato || sessao.nome)
    : await listarMetasComProgresso();

  return {
    whats: { total: whatsTotal, conectados: whatsConectados },
    lideranca,
    instancias,
    metricas: {
      mensagens: m?.total ?? 0,
      entrada: m?.entrada ?? 0,
      saida: m?.saida ?? 0,
      tempoRespMedioSeg: await tempoRespostaMedio(agenteIds ?? undefined),
    },
    contatos,
    totalCadastros: await num(""),
    totalCidades,
    escopo: ehLider ? "lider" : ehCandidato ? "candidato" : "global",
    candidatoNome: ehCandidato ? (sessao.escopoCandidato || sessao.nome) : undefined,
    porCandidato,
    serieContatos,
    metas,
    atualizadoEm: new Date().toISOString(),
  };
}

// Curva de contatos ACUMULADOS por dia — global e por candidato/instância.
// `escSerie` é o filtro já pronto (com prefixo p.) conforme o escopo da sessão.
async function coletarSerieContatos(escSerie: string): Promise<SerieContatos> {
  const rows = await query<{ dia: string; candidato: string | null; n: number }>(
    `SELECT to_char((p.criado_em AT TIME ZONE 'America/Sao_Paulo')::date,'YYYY-MM-DD') AS dia,
            a.candidato AS candidato,
            COUNT(*)::int AS n
       FROM pessoas p
       LEFT JOIN agentes a ON a.id = p.agente_id
      WHERE 1=1 ${escSerie}
      GROUP BY 1, 2
      ORDER BY 1`
  );
  // Hoje no fuso de SP (YYYY-MM-DD) e a data da votação (1º turno 2026).
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  if (rows.length === 0) {
    const dias = listarDias(hoje < ELEICAO_2026 ? hoje : ELEICAO_2026, hoje < ELEICAO_2026 ? ELEICAO_2026 : hoje);
    return { dias, global: dias.map(() => null), series: [], hojeIdx: 0, eleicaoIdx: dias.length - 1, eleicao: ELEICAO_2026 };
  }

  // Chave do candidato = 1º nome (junta Evolution + Meta do mesmo candidato).
  const chaveDe = (c: string | null) =>
    c ? c.trim().split(" ")[0] : "Sem vínculo";

  // Eixo DIÁRIO contínuo: do primeiro dia com dado até a votação (futuro fica vazio).
  const primeiro = rows.reduce((m, r) => (r.dia < m ? r.dia : m), rows[0].dia);
  const inicio = primeiro < hoje ? primeiro : hoje;
  const fim = ELEICAO_2026 > hoje ? ELEICAO_2026 : hoje;
  const dias = listarDias(inicio, fim);
  const idx = new Map(dias.map((d, i) => [d, i]));
  const hojeIdx = idx.get(hoje) ?? dias.length - 1;
  const eleicaoIdx = idx.get(ELEICAO_2026) ?? dias.length - 1;

  // Novos por dia (alinhados ao eixo diário), por candidato + global.
  const novosPorCand = new Map<string, number[]>();
  const novosGlobal = new Array(dias.length).fill(0);
  for (const r of rows) {
    const i = idx.get(r.dia);
    if (i == null) continue;
    const nome = chaveDe(r.candidato);
    if (!novosPorCand.has(nome)) novosPorCand.set(nome, new Array(dias.length).fill(0));
    novosPorCand.get(nome)![i] += r.n;
    novosGlobal[i] += r.n;
  }

  // Acumula preenchendo TODO dia; a partir de amanhã fica null (vazio até a votação).
  const acumular = (arr: number[]): (number | null)[] => {
    let s = 0;
    return dias.map((d, i) => {
      s += arr[i] || 0;
      return d <= hoje ? s : null;
    });
  };
  const totalAteHoje = (arr: number[]) => {
    let s = 0;
    for (let i = 0; i <= hojeIdx; i++) s += arr[i] || 0;
    return s;
  };

  const global = acumular(novosGlobal);
  const series = [...novosPorCand.entries()]
    .map(([nome, arr]) => ({ nome, valores: acumular(arr), total: totalAteHoje(arr) }))
    .sort((a, b) => b.total - a.total);

  return { dias, global, series, hojeIdx, eleicaoIdx, eleicao: ELEICAO_2026 };
}

// Data da votação (1º turno das Eleições 2026, domingo).
const ELEICAO_2026 = "2026-10-04";

// Lista todos os dias 'YYYY-MM-DD' de `ini` a `fim` (inclusive), sem buracos.
function listarDias(ini: string, fim: string): string[] {
  const out: string[] = [];
  let d = new Date(ini + "T00:00:00Z");
  const end = new Date(fim + "T00:00:00Z");
  for (let guard = 0; d <= end && guard < 2000; guard++) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

// Agrega os números por candidato (1º nome), com métricas reais e separáveis.
async function coletarPorCandidato(): Promise<CandidatoStat[]> {
  const agentes = await query<{
    id: number;
    candidato: string;
    ativo: boolean;
    quota_diaria: number | null;
    provedor: string;
  }>(
    `SELECT id, candidato,
            (ativo = 1 AND instancia IS NOT NULL AND instancia <> '') AS ativo,
            quota_diaria, provedor
       FROM agentes ORDER BY candidato`
  );
  // Estatísticas de mensagens agrupadas pelo 1º nome do candidato.
  const stats = await query<{
    chave: string;
    alcance: number;
    respostas: number;
    total: number;
    hoje: number;
    disparos: number;
  }>(
    `SELECT lower(split_part(a.candidato,' ',1)) AS chave,
            COUNT(DISTINCT m.contato) FILTER (WHERE m.contato IS NOT NULL AND m.contato <> '') AS alcance,
            COUNT(DISTINCT m.contato) FILTER (WHERE m.direcao = 'in') AS respostas,
            COUNT(*) FILTER (WHERE m.direcao IN ('in','out')) AS total,
            COUNT(*) FILTER (WHERE m.direcao IN ('in','out') AND ${DLOCAL.replace("criado_em", "m.criado_em")} = ${HOJE}) AS hoje,
            COUNT(*) FILTER (WHERE m.origem = 'campanha' AND m.direcao = 'out' AND ${DLOCAL.replace("criado_em", "m.criado_em")} = ${HOJE}) AS disparos
       FROM agentes a
       LEFT JOIN mensagens m ON m.agente_id = a.id
      GROUP BY 1`
  );
  const porChave = new Map(stats.map((s) => [s.chave, s]));

  // Junta agentes do mesmo candidato (1º nome) em um card só.
  const grupos = new Map<string, CandidatoStat>();
  for (const a of agentes) {
    const chave = (a.candidato || "").trim().split(" ")[0].toLowerCase();
    const s = porChave.get(chave);
    const g =
      grupos.get(chave) ??
      ({
        candidato: (a.candidato || "").trim().split(" ")[0],
        ativo: false,
        alcance: Number(s?.alcance ?? 0),
        mensagens: Number(s?.total ?? 0),
        mensagensHoje: Number(s?.hoje ?? 0),
        disparosHoje: Number(s?.disparos ?? 0),
        quota: 0,
        respostas: Number(s?.respostas ?? 0),
      } as CandidatoStat);
    g.ativo = g.ativo || a.ativo;
    g.quota += quotaEfetiva(a);
    grupos.set(chave, g);
  }
  return [...grupos.values()].sort((a, b) => b.alcance - a.alcance);
}
