import { randomBytes } from "crypto";
import pg, { Pool } from "pg";
import { hashSenha } from "./senha";

// ============================================================
// Camada de dados - Postgres (Supabase self-hosted).
// Credenciais vêm de variáveis de ambiente (.env.local / Vercel).
// ============================================================

// Parsers: BIGINT/COUNT -> number; timestamps/date -> string (como o SQLite).
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // int8
pg.types.setTypeParser(1114, (v) => v); // timestamp
pg.types.setTypeParser(1184, (v) => v); // timestamptz
pg.types.setTypeParser(1082, (v) => v); // date

const globalForDb = globalThis as unknown as {
  _pool?: Pool;
  _ready?: Promise<void>;
};

export const pool =
  globalForDb._pool ??
  new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
    // Serverless: cada lambda tem o SEU pool. Com max alto e sem timeout, as
    // lambdas congeladas seguravam conexões abertas e o banco (max_connections
    // = 100) esgotava — "remaining connection slots are reserved".
    // Poucas conexões por instância + devolução rápida do que está ocioso.
    max: 3,
    idleTimeoutMillis: 5000,
    allowExitOnIdle: true,
    connectionTimeoutMillis: 10000,
    // Aparece no pg_stat_activity: dá para saber quem é quem num diagnóstico.
    application_name: "candpro",
  });
if (!globalForDb._pool) {
  globalForDb._pool = pool;
  pool.on("error", (e) => console.error("[pg pool]", e.message));
  // Fuso do Brasil em TODA conexão. Sem isto a sessão do Postgres roda em UTC e
  // os horários exibidos (to_char de criado_em, etc.) saem +3h — "22:05" virava
  // "01:05". As expressões que já usam `AT TIME ZONE 'America/Sao_Paulo'` são
  // absolutas e continuam corretas; isto só acerta o horário local padrão.
  pool.on("connect", (c) => {
    c.query("SET TIME ZONE 'America/Sao_Paulo'").catch(() => {});
  });
}

// ===== Tipos =====
export type Usuario = {
  id: number;
  nome: string;
  email: string;
  senha_hash: string;
  perfil: string;
  foto: string | null;
  ativo: number;
  onboarded: boolean;
  candidato_escopo: string | null;
  criado_em: string;
};

export type Pessoa = {
  id: number;
  nome: string;
  categoria: string | null;
  funcao: string | null;
  funcao_outro: string | null;
  partido: string | null;
  cidade: string | null;
  regiao: string | null;
  bairro: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram: string | null;
  observacao: string | null;
  foto: string | null;
  lat: number | null;
  lng: number | null;
  criado_por: string | null;
  criado_em: string;
};

export type Agente = {
  id: number;
  candidato: string;
  instancia: string | null;
  telefone: string | null;
  persona: string | null;
  apikey: string | null;
  ia_key: string | null;
  usuario_id: number | null;
  // Provedor de WhatsApp: 'evolution' (não-oficial) ou 'meta' (Cloud API oficial).
  provedor: string;
  meta_phone_id: string | null;
  meta_token: string | null;
  meta_waba_id: string | null;
  // Config variável (ferramentas/atendimento) — editável pelo candidato e lida pelo n8n.
  config: AgenteConfig;
  // Cota diária de disparos deste agente. NULL = usa o padrão do provedor
  // (ver quotaEfetiva). Meta = tier do número (ex.: 20000/dia); Evolution = teto de
  // segurança (não-oficial, maior risco de bloqueio).
  quota_diaria: number | null;
  // Foto de perfil do WhatsApp do número do agente (data-URI base64).
  foto: string | null;
  ativo: number;
  criado_em: string;
};

// Cota padrão quando o agente não tem `quota_diaria` própria.
export const QUOTA_META_PADRAO = 1000;      // conservador; suba conforme o tier do número
export const QUOTA_EVOLUTION_PADRAO = 3000; // não-oficial: teto de segurança anti-bloqueio
export function quotaEfetiva(a: Pick<Agente, "quota_diaria" | "provedor">): number {
  if (a.quota_diaria != null && a.quota_diaria > 0) return a.quota_diaria;
  return a.provedor === "meta" ? QUOTA_META_PADRAO : QUOTA_EVOLUTION_PADRAO;
}

// Configuração "aberta" do agente (o técnico fica nas colunas travadas).
export type AgenteConfig = {
  ferramentas?: {
    coletar_nome_cidade?: boolean;
    cadastrar_eleitor?: boolean;
    registrar_demanda?: boolean;
    agendar_visita?: boolean;
    enviar_material?: boolean;
    transferir_humano?: boolean;
    avisar_equipe?: boolean;
  };
  atendimento?: {
    saudacao?: string;
    horario?: string;
    notificar_whatsapp?: string;
  };
  // Limites da conversa com a IA: seguram o custo por token e mantêm o agente
  // no assunto. Ver limitesDaIA() para os padrões.
  limites?: {
    // Respostas que a IA pode dar ao MESMO contato por dia. 0 = sem limite.
    respostas_dia?: number;
    // Mensagens anteriores enviadas à IA como contexto (o que mais pesa no custo).
    historico?: number;
    // Assuntos permitidos (texto livre). Vazio = sem trava de assunto.
    assuntos?: string;
    // O que responder quando o contato foge dos assuntos.
    fora_do_escopo?: string;
    // Horas até a IA voltar sozinha depois que um humano respondeu pelo
    // celular. 0 = não volta (comportamento antigo).
    pausa_humana_horas?: number;
  };
};

export type LimitesIA = {
  respostasDia: number;
  historico: number;
  assuntos: string;
  foraDoEscopo: string;
  pausaHumanaHoras: number;
};

// Padrões: 10 respostas por contato/dia e 8 mensagens de contexto. O histórico
// era fixo em 24 — é ele que faz a conta de tokens subir a cada resposta.
export const LIMITES_IA_PADRAO: LimitesIA = {
  respostasDia: 10,
  historico: 8,
  assuntos: "",
  foraDoEscopo: "Sobre isso eu não consigo ajudar por aqui.",
  pausaHumanaHoras: 6,
};

export function limitesDaIA(a: Pick<Agente, "config">): LimitesIA {
  const c = a.config?.limites || {};
  const num = (v: unknown, padrao: number, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return padrao;
    return Math.min(Math.floor(n), max);
  };
  return {
    respostasDia: c.respostas_dia === undefined ? LIMITES_IA_PADRAO.respostasDia : num(c.respostas_dia, LIMITES_IA_PADRAO.respostasDia, 200),
    historico: c.historico === undefined ? LIMITES_IA_PADRAO.historico : Math.max(2, num(c.historico, LIMITES_IA_PADRAO.historico, 40)),
    assuntos: (c.assuntos || "").trim(),
    foraDoEscopo: (c.fora_do_escopo || "").trim() || LIMITES_IA_PADRAO.foraDoEscopo,
    pausaHumanaHoras:
      c.pausa_humana_horas === undefined
        ? LIMITES_IA_PADRAO.pausaHumanaHoras
        : num(c.pausa_humana_horas, LIMITES_IA_PADRAO.pausaHumanaHoras, 720),
  };
}

// Padrão de fábrica de um agente novo (plug-and-play).
export const CONFIG_AGENTE_PADRAO: AgenteConfig = {
  ferramentas: {
    coletar_nome_cidade: true,
    cadastrar_eleitor: true,
    registrar_demanda: false,
    agendar_visita: false,
    enviar_material: false,
    transferir_humano: false,
    avisar_equipe: false,
  },
  atendimento: { saudacao: "", horario: "", notificar_whatsapp: "" },
  limites: {
    respostas_dia: 10,
    historico: 8,
    assuntos: "",
    fora_do_escopo: "",
    pausa_humana_horas: 6,
  },
};

export type Mensagem = {
  id: number;
  agente_id: number | null;
  contato: string | null;
  contato_nome: string | null;
  direcao: string;
  texto: string | null;
  criado_em: string;
};

export type Campanha = {
  id: number;
  titulo: string | null;
  agente_id: number | null;
  mensagem: string;
  filtro_cidade: string | null;
  filtro_categoria: string | null;
  total: number;
  enviados: number;
  falhas: number;
  status: string;
  criado_por: string | null;
  criado_em: string;
};

export type Demanda = {
  id: number;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  status: string;
  prioridade: string;
  eleitor_id: number | null;
  responsavel_id: number | null;
  cidade: string | null;
  bairro: string | null;
  prazo: string | null;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type TemplateVar = {
  pos: number;      // posição {{n}} no corpo (1-based)
  rotulo: string;   // rótulo amigável ex.: "Nome"
  campo: string | null; // coluna de `pessoas` ou null (manual na etapa 2)
  exemplo: string;  // valor de exemplo (obrigatório p/ Meta)
};

export type Template = {
  id: number;
  agente_id: number;
  nome: string;
  categoria: string;            // 'MARKETING' | 'UTILITY'
  idioma: string;               // 'pt_BR'
  componentes: any;             // jsonb: array de components enviado à Meta
  variaveis: TemplateVar[];     // jsonb
  status: string;               // 'PENDENTE' | 'APROVADO' | 'REJEITADO'
  categoria_original: string | null; // categoria enviada; se != categoria => Meta reclassificou
  meta_id: string | null;
  motivo_rejeicao: string | null;
  criado_por: string | null;
  criado_em: string;
};

// ===== Schema (idempotente - espelha db/schema.sql) =====
const DDL = `
CREATE TABLE IF NOT EXISTS usuarios (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pessoas (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria TEXT, funcao TEXT, partido TEXT, cidade TEXT, regiao TEXT, bairro TEXT,
  whatsapp TEXT, email TEXT, instagram TEXT, observacao TEXT,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  criado_por TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pessoas_criado_por ON pessoas (criado_por);
CREATE INDEX IF NOT EXISTS idx_pessoas_cidade ON pessoas (cidade);
CREATE INDEX IF NOT EXISTS idx_pessoas_criado_em ON pessoas (criado_em);
CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);
CREATE TABLE IF NOT EXISTS agentes (
  id BIGSERIAL PRIMARY KEY,
  candidato TEXT NOT NULL,
  instancia TEXT, telefone TEXT, persona TEXT,
  ativo INTEGER NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mensagens (
  id BIGSERIAL PRIMARY KEY,
  agente_id BIGINT REFERENCES agentes(id) ON DELETE SET NULL,
  contato TEXT, contato_nome TEXT, direcao TEXT NOT NULL, texto TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mensagens_agente ON mensagens (agente_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_contato ON mensagens (contato);
CREATE INDEX IF NOT EXISTS idx_mensagens_criado_em ON mensagens (criado_em);
CREATE TABLE IF NOT EXISTS demandas (
  id BIGSERIAL PRIMARY KEY,
  titulo TEXT NOT NULL, descricao TEXT, categoria TEXT,
  status TEXT NOT NULL DEFAULT 'Aberta',
  prioridade TEXT NOT NULL DEFAULT 'Média',
  eleitor_id BIGINT REFERENCES pessoas(id) ON DELETE SET NULL,
  responsavel_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  cidade TEXT, bairro TEXT, prazo DATE, criado_por TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_demandas_status ON demandas (status);
CREATE INDEX IF NOT EXISTS idx_demandas_responsavel ON demandas (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_demandas_cidade ON demandas (cidade);
CREATE INDEX IF NOT EXISTS idx_demandas_criado_em ON demandas (criado_em);
CREATE TABLE IF NOT EXISTS campanhas (
  id BIGSERIAL PRIMARY KEY,
  titulo TEXT,
  agente_id BIGINT REFERENCES agentes(id) ON DELETE SET NULL,
  mensagem TEXT NOT NULL,
  filtro_cidade TEXT,
  filtro_categoria TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  enviados INTEGER NOT NULL DEFAULT 0,
  falhas INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'rascunho',
  criado_por TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campanhas_criado_em ON campanhas (criado_em);
`;

// ===== Primeiro acesso (roda só quando a tabela está vazia) =====
async function semearUsuarios() {
  const { rows } = await pool.query("SELECT COUNT(*) c FROM usuarios");
  if (rows[0].c > 0) return;

  // Bootstrap: numa instalação nova (nenhum usuário), cria o admin inicial SÓ
  // se ADMIN_EMAIL e ADMIN_SENHA estiverem no ambiente. Não existe senha padrão
  // no código. Os demais usuários são criados pela tela /usuarios.
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const senha = process.env.ADMIN_SENHA || "";
  if (!email || !senha) {
    console.warn(
      "[bootstrap] Banco sem usuários e ADMIN_EMAIL/ADMIN_SENHA não definidos: nenhum admin criado."
    );
    return;
  }
  await pool.query(
    "INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1, $2, $3, $4)",
    ["Administrador", email, hashSenha(senha), "ADMIN"]
  );
}

// Remove os dados fictícios da antiga demo de vendas de bancos que já os
// receberam. Só apaga o que o seed gerou (criado_por = 'demo-oseias'):
// cadastros, demandas e as mensagens do agente demo com esses números
// fictícios. O agente demo só é apagado se ficar vazio; se ele chegou a
// conectar um WhatsApp real, as conversas reais ficam e ele vira um agente
// comum. A conta demo é desativada e perde a senha pública. Idempotente.
async function limparDemoAntiga() {
  await pool.query(
    `DELETE FROM mensagens
      WHERE agente_id IN (SELECT id FROM agentes WHERE demo)
        AND contato IN (SELECT whatsapp FROM pessoas WHERE criado_por = 'demo-oseias')`
  );
  await pool.query(`DELETE FROM demandas WHERE criado_por = 'demo-oseias'`);
  await pool.query(`DELETE FROM pessoas WHERE criado_por = 'demo-oseias'`);
  await pool.query(
    `DELETE FROM agentes a
      WHERE a.demo
        AND NOT EXISTS (SELECT 1 FROM mensagens m WHERE m.agente_id = a.id)
        AND NOT EXISTS (SELECT 1 FROM pessoas p WHERE p.agente_id = a.id)`
  );
  await pool.query(`UPDATE agentes SET demo = false WHERE demo`);
  await pool.query(
    `UPDATE usuarios SET ativo = 0, demo = false, senha_hash = $1 WHERE demo`,
    [hashSenha(randomBytes(32).toString("hex"))]
  );
}

// Versão do schema. Só BUMPAR quando adicionar/alterar tabela ou coluna aqui —
// aí o próximo boot roda as migrações uma vez e volta a pular. Isto é o que
// deixa o app rápido: sem o gate, cada lambda fria repetia ~50 comandos DDL +
// seeds antes da 1ª consulta (o "demora no primeiro clique").
const SCHEMA_V = "2026-09-20.comando-ia";

async function inicializar() {
  // Gate barato: garante a tabela config e, se o schema já está na versão
  // atual, PULA todo o bloco de DDL/migrações/seeds (fica em 1 consulta).
  await pool.query(
    `CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT)`
  );
  const jaAplicado = await pool.query(
    `SELECT valor FROM config WHERE chave = 'schema_v'`
  );
  if (jaAplicado.rows[0]?.valor === SCHEMA_V) return;

  await pool.query(DDL);
  // Migrations idempotentes para colunas adicionadas após o schema inicial
  await pool.query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS apikey TEXT`);
  // Chave de IA por agente (cost por candidato). Vazia => usa a global do config.
  await pool.query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS ia_key TEXT`);
  await pool.query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS agente_id BIGINT REFERENCES agentes(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS foto TEXT`);
  await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto TEXT`);
  // wa_id = id da mensagem no WhatsApp (key.id). Usado para deduplicar o sync
  // de histórico (rodar 2x não duplica). Índice único parcial ignora os nulos
  // (mensagens antigas gravadas pelo webhook antes desta coluna).
  await pool.query(`ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS wa_id TEXT`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_mensagens_wa_id ON mensagens (wa_id) WHERE wa_id IS NOT NULL`
  );
  // status do WhatsApp (sent/delivered/read) para os ticks da réplica.
  await pool.query(`ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS status TEXT`);
  // Limpa fotos CDN do WhatsApp (URLs http*) que expiram em horas. Mantém só base64.
  await pool.query(`UPDATE pessoas SET foto = NULL WHERE foto IS NOT NULL AND foto NOT LIKE 'data:image%'`);
  // Flag de onboarding (1º login com splash). As colunas `demo` são legado da
  // antiga demo de vendas: o app não as usa mais, só limparDemoAntiga().
  await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS demo BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS demo BOOLEAN NOT NULL DEFAULT false`);
  // Provedor de WhatsApp por agente: 'evolution' (padrão) ou 'meta' (Cloud API oficial).
  await pool.query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS provedor TEXT NOT NULL DEFAULT 'evolution'`);
  await pool.query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS meta_phone_id TEXT`);
  await pool.query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS meta_token TEXT`);
  await pool.query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS meta_waba_id TEXT`);
  // Configuração VARIÁVEL do agente (ferramentas, saudação, horário, handoff).
  // É o contrato que o "Meu Agente" grava e que o n8n vai ler (Fase 2).
  await pool.query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb`);
  // Cota diária de disparos por agente (NULL = padrão do provedor, ver quotaEfetiva).
  await pool.query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS quota_diaria INTEGER`);
  // Treino do agente: persona_base guarda a persona ORIGINAL. A persona ATIVA
  // (usada nas respostas) é reconstruída = base + itens de treino. Assim o
  // treino é acumulativo e reversível, sem tocar no caminho de resposta.
  await pool.query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS persona_base TEXT`);
  await pool.query(`CREATE TABLE IF NOT EXISTS agente_conhecimento (
    id BIGSERIAL PRIMARY KEY,
    agente_id BIGINT NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'entrevista',
    titulo TEXT,
    conteudo TEXT NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_conhecimento_agente ON agente_conhecimento (agente_id)`);
  // Acolhimento de pauta: demanda/denúncia/sugestão do eleitor por gabinete.
  await pool.query(`CREATE TABLE IF NOT EXISTS pautas (
    id BIGSERIAL PRIMARY KEY,
    agente_id BIGINT REFERENCES agentes(id) ON DELETE SET NULL,
    origem TEXT NOT NULL DEFAULT 'publico',
    nome TEXT,
    contato TEXT,
    cidade TEXT,
    bairro TEXT,
    regiao TEXT,
    lat REAL,
    lng REAL,
    tema TEXT NOT NULL DEFAULT 'outros',
    tipo TEXT NOT NULL DEFAULT 'solicitacao',
    titulo TEXT,
    descricao TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'nova',
    prioridade TEXT,
    resposta TEXT,
    criado_por TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pautas_agente ON pautas (agente_id)`);
  await pool.query(`ALTER TABLE pautas ADD COLUMN IF NOT EXISTS protocolo TEXT`);

  // Matriz política (compasso de 2 eixos) por candidato: posição atual + respostas.
  await pool.query(`CREATE TABLE IF NOT EXISTS matriz_politica (
    agente_id BIGINT PRIMARY KEY REFERENCES agentes(id) ON DELETE CASCADE,
    economico REAL NOT NULL DEFAULT 0,
    social REAL NOT NULL DEFAULT 0,
    respostas JSONB NOT NULL DEFAULT '{}'::jsonb,
    origem TEXT NOT NULL DEFAULT 'questionario',
    justificativa TEXT,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  // Disparos: liga cada mensagem à campanha (monitoramento: entregues/lidos/responderam).
  await pool.query(`ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS campanha_id BIGINT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_mensagens_campanha ON mensagens (campanha_id)`);
  // Disparos: agendamento (NULL = envio imediato). status 'agendada' até disparar.
  await pool.query(`ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS agendado_para TIMESTAMPTZ`);
  // Metas: alvo de captação por candidato (ou global) com progresso calculado ao vivo.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS metas (
      id BIGSERIAL PRIMARY KEY,
      titulo TEXT NOT NULL,
      escopo TEXT NOT NULL DEFAULT 'global',   -- 'global' | 'candidato'
      candidato TEXT,                           -- nome do candidato (quando escopo='candidato')
      metrica TEXT NOT NULL DEFAULT 'alcance',  -- 'cadastros' | 'alcance' | 'mensagens' | 'respostas'
      alvo INTEGER NOT NULL,
      prazo DATE,
      criado_por TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_metas_candidato ON metas (candidato)`);
  // Isolamento por candidato: vincula um usuário (candidato OU equipe) a um candidato.
  // NULL = sem escopo (ADMIN/global). Não-admin com escopo só vê o terreno desse candidato.
  await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS candidato_escopo TEXT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pessoas_agente ON pessoas (agente_id)`);
  // Áudio (e futuras mídias) na conversa: guarda o conteúdo como data-URI base64
  // (media) + o tipo (media_tipo = 'audio'). Sem storage externo — por isso base64.
  await pool.query(`ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS media TEXT`);
  await pool.query(`ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS media_tipo TEXT`);
  // Cargo/Função: texto livre quando o cargo é "Outro" (especifique qual).
  await pool.query(`ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS funcao_outro TEXT`);
  // Origem do geo do mapa: 'cidade' = cidade informada (preciso) | 'ddd' =
  // estimado pela região do DDD do telefone (aproximado). Deixa o mapa HONESTO
  // sobre o que é confirmado vs estimativa.
  await pool.query(`ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS geo_origem TEXT`);
  // Atendimento humano: quando a equipe assume um contato pelo WhatsApp Web, a IA
  // pausa para aquele contato (presença = pausado). O comando "/ia" alterna.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS atendimento_pausado (
      agente_id BIGINT NOT NULL,
      contato TEXT NOT NULL,
      pausado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (agente_id, contato)
    )`);
  // 'humano' (alguém respondeu pelo celular) expira sozinha; 'comando' (a
  // equipe pediu para calar a IA) só volta quando alguém mandar voltar.
  await pool.query(
    `ALTER TABLE atendimento_pausado ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'humano'`
  );
  // Limpeza única: as pausas marcadas como 'comando' até aqui vieram da frase
  // "Deus Abençoe" disparada sem querer no fim das mensagens. Voltam a ser
  // 'humano' para expirarem sozinhas em vez de calar a conversa para sempre.
  await pool.query(`UPDATE atendimento_pausado SET tipo = 'humano' WHERE tipo = 'comando'`);
  // Atribuição de conversa a uma atendente da equipe (transferir atendimento).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS atendimento_atribuicao (
      agente_id BIGINT NOT NULL,
      contato TEXT NOT NULL,
      usuario_id BIGINT NOT NULL,
      usuario_nome TEXT,
      atribuido_por BIGINT,
      atribuido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (agente_id, contato)
    )`);
  // Origem da mensagem enviada: 'ia' | 'humano' | 'campanha' (abas e métricas).
  await pool.query(`ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS origem TEXT`);
  // Foto de perfil do WhatsApp do próprio agente (base64; a URL do CDN expira).
  await pool.query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS foto TEXT`);
  // Verify token do webhook da Meta (handshake). Gerado aleatório por instalação
  // (nada fixo no código); o admin pode trocar depois.
  await pool.query(
    `INSERT INTO config (chave, valor) VALUES ('META_VERIFY_TOKEN', md5(random()::text || clock_timestamp()::text))
     ON CONFLICT (chave) DO NOTHING`
  );
  // Templates de mensagem da Meta (Cloud API). Cópia local guarda os rótulos e
  // o mapeamento das variáveis que a Graph API não devolve (só {{1}}).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS templates (
      id              BIGSERIAL PRIMARY KEY,
      agente_id       BIGINT NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
      nome            TEXT NOT NULL,
      categoria       TEXT NOT NULL,
      idioma          TEXT NOT NULL DEFAULT 'pt_BR',
      componentes     JSONB NOT NULL DEFAULT '[]'::jsonb,
      variaveis       JSONB NOT NULL DEFAULT '[]'::jsonb,
      status          TEXT NOT NULL DEFAULT 'PENDENTE',
      meta_id         TEXT,
      motivo_rejeicao TEXT,
      criado_por      TEXT,
      criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_templates_agente_nome ON templates (agente_id, nome)`
  );
  // Categoria enviada na criação; se diferir de `categoria` (sincronizada da Meta),
  // significa que a Meta reclassificou o template (ex.: UTILITY -> MARKETING).
  await pool.query(`ALTER TABLE templates ADD COLUMN IF NOT EXISTS categoria_original TEXT`);

  // Performance do inbox (a lista roda a cada 4s + em cada troca/busca):
  // 1) Índice composto para o DISTINCT ON (contato) ... ORDER BY criado_em DESC —
  //    evita varrer/ordenar a tabela inteira de mensagens.
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_mensagens_contato_recente ON mensagens (contato, criado_em DESC, id DESC)`
  );
  // 2) Índice FUNCIONAL para o JOIN pessoas.whatsapp (só dígitos) = mensagens.contato,
  //    senão o Postgres roda regexp_replace em cada eleitor (full scan).
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_pessoas_whatsapp_digitos ON pessoas ((regexp_replace(COALESCE(whatsapp,''),'\\D','','g')))`
  );

  // ==========================================================
  // CRM de Atendimento em equipe (inbox multi-atendente).
  // Uma linha por CONVERSA (contato + agente). `atendente_id` = dono humano
  // (NULL = na fila, ninguém assumiu). Round-robin distribui para atendentes
  // disponíveis; a IA continua respondendo até o humano assumir (pausa a IA).
  // Estado por colunas ortogonais (como o CRM de referência): fila/atribuído
  // derivam de atendente_id; resolvido/reaberto de resolvido_em.
  // ==========================================================
  await pool.query(`
    CREATE TABLE IF NOT EXISTS atendimentos (
      id            BIGSERIAL PRIMARY KEY,
      agente_id     BIGINT NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
      contato       TEXT NOT NULL,
      atendente_id  BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
      status        TEXT NOT NULL DEFAULT 'fila',
      fila_desde    TIMESTAMPTZ NOT NULL DEFAULT now(),
      assumido_em   TIMESTAMPTZ,
      resolvido_em  TIMESTAMPTZ,
      resolvido_por BIGINT,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_atendimentos_agente_contato ON atendimentos (agente_id, contato)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_atendimentos_atendente ON atendimentos (atendente_id)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_atendimentos_status ON atendimentos (status, atualizado_em DESC)`
  );
  // Bot de saudação: marca se a conversa já recebeu a 1ª resposta automática.
  await pool.query(
    `ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS bot_saudou BOOLEAN NOT NULL DEFAULT false`
  );
  // Presença do atendente: disponível liga/desliga o round-robin; visto_em é o
  // heartbeat (online = visto nos últimos ~2min). Ausente não recebe da fila.
  await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS disponivel BOOLEAN NOT NULL DEFAULT true`);
  await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS visto_em TIMESTAMPTZ`);
  // Cursor do round-robin por agente (rodízio justo). key = agente_id.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS atendimento_rr (
      agente_id BIGINT PRIMARY KEY,
      cursor    BIGINT NOT NULL DEFAULT 0
    )`);
  // Vínculo usuário ↔ número (agente). Nasceu só para atendente
  // (atendente_agentes); hoje vale para qualquer perfil: quem tem números
  // marcados enxerga exatamente esses. Renomeia a tabela antiga se existir.
  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.atendente_agentes') IS NOT NULL
         AND to_regclass('public.usuario_agentes') IS NULL THEN
        ALTER TABLE atendente_agentes RENAME TO usuario_agentes;
      END IF;
    END $$;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuario_agentes (
      usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      agente_id  BIGINT NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
      PRIMARY KEY (usuario_id, agente_id)
    )`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_usuario_agentes_agente ON usuario_agentes (agente_id)`
  );
  // Respostas rápidas (canned) do atendimento: atalho (ex.: "saudacao") + texto.
  // Compartilhadas pela equipe. Usadas digitando "/atalho" no campo de resposta.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS respostas_rapidas (
      id BIGSERIAL PRIMARY KEY,
      atalho TEXT NOT NULL,
      texto TEXT NOT NULL,
      criado_em TIMESTAMPTZ DEFAULT now()
    )`);
  // Listas de disparo (segmentos importados): uma lista pertence a UM número
  // (agente) e agrupa contatos (pessoas) para disparo em massa. Membros por
  // referência a pessoas (reaproveita dedup, mapa, inbox).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS listas (
      id         BIGSERIAL PRIMARY KEY,
      nome       TEXT NOT NULL,
      descricao  TEXT,
      agente_id  BIGINT NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
      criado_por TEXT,
      criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lista_membros (
      lista_id  BIGINT NOT NULL REFERENCES listas(id) ON DELETE CASCADE,
      pessoa_id BIGINT NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
      PRIMARY KEY (lista_id, pessoa_id)
    )`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_lista_membros_pessoa ON lista_membros (pessoa_id)`
  );
  // Limite de tentativas de login (anti força bruta), ver lib/seguranca.ts.
  // chave = 'conta:<email>|<ip>' | 'email:<email>' | 'ip:<ip>'.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_tentativas (
      chave         TEXT PRIMARY KEY,
      falhas        INTEGER NOT NULL DEFAULT 0,
      janela_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
      bloqueado_ate TIMESTAMPTZ
    )`);

  await semearUsuarios();

  // Limpeza best-effort: se falhar (ex.: FK inesperada), NÃO derruba o boot.
  try {
    await limparDemoAntiga();
  } catch (e) {
    console.error("[limparDemoAntiga] falha (ignorado):", e);
  }

  // Marca a versão aplicada AQUI — logo após o schema + seeds essenciais.
  // O próximo boot pula tudo (não trava o site).
  await pool.query(
    `INSERT INTO config (chave, valor) VALUES ('schema_v', $1)
     ON CONFLICT (chave) DO UPDATE SET valor = $1`,
    [SCHEMA_V]
  );
}

// Garante schema + seed uma única vez por processo. Se falhar (ex.: banco
// oscilou no boot), NÃO deixa a promessa rejeitada em cache — senão todas as
// próximas consultas do processo falhariam. Limpa e permite nova tentativa.
export function ready(): Promise<void> {
  if (!globalForDb._ready) {
    globalForDb._ready = inicializar().catch((e) => {
      globalForDb._ready = undefined;
      throw e;
    });
  }
  return globalForDb._ready;
}

// ===== Helpers de consulta (placeholders $1, $2, ...) =====
export async function query<T = any>(
  text: string,
  params: any[] = []
): Promise<T[]> {
  await ready();
  const r = await pool.query(text, params);
  return r.rows as T[];
}

export async function queryOne<T = any>(
  text: string,
  params: any[] = []
): Promise<T | undefined> {
  return (await query<T>(text, params))[0];
}

export async function execute(
  text: string,
  params: any[] = []
): Promise<number> {
  await ready();
  const r = await pool.query(text, params);
  return r.rowCount ?? 0;
}

// Disparos de campanha já enviados HOJE por este agente (fuso America/Sao_Paulo).
// Fonte: mensagens (origem='campanha', direcao='out'). Mesmo padrão do recebidasHoje.
export async function disparosUsadosHoje(agenteId: number): Promise<number> {
  const r = await queryOne<{ c: number }>(
    `SELECT COUNT(*) c FROM mensagens
      WHERE agente_id = $1 AND origem = 'campanha' AND direcao = 'out'
        AND (criado_em AT TIME ZONE 'America/Sao_Paulo')::date
          = (now() AT TIME ZONE 'America/Sao_Paulo')::date`,
    [agenteId]
  );
  return r?.c ?? 0;
}
