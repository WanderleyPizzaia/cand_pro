# CAND PRO — Documentação

CRM eleitoral + geomapeamento + atendimento por IA no WhatsApp para campanha no
estado de São Paulo. Este documento descreve **tudo que está implementado** até o
momento: arquitetura, banco de dados, telas, APIs, integrações, segurança e como
rodar/implantar.

> **Repositório:** `WanderleyPizzaia/cand_pro` (branch `main`)
> **Produção:** https://cand-pro.vercel.app

---

## 1. Visão geral

O sistema atende uma equipe de campanha com diferentes papéis (administração,
marketing, coordenação, candidatos e líderes). As principais capacidades:

- **Cadastro de pessoas** (eleitores, lideranças, contatos) com cidade,
  coordenadas e vínculo ao usuário que cadastrou.
- **Captação externa** por líder, via link público de formulário (sem login).
- **Geomapas**: Mapa de Votos (densidade de cadastros por cidade) e Mapa de
  Lideranças (onde estão as lideranças + ranking de captação).
- **Dashboard** com indicadores em tempo real.
- **WhatsApp com IA**: um agente por candidato que responde eleitores
  automaticamente (Evolution API + Claude).
- **Demandas/Tarefas**: registro e acompanhamento de pedidos dos eleitores.
- **Agenda**: espelho em tempo real do Google Calendar.
- **Gestão de usuários** e **configurações** de integrações.

---

## 2. Stack e arquitetura

| Camada | Tecnologia |
|---|---|
| Framework | **Next.js 14** (App Router, Server Components + API Routes) |
| Linguagem | TypeScript / React 18 |
| Banco de dados | **PostgreSQL** (Supabase self-hosted), acesso via `pg` |
| Mapas | Leaflet + react-leaflet (tiles CartoDB light) |
| IA | `@anthropic-ai/sdk` (modelo `claude-opus-4-8`) |
| WhatsApp | Evolution API (REST) |
| Agenda | Google Calendar (embed iframe) |
| Hospedagem | Vercel (serverless) |

**Princípios de arquitetura:**

- **Server Components** fazem leitura no banco direto (via helpers `query`) e
  renderizam HTML. **Client Components** (`"use client"`) cuidam de
  interatividade e chamam as **API Routes** (`/api/*`).
- Toda a camada de dados é **assíncrona** (Postgres pela rede).
- O banco é a **fonte única de verdade** e **persiste** (resolvido o problema
  antigo de SQLite em memória no Vercel, que perdia dados a cada deploy).

---

## 3. Estrutura de pastas

```
cand-pro/
├── app/
│   ├── (app)/                  # Área logada (protegida por sessão)
│   │   ├── layout.tsx          # Casca (AppShell) + guarda de sessão
│   │   ├── page.tsx            # Dashboard (1)
│   │   ├── cadastro/           # Cadastrar pessoa (2)
│   │   ├── pessoas/            # Lista de cadastros (2)
│   │   ├── mapa/               # Mapa de Votos (3)
│   │   │   └── liderancas/     # Mapa de Lideranças (3)
│   │   ├── agentes/            # WhatsApp · Agentes de IA (4)
│   │   ├── agenda/             # Agenda · Google Calendar (5)
│   │   ├── tarefas/            # Tarefas · Demandas (6)
│   │   ├── usuarios/           # Gestão de usuários (0)
│   │   ├── configuracoes/      # Integrações (ADMIN)
│   │   └── conta/              # Alterar senha
│   ├── login/                  # Tela de login (pública)
│   ├── form/[slug]/            # Formulário público de captação
│   ├── api/                    # API Routes (ver seção 10)
│   ├── components/             # Casca: AppShell, Sidebar, Topbar, SubNav,
│   │                           #   MobileNav, CommandPalette, navItens.ts…
│   └── styles/                 # Visual (ver seção 15): tokens, base,
│                               #   components, shell, telas, modulos, publico
├── lib/                        # Camada de domínio (ver seção abaixo)
├── db/schema.sql               # Schema do Postgres (versionado)
├── scripts/                    # Utilitários de banco (migrate, sql, dbcheck)
├── data/sp-cidades.json        # Base IBGE das cidades de SP (coordenadas)
├── middleware.ts               # Gating de rotas por cookie de sessão
└── .env.local                  # Segredos (NUNCA commitado)
```

**Camada `lib/`:**

| Arquivo | Responsabilidade |
|---|---|
| `db.ts` | Pool Postgres, helpers `query`/`queryOne`/`execute`, schema idempotente, seed |
| `auth.ts` | Sessão (cookie HMAC), perfis, helpers de servidor |
| `senha.ts` | Hash de senha (scrypt) |
| `config.ts` | Configuração chave-valor (integrações) com fallback p/ env |
| `dashboard.ts` | Coleta dos indicadores do Dashboard |
| `cidades.ts` | Busca de cidade na base IBGE (coordenadas) |
| `opcoes.ts` | Regiões/categorias e inferência de região por proximidade |
| `evolution.ts` | Cliente da Evolution API (envio de WhatsApp) |
| `ia.ts` | Geração de resposta do agente (Claude) |

---

## 4. Banco de dados

PostgreSQL. O schema está em `db/schema.sql` e também é garantido em tempo de
execução por `lib/db.ts` (`CREATE TABLE IF NOT EXISTS`, idempotente). Datas em
`TIMESTAMPTZ`; consultas de "hoje/janelas" usam o fuso `America/Sao_Paulo`.

### `usuarios` — equipe do sistema
| Campo | Tipo | Notas |
|---|---|---|
| id | BIGSERIAL PK | |
| nome | TEXT | |
| email | TEXT UNIQUE | é o **login** e o slug do link de captação |
| senha_hash | TEXT | scrypt no formato `salt:hash` |
| perfil | TEXT | ADMIN / MARKETING / COORDENACAO / CANDIDATO / LIDER |
| ativo | INTEGER | 1 ativo, 0 inativo (inativo não loga) |
| criado_em | TIMESTAMPTZ | |

### `pessoas` — eleitores / lideranças / contatos
| Campo | Tipo | Notas |
|---|---|---|
| id | BIGSERIAL PK | |
| nome | TEXT | |
| categoria | TEXT | ex.: "Liderança", "Religião"… (grupos) |
| funcao, partido, bairro, instagram, observacao | TEXT | |
| cidade | TEXT | casada com a base IBGE de SP |
| regiao | TEXT | inferida pela cidade |
| whatsapp, email | TEXT | |
| lat, lng | DOUBLE PRECISION | coordenadas da cidade |
| criado_por | TEXT | id do usuário que cadastrou (string) |
| criado_em | TIMESTAMPTZ | |

### `agentes` — 1 por candidato (WhatsApp + IA)
| Campo | Tipo | Notas |
|---|---|---|
| id | BIGSERIAL PK | |
| candidato | TEXT | nome do candidato |
| instancia | TEXT | nome da instância na Evolution API |
| telefone | TEXT | |
| persona | TEXT | system prompt do agente (Claude) |
| ativo | INTEGER | 1 = responde automaticamente |
| criado_em | TIMESTAMPTZ | |

### `mensagens` — log e métricas do WhatsApp
| Campo | Tipo | Notas |
|---|---|---|
| id | BIGSERIAL PK | |
| agente_id | BIGINT → agentes(id) | ON DELETE SET NULL |
| contato | TEXT | número do eleitor |
| contato_nome | TEXT | pushName |
| direcao | TEXT | `in` (recebida), `out` (enviada), `erro` |
| texto | TEXT | |
| criado_em | TIMESTAMPTZ | |

### `demandas` — pedidos dos eleitores / tarefas
| Campo | Tipo | Notas |
|---|---|---|
| id | BIGSERIAL PK | |
| titulo | TEXT | obrigatório |
| descricao, categoria | TEXT | |
| status | TEXT | Aberta / Em andamento / Concluída / Cancelada |
| prioridade | TEXT | Baixa / Média / Alta |
| eleitor_id | BIGINT → pessoas(id) | quem pediu (SET NULL) |
| responsavel_id | BIGINT → usuarios(id) | quem cuida (SET NULL) |
| cidade, bairro | TEXT | |
| prazo | DATE | |
| criado_por | TEXT | id do usuário que registrou |
| criado_em, atualizado_em | TIMESTAMPTZ | |

### `config` — chave-valor (integrações)
| chave | valor |
|---|---|
| EVOLUTION_URL | URL da Evolution API |
| EVOLUTION_APIKEY | chave da Evolution |
| ANTHROPIC_API_KEY | chave da Claude |
| GOOGLE_CALENDAR_SRC | ID/link do Google Calendar |

> Valores de `config` têm **fallback** para variáveis de ambiente de mesmo nome.

### Primeiro acesso
O sistema não cria dados de exemplo nem tem senha padrão:
- **usuarios**: se a tabela estiver vazia **e** `ADMIN_EMAIL` + `ADMIN_SENHA`
  estiverem definidos no ambiente, cria o admin inicial com esses dados. Sem
  as variáveis, nenhum usuário é criado.
- **agentes**: nenhum é criado automaticamente; o admin cadastra os candidatos
  na tela de agentes.

---

## 5. Autenticação, perfis e permissões

- **Senha:** hash com `scrypt` (`lib/senha.ts`), formato `salt:hash`, comparação
  em tempo constante.
- **Sessão:** cookie `sessao` assinado por **HMAC-SHA256** (`lib/auth.ts`),
  contendo `{ uid, nome, perfil }`. Validade 30 dias. O cookie **não** guarda a
  senha — trocar a senha não invalida a sessão.
- **Middleware** (`middleware.ts`): exige a presença do cookie para qualquer rota
  que não seja pública. Rotas públicas: `/login`, `/api/auth/login`, `/form`,
  `/api/form`, `/api/whatsapp`. A verificação criptográfica acontece no servidor
  (layout e rotas chamam `getSessao()`).

### Perfis e o que cada um acessa
| Perfil | Acesso |
|---|---|
| **ADMIN** | Tudo (inclui Usuários e Configurações) |
| **MARKETING** | Dashboard, Cadastros, Mapas, Tarefas |
| **COORDENACAO** | Dashboard, Cadastros, Mapas, WhatsApp, Tarefas |
| **CANDIDATO** | Dashboard, Mapas, Agenda |
| **LIDER** | Dashboard, Cadastros, Mapas, Agenda — **só os próprios dados** |

> **Isolamento do Líder:** todo cadastro guarda `criado_por = id do líder`. Nas
> telas (Dashboard, Pessoas, Mapas) o LIDER vê apenas o que ele cadastrou.

---

## 6. Navegação

Fonte única: `app/components/navItens.ts`. Início + 4 áreas; cada item pode ter
**abas** (telas irmãs). As permissões de cada aba espelham o `redirect` da
`page.tsx`: ninguém vê link que dá acesso negado.

| Área | Item | Abas (rotas) |
|---|---|---|
| Início | Início | `/` |
| Base | Contatos | `/pessoas` (e `/cadastro`) |
| Base | Mapas | `/mapa` · `/mapa/liderancas` |
| Base | Comunidades · Matriz política · Funil | `/comunidades` · `/matriz` · `/funil` |
| WhatsApp | Conversas | `/atendimento` (fila da equipe) · `/inbox` (por número) |
| WhatsApp | Disparos | `/disparos` · `/campanhas` · `/disparos/planejamento` |
| WhatsApp | Agentes de IA | `/agentes` · `/meu-agente` (candidato) |
| WhatsApp | Modelos e listas | `/templates` · `/listas` |
| Gabinete | Pautas · Tarefas · Assessoria · Agenda | `/pautas` · `/tarefas` · `/assessoria` · `/agenda` |
| Ajustes (rodapé) | Configurar gabinete · Tecnologia · Configurações · Minha conta | `/primeiros-passos` · `/tecnologia` · `/configuracoes` · `/conta` |

- **Desktop:** menu lateral agrupado (recolhível), barra superior com a trilha
  "Área › Item", selo de contagem até a votação e o sino. As abas da área
  aparecem no topo do conteúdo.
- **Celular:** barra fixa com até 5 abas (Início, Base, WhatsApp, Gabinete,
  Mais). Cada área abre um painel com as telas dela.
- **Busca global:** `Ctrl K` (ou `/`) acha telas, ações e contatos.
- **Selos do menu:** fila do Atendimento, pautas novas e tarefas vencendo
  (`/api/contadores`, a cada 30 s).

---

## 7. Telas (detalhado)

### 7.1 Login (`/login`) — público
Layout split profissional: painel de marca à esquerda (logo, tagline, destaques)
e formulário à direita (usuário/e-mail + senha com mostrar/ocultar). Responsivo.
Envia para `POST /api/auth/login`; em sucesso redireciona ao Dashboard.

### 7.2 Início (`/`) — todos (atendente vai direto ao Atendimento)
Atualiza sozinho a cada 15 s (`/api/dashboard`):
1. **Precisa de você agora** (`lib/pendencias.ts`): conversas na fila,
   números parados, tarefas atrasadas ou vencendo hoje e pautas sem triagem.
   Cada item leva à tela certa (ex.: "Abrir fila" abre `/atendimento?view=fila`).
2. **Indicadores:** contatos na base (com variação de 7 dias e minigráfico),
   números de WhatsApp respondendo, mensagens de hoje e 1ª resposta média.
3. **Contatos acumulados** até a votação, **novos cadastros** (Hoje / 7 / 15 /
   30 dias) com quem mais cadastra, **metas** e **visão por candidato**.

O LIDER vê só os próprios números. Líder também recebe um card com seu **link de
captação**.

### 7.3 Cadastrar pessoa (`/cadastro`) — item da sidebar para ADMIN, Marketing, Coordenação e Líder
Formulário que coleta nome, categoria, cidade, bairro, whatsapp, e-mail, etc.
A cidade é casada com a base IBGE de SP → coordenadas automáticas e região
inferida. Envia para `POST /api/pessoas` (vincula `criado_por` à sessão).

### 7.4 Contatos (`/pessoas`) — ADMIN, Marketing, Coordenação, Candidato e Líder
Tabela (lista compacta no celular) com busca e filtros de categoria, cidade e
candidato na URL. Clique na linha abre o painel de detalhes (abrir conversa,
editar, excluir com confirmação). Seleção em massa: **adicionar à lista**
(`POST /api/listas/membros`) e **exportar CSV** dos selecionados. O menu
"Planilha" exporta com os filtros atuais, importa CSV e busca fotos do
WhatsApp. O LIDER vê apenas os próprios cadastros.

### 7.5 Formulário público de captação (`/form/[slug]`) — público
`slug` = e-mail/usuário de um líder. Quem preenche **não precisa de login**; o
eleitor entra com `criado_por = id do líder` (isolamento automático). Usado nos
links que o líder compartilha. Cada usuário tem o seu (mostrado no Dashboard do
líder e na tela de Usuários).

### 7.6 Mapas (`/mapa` e `/mapa/liderancas`) — todos
Duas telas com **abas** no topo:

**Mapa de Votos** (`/mapa`):
- Mapa Leaflet com densidade de **cadastros** por cidade (cor + tamanho).
- **Filtro por cidade** (escopa o painel e destaca a cidade no mapa).
- Painel: Total de cadastros, Cidades, Lideranças, **Total de demandas**,
  **Pessoas por grupo** (categoria), **Top cidades** e **Projeção de votos**
  (`cadastros × fator`, com o fator definido por você).

**Mapa de Lideranças** (`/mapa/liderancas`):
- Mapa com as **lideranças** (pessoas categoria "Liderança") por cidade.
- **Ranking de captação** por líder (total de cadastros + cidades alcançadas).
- Resumo: lideranças cadastradas, líderes ativos, cidades com liderança.

### 7.7 WhatsApp · Agentes de IA (`/agentes`) — ADMIN, COORDENACAO
Um card por candidato (6 agentes). Para cada um: instância, telefone, persona,
liga/desliga (responder automático) e métricas (mensagens totais, recebidas
hoje). Mostra a **URL do webhook** para colar na Evolution. Funciona em "modo
pendente" até as chaves (Evolution + Claude) estarem configuradas.

### 7.8 Agenda (`/agenda`) — todos
Espelha o **Google Calendar em tempo real** via iframe (só leitura). A fonte é
configurável em **Configurações** (campo *Google Calendar*) — aceita o **ID do
calendário** (monta o embed com fuso de SP) ou um link completo. Se não
configurado, mostra instruções. Para todos verem, o calendário deve ser público.

### 7.9 Tarefas · Demandas (`/tarefas`) — ADMIN, MARKETING, COORDENACAO
Gestão de demandas dos eleitores:
- **KPIs por status** (Total, Aberta, Em andamento, Concluída, Cancelada).
- **Busca** (título/descrição) e **filtro por status**.
- **Criar** demanda (título, categoria, prioridade, status, responsável,
  eleitor vinculado, cidade, bairro, prazo, descrição).
- **Trocar status inline** na tabela e **excluir**.

### 7.10 Usuários (`/usuarios`) — ADMIN
Gestão da equipe:
- **Criar** usuário (nome, e-mail/login, senha, perfil).
- **Editar** (nome, e-mail, perfil) inline.
- **Ativar/Desativar**, **Redefinir senha**, **Excluir**.
- **Link de captação** por usuário (copiável).
- **Proteções:** não dá para desativar/excluir a si mesmo nem o último admin
  ativo; e-mail é único; senha mínima de 6 caracteres.

### 7.11 Configurações (`/configuracoes`) — ADMIN
Grava as chaves de integração na tabela `config` (nunca exibe os valores de
volta): Evolution (URL + apikey), Claude (Anthropic) e Google Calendar. Cada
campo tem um selo "configurado/pendente".

### 7.12 Minha conta (`/conta`) — todos
Troca a **própria** senha (senha atual + nova + confirmação; mínimo 6
caracteres).

---

## 8. Integrações

### WhatsApp (Evolution API) + IA (Claude)
Fluxo do **webhook** (`POST /api/whatsapp/webhook`, público):
1. A Evolution envia o evento `messages.upsert`.
2. O sistema localiza o **agente** pela `instancia`.
3. Registra a mensagem recebida (`direcao = 'in'`).
4. Se o agente estiver **ativo**, gera a resposta com a **Claude**
   (`lib/ia.ts`: system = persona do candidato + histórico das últimas 12
   mensagens) e **envia** pela Evolution (`lib/evolution.ts`), registrando a
   saída (`direcao = 'out'`).

> Requer `EVOLUTION_URL`, `EVOLUTION_APIKEY` e `ANTHROPIC_API_KEY` configurados.

### Google Calendar
Embed (iframe) do calendário configurado em `GOOGLE_CALENDAR_SRC`. Atualiza em
tempo real; é só espelhamento (leitura).

---

## 9. Variáveis de ambiente

Definidas em `.env.local` (local) e nas *Environment Variables* da Vercel
(produção). **Nunca** versionadas. Veja `.env.example`.

| Variável | Uso |
|---|---|
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Conexão Postgres (obrigatórias) |
| `PGSSL` | `true` se o Postgres exigir SSL (opcional) |
| `EVOLUTION_URL`, `EVOLUTION_APIKEY` | Evolution API (ou configure na tela) |
| `ANTHROPIC_API_KEY` | Claude (ou configure na tela) |
| `GOOGLE_CALENDAR_SRC` | Google Calendar (ou configure na tela) |
| `AUTH_SECRET` | Segredo do HMAC da sessão (recomendado em produção) |

---

## 10. Referência de API

Todas em `force-dynamic`. Salvo indicação, exigem sessão.

| Rota | Métodos | Descrição |
|---|---|---|
| `/api/auth/login` | POST | Login (público). Body `{email, senha}` |
| `/api/auth/logout` | POST | Encerra a sessão |
| `/api/dashboard` | GET | Indicadores do Dashboard (escopo do LIDER) |
| `/api/pessoas` | GET, POST | Lista / cria cadastro |
| `/api/form/[slug]` | POST | Cadastro público vinculado ao líder (público) |
| `/api/mapa` | GET | Agregados do Mapa de Votos (`?cidade=` filtra) |
| `/api/lideranca` | GET | Dados do Mapa de Lideranças |
| `/api/demandas` | GET, POST, PATCH, DELETE | CRUD de demandas (`?status=`, `?q=`) |
| `/api/usuarios` | GET, POST, PATCH, DELETE | Gestão de usuários (ADMIN) |
| `/api/conta/senha` | POST | Troca a própria senha |
| `/api/agentes` | GET, POST | Lista/atualiza agentes (ADMIN, COORDENACAO) |
| `/api/config` | GET, POST | Status/grava integrações (ADMIN) |
| `/api/whatsapp/webhook` | GET, POST | Webhook da Evolution (público) |
| `/api/contadores` | GET | Selos do menu: fila, pautas novas, tarefas vencendo |
| `/api/busca` | GET | Busca global de contatos (`?q=`), no escopo da sessão |
| `/api/listas/membros` | POST | Adiciona contatos selecionados a uma lista `{lista_id, pessoa_ids}` |

---

## 11. Scripts utilitários (`scripts/`)

Leem as credenciais do `.env.local` (não contêm segredos):

- **`migrate.mjs`** — aplica um arquivo `.sql`. Uso:
  `node scripts/migrate.mjs db/schema.sql`
- **`sql.mjs`** — executa um SQL avulso. Uso:
  `node scripts/sql.mjs "SELECT COUNT(*) FROM pessoas"`
- **`dbcheck.mjs`** — testa a conexão e lista as tabelas. Uso:
  `node scripts/dbcheck.mjs`

---

## 12. Como rodar e implantar

### Local
```bash
npm install
# crie .env.local a partir de .env.example e preencha as variáveis PG*
npm run dev          # http://localhost:3000
```
O schema e o seed são criados automaticamente no primeiro acesso ao banco.
(Opcional: `node scripts/migrate.mjs db/schema.sql` para criar o schema antes.)

### Produção (Vercel)
1. Conecte o repositório à Vercel.
2. Configure as *Environment Variables*: `PGHOST`, `PGPORT`, `PGUSER`,
   `PGPASSWORD`, `PGDATABASE` (e `AUTH_SECRET`).
3. Cada push na `main` dispara um deploy.

---

## 13. Segurança

- **Segredos** ficam apenas no `.env.local` (gitignored) e nas env vars da
  Vercel — **nunca** commitados. Há `.env.example` como referência.
- Senhas com **scrypt**; sessão com **HMAC**.
- Integrações guardadas em `config` e **nunca** exibidas de volta na tela.
- Proteções na gestão de usuários (sem auto-exclusão / sem remover o último
  admin).
- **Pendência recomendada:** definir `AUTH_SECRET` próprio em produção e revisar
  permissões de visibilidade do Google Calendar.

---

## 14. Estado atual e roadmap

**Entregue:** Login, Dashboard, Cadastros, Formulário público, Mapa de Votos,
Mapa de Lideranças, WhatsApp/Agentes de IA, Agenda (Google Calendar),
Tarefas/Demandas, Usuários, Configurações, Alterar senha. Migração completa para
Postgres/Supabase.

**Roadmap (Fase 2):**
- Campanhas de WhatsApp em massa (disparo para listas).
- Tipos de formulário de captação.
- Evolução da Agenda: um calendário por candidato (hoje é um só, global).

---

*Documento gerado em 2026-06-15.*

---

## 15. Design (tokens e estilos)

O visual vive em `app/styles/`, importado nesta ordem em `app/layout.tsx`:

| Arquivo | O que tem |
|---|---|
| `tokens.css` | Única fonte de cor, tipo, espaço, raio, sombra e medidas da casca |
| `base.css` | Reset, campos de formulário, foco visível, utilitários |
| `components.css` | Cabeçalho de página, botões, abas, chips, selos, cartões, tabelas, avisos, janelas |
| `shell.css` | Menu lateral, barra superior, barra do celular, painéis, busca, notificações |
| `telas.css` | Início, Contatos, Cadastro, Conversas, Mapa, Agentes, Tarefas, Disparos |
| `modulos.css` | Funil, Comunidades, Planejamento, Assessoria, Financeiro, Matriz, Pautas, Agenda |
| `publico.css` | Login, carregamento, formulários públicos, boas-vindas e tour |

Regras:
- **Cor só por token** (`var(--accent)`, `var(--red)`…). Todos os pares de
  texto/fundo passam de 4,5:1. Texto sobre dourado usa `var(--ink)`.
  Exceções de propósito: o botão do Google (cores da marca Google) e a
  página pública de pauta, que usa a cor do candidato, não a do CAND PRO.
- **Fontes:** IBM Plex Sans (interface), Montserrat (marca, títulos e números
  grandes), IBM Plex Mono (telefones e números alinhados).
- **Escala de tipo:** 12 · 13 · 14 · 16 · 20 · 28 · 40 px (`--fs-1` a `--fs-7`).
  Só os textos dentro de gráficos SVG usam tamanho próprio (escalam com o desenho).
- **Espaço:** 4 · 8 · 12 · 16 · 24 · 32 · 48 (`--s-1` a `--s-7`).
  **Raio:** 6 · 10 · 16 · pílula.
- **Quebras:** 1280 px (grades largas), 1024 px (casca de celular) e 640 px
  (telas de celular). Nenhuma outra.
- **Sem `!important`**, exceto o bloco de "reduzir movimento" em `base.css`.
- **Zoom liberado** no celular (acessibilidade).
- **Cidade base do candidato:** configurada em Agentes → Ajustes; aparece
  destacada no Mapa de votos para quem vê aquele candidato.
