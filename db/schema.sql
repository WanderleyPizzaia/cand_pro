-- ============================================================
-- Schema do CAND PRO (Postgres / Supabase)
-- Porte fiel das tabelas que existiam no SQLite (lib/db.ts).
-- Idempotente: pode rodar várias vezes.
-- ============================================================

-- ===== Usuários =====
CREATE TABLE IF NOT EXISTS usuarios (
  id          BIGSERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  senha_hash  TEXT NOT NULL,
  perfil      TEXT NOT NULL,
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Pessoas (eleitores / lideranças / contatos) =====
CREATE TABLE IF NOT EXISTS pessoas (
  id          BIGSERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  categoria   TEXT,
  funcao      TEXT,
  partido     TEXT,
  cidade      TEXT,
  regiao      TEXT,
  bairro      TEXT,
  whatsapp    TEXT,
  email       TEXT,
  instagram   TEXT,
  observacao  TEXT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  criado_por  TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pessoas_criado_por ON pessoas (criado_por);
CREATE INDEX IF NOT EXISTS idx_pessoas_cidade ON pessoas (cidade);
CREATE INDEX IF NOT EXISTS idx_pessoas_criado_em ON pessoas (criado_em);

-- ===== Configuração global (chave-valor): Evolution + IA =====
CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

-- ===== Agentes de IA (1 por candidato) =====
CREATE TABLE IF NOT EXISTS agentes (
  id         BIGSERIAL PRIMARY KEY,
  candidato  TEXT NOT NULL,
  instancia  TEXT,
  telefone   TEXT,
  persona    TEXT,
  ativo      INTEGER NOT NULL DEFAULT 0,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Mensagens de WhatsApp (log + métricas) =====
CREATE TABLE IF NOT EXISTS mensagens (
  id            BIGSERIAL PRIMARY KEY,
  agente_id     BIGINT REFERENCES agentes(id) ON DELETE SET NULL,
  contato       TEXT,
  contato_nome  TEXT,
  direcao       TEXT NOT NULL,
  texto         TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mensagens_agente ON mensagens (agente_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_contato ON mensagens (contato);
CREATE INDEX IF NOT EXISTS idx_mensagens_criado_em ON mensagens (criado_em);

-- ===== Demandas (pedidos dos eleitores / tarefas da equipe) =====
CREATE TABLE IF NOT EXISTS demandas (
  id             BIGSERIAL PRIMARY KEY,
  titulo         TEXT NOT NULL,
  descricao      TEXT,
  categoria      TEXT,
  status         TEXT NOT NULL DEFAULT 'Aberta',
  prioridade     TEXT NOT NULL DEFAULT 'Média',
  eleitor_id     BIGINT REFERENCES pessoas(id) ON DELETE SET NULL,
  responsavel_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  cidade         TEXT,
  bairro         TEXT,
  prazo          DATE,
  criado_por     TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_demandas_status ON demandas (status);
CREATE INDEX IF NOT EXISTS idx_demandas_responsavel ON demandas (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_demandas_cidade ON demandas (cidade);
CREATE INDEX IF NOT EXISTS idx_demandas_criado_em ON demandas (criado_em);

-- ===== Campanhas de WhatsApp em massa =====
CREATE TABLE IF NOT EXISTS campanhas (
  id             BIGSERIAL PRIMARY KEY,
  titulo         TEXT,
  agente_id      BIGINT REFERENCES agentes(id) ON DELETE SET NULL,
  mensagem       TEXT NOT NULL,
  filtro_cidade  TEXT,
  filtro_categoria TEXT,
  total          INTEGER NOT NULL DEFAULT 0,
  enviados       INTEGER NOT NULL DEFAULT 0,
  falhas         INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'rascunho',
  criado_por     TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campanhas_criado_em ON campanhas (criado_em);
