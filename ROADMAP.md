# Roadmap — CAND PRO

Plano completo dos próximos passos. Para cada item você encontra **por que**
fazer (o valor), **como** fazer (abordagem técnica no nosso stack), o **esforço**
estimado e as **dependências**. A ideia é ir do "colocar pra rodar de verdade"
até "escalar e profissionalizar".

> Stack atual: Next.js 14 + Postgres/Supabase + Evolution (WhatsApp) + Claude
> (IA) + Google Calendar, hospedado na Vercel.

---

## Como ler este roadmap

- **Esforço:** 🟢 baixo (horas) · 🟡 médio (1–2 dias) · 🔴 alto (vários dias).
- **Prioridade:** ⭐ alta · ◾ média · ▫ quando der.
- **Quem faz:** 🙋 você (Gabriel, configuração/decisão) · 👨‍💻 eu (desenvolvimento).

### Princípios que guiam o plano
1. **Primeiro operar, depois enfeitar.** O sistema está pronto, mas só vira valor
   quando estiver com dados reais e integrações ligadas.
2. **Confiança antes de escala.** Backup, auditoria e segurança vêm antes de
   features avançadas — equipe grande mexendo em dados reais exige rede de
   proteção.
3. **Dados que viram decisão.** Relatórios e metas transformam o cadastro em
   estratégia de campanha.
4. **Nada inventado.** Toda métrica/projeção é transparente e parametrizável.

---

## Estado atual (o que já existe)

✅ Login profissional · Dashboard em tempo real · Cadastro + listagem +
Importar/Exportar CSV · Formulário público por líder · Mapa de Votos (filtro,
grupos, demandas, projeção) · Mapa de Lideranças · WhatsApp com IA (Agentes) ·
Conversas (Inbox) · Campanhas em massa · Tarefas/Demandas · Usuários (CRUD +
proteções) · Agenda (Google Calendar) · Alterar senha · Banco no Supabase com
persistência · Deploy na Vercel.

**O que falta para "estar no ar de verdade":** ligar as integrações e colocar
dados reais (Fase 0).

---

# FASE 0 — Colocar em produção de verdade ⭐

> Objetivo: sair do "construído" para o "operando". Sem isso, o resto não importa.

### 0.1 Segurança mínima de sessão — `AUTH_SECRET` 🟢 ⭐ 🙋
- **Por quê:** hoje a assinatura do cookie de sessão usa um segredo padrão. Em
  produção isso permitiria, em tese, forjar sessões. É o item de segurança mais
  barato e mais importante.
- **Como:** gerar uma string aleatória longa (32+ caracteres) e adicionar nas
  *Environment Variables* da Vercel como `AUTH_SECRET`; depois *Redeploy*. O
  código já usa `process.env.AUTH_SECRET` automaticamente.

### 0.2 Ligar o WhatsApp + IA 🟡 ⭐ 🙋
- **Por quê:** é o coração do atendimento. Sem isso, Agentes/Inbox/Campanhas só
  registram, não enviam.
- **Como:** em **Configurações**, preencher `EVOLUTION_URL`, `EVOLUTION_APIKEY`
  e `ANTHROPIC_API_KEY`. Em **WhatsApp → Agentes**, configurar a instância de
  cada candidato e ligar. Colar a URL do webhook na Evolution
  (`/api/whatsapp/webhook`, evento `messages.upsert`).

### 0.3 Ligar a Agenda 🟢 ⭐ 🙋
- **Por quê:** dá visão da agenda da campanha em tempo real.
- **Como:** copiar o **ID do calendário** no Google Calendar e colar em
  Configurações. Deixar o calendário público (ou compartilhado) para a equipe ver.

### 0.4 Cadastrar a equipe e os primeiros dados 🟢 ⭐ 🙋
- **Por quê:** o sistema só "ganha vida" com usuários e cadastros reais; os
  indicadores e mapas passam a fazer sentido.
- **Como:** criar usuários em **Usuários** (com perfis), repassar logins,
  compartilhar os links de captação dos líderes, e começar os cadastros
  (manuais, via formulário público ou **importando CSV**).

### 0.5 Domínio próprio 🟢 ◾ 🙋
- **Por quê:** profissionaliza (`app.suacampanha.com.br` em vez de
  `…vercel.app`), passa confiança e facilita compartilhar.
- **Como:** comprar o domínio e apontar na Vercel (Settings → Domains). A Vercel
  emite o certificado HTTPS automaticamente.

### 0.6 Backup do banco 🟢 ⭐ 🙋👨‍💻
- **Por quê:** com dados reais entrando, perder a base seria catastrófico.
- **Como:** habilitar o **backup automático no painel do Supabase**; como reforço,
  posso criar um script de export periódico (cron) que salva um dump em local
  seguro.

---

# FASE 1 — Robustez, confiança e segurança ◾

> Objetivo: usar com a equipe inteira sem sustos. "Rede de proteção".

### 1.1 Auditoria de ações 🟡 ⭐ 👨‍💻
- **Por quê:** com vários perfis editando/excluindo dados, é essencial saber
  **quem fez o quê e quando** (resolver disputas, detectar erro/abuso).
- **Como:** criar uma tabela `auditoria` (usuario_id, acao, entidade, entidade_id,
  detalhe, criado_em) e gravar nas rotas sensíveis (criar/editar/excluir pessoas,
  usuários, demandas, disparos). Tela só-leitura para ADMIN com filtros.

### 1.2 Proteção no login 🟡 ◾ 👨‍💻
- **Por quê:** evitar tentativa de força bruta e acesso indevido.
- **Como:** **rate limiting** por IP/usuário no `/api/auth/login` (contador em
  memória/banco) e bloqueio temporário após N falhas. Opcional: **2FA** por
  e-mail/app para perfis ADMIN.

### 1.3 Observabilidade / tratamento de erros 🟡 ◾ 👨‍💻
- **Por quê:** quando algo falhar (Evolution fora, banco lento), precisamos
  enxergar e reagir, em vez de "tela branca".
- **Como:** padronizar respostas de erro nas APIs, adicionar páginas de erro
  amigáveis, e integrar um coletor de logs (ex.: Vercel Logs / Sentry) para
  receber alertas de exceções.

### 1.4 Pooler de conexões do Supabase 🟢 ◾ 🙋👨‍💻
- **Por quê:** no serverless (Vercel), muitas funções abrindo conexões podem
  **esgotar o limite** do Postgres sob pico de acesso.
- **Como:** trocar a string de conexão para a **porta de pooling (PgBouncer)** do
  Supabase. Mudança pequena de configuração; eu ajusto o cliente se precisar.

### 1.5 Performance e índices 🟢 ▫ 👨‍💻
- **Por quê:** conforme a base cresce (dezenas de milhares de cadastros), buscas
  e agregações precisam continuar rápidas.
- **Como:** revisar/expandir índices (já há vários), paginar listas grandes
  (Cadastros/Inbox) e cachear agregações pesadas do Dashboard se necessário.

---

# FASE 2 — Inteligência e gestão (extrair valor dos dados) ◾

> Objetivo: transformar cadastro em **estratégia**. É aqui que o sistema vira
> diferencial de campanha.

### 2.1 Relatórios e gráficos de evolução 🟡 ⭐ 👨‍💻
- **Por quê:** "quantos cadastros por dia/semana?", "qual região cresce mais?",
  "qual líder acelerou?". Hoje vemos totais; falta a **evolução no tempo** e
  comparativos — essencial para gerir a campanha.
- **Como:** uma tela **Relatórios** com gráficos (cadastros por dia/semana, por
  cidade, por líder; mensagens por candidato). Backend agrega com SQL
  (`GROUP BY` por data/cidade/usuário) e o front desenha com uma lib leve de
  charts. Inclui **filtro por período**.

### 2.2 Metas por líder (gamificação) 🟡 ⭐ 👨‍💻
- **Por quê:** engaja a base de líderes e dá foco — "faltam X para sua meta"
  motiva muito mais que um número solto. Captação é o ativo nº 1 da campanha.
- **Como:** campo de **meta** por usuário (ou por período) e um painel de
  **ranking com % atingido**, barras de progresso e destaque para os melhores.
  Reaproveita o ranking de captação que já existe.

### 2.3 Exportar relatórios em PDF 🟢 ◾ 👨‍💻
- **Por quê:** fechamento por período/região para enviar à coordenação/candidato
  num formato apresentável.
- **Como:** gerar PDF a partir dos relatórios (render server-side ou
  print-to-PDF do navegador com layout próprio).

### 2.4 Segmentação avançada (tags) 🟡 ◾ 👨‍💻
- **Por quê:** "categoria" é um campo só. Para campanhas e análises finas, é útil
  marcar pessoas com **várias etiquetas** (ex.: "apoiador", "voluntário",
  "indeciso", "evento X").
- **Como:** tabelas `tags` e `pessoa_tags` (N:N), seletor de tags no cadastro, e
  usar as tags como filtro em Campanhas/Mapas/Relatórios.

---

# FASE 3 — Escalar atendimento e captação ◾

> Objetivo: aguentar volume e fechar o ciclo de relacionamento.

### 3.1 Disparo em massa robusto (fila / n8n) 🔴 ⭐ 👨‍💻🙋
- **Por quê:** hoje a campanha envia **até 200 por disparo, de forma síncrona**
  (limite do serverless e risco de bloqueio do WhatsApp se enviar rápido demais).
  Para listas grandes, precisamos de **envio em fila, com ritmo controlado**.
- **Como:** duas opções — (a) integrar com **n8n** (que você já usa): o sistema
  monta a lista e entrega para um fluxo n8n disparar com *delay* entre mensagens;
  (b) uma **fila própria** (tabela de "envios pendentes" + um worker/cron que
  processa aos poucos). Recomendo começar pelo **n8n** pela rapidez e controle.
- **Risco:** envio em massa sem ritmo pode **bloquear o número** no WhatsApp —
  por isso o controle de cadência é parte essencial.

### 3.2 Inbox em tempo real 🟡 ⭐ 👨‍💻
- **Por quê:** hoje a caixa de entrada carrega ao abrir; para atendimento de
  verdade, novas mensagens devem aparecer **sozinhas** e avisar quando chega algo.
- **Como:** *polling* periódico (simples) ou *streaming* (SSE); indicador de
  **não-lidas** por conversa (campo de "lido"/timestamp) e contador no menu.

### 3.3 Tipos de formulário de captação 🟡 ◾ 👨‍💻🙋
- **Por quê:** o spec previa **vários formulários** (por objetivo/evento), com
  campos diferentes — não só o padrão.
- **Como:** modelo de "formulário" configurável (campos, título, agradecimento)
  e o `/form/[slug]` renderizando conforme o tipo. Permite landing pages
  específicas por ação.

### 3.4 Aniversariantes e automações de relacionamento 🟡 ▫ 👨‍💻
- **Por quê:** relacionamento contínuo (mensagem de aniversário, follow-up)
  aumenta engajamento e fidelidade do eleitor.
- **Como:** adicionar **data de nascimento** ao cadastro e um **cron** diário que
  monta a lista do dia e dispara (via a fila/n8n da 3.1).

### 3.5 Mapa por endereço/bairro (geocoding) 🔴 ▫ 👨‍💻🙋
- **Por quê:** hoje o mapa é por **cidade**. Para campanhas municipais, ver por
  **bairro/rua** é muito mais acionável.
- **Como:** geocodificar endereço/bairro (serviço externo — Google/Nominatim) ao
  cadastrar, guardar lat/lng precisos e desenhar com mais granularidade
  (inclusive camada de calor). Requer chave de geocoding e atenção a custo.

---

# FASE 4 — Integrações e expansão ▫

### 4.1 n8n bidirecional 🟡 ◾ 👨‍💻🙋
- **Por quê:** automatizar entrada e saída (novos cadastros disparando fluxos,
  fluxos criando demandas, etc.). Combina com o que você já domina.
- **Como:** webhooks de entrada (n8n → sistema) e de saída (sistema → n8n) com
  chave de segurança.

### 4.2 Outras fontes de captação 🟡 ▫ 👨‍💻🙋
- **Por quê:** captar por Instagram, landing pages e QR codes, tudo caindo na
  mesma base com atribuição ao líder/canal.
- **Como:** endpoints/forms específicos por canal, reaproveitando o fluxo de
  captação público que já existe.

### 4.3 Multi-campanha / multi-candidato isolado 🔴 ▫ 👨‍💻
- **Por quê:** se quiser usar o sistema para **várias campanhas** ao mesmo tempo,
  com dados separados.
- **Como:** introduzir o conceito de "organização/campanha" e isolar os dados por
  ela (multi-tenant). É uma mudança estrutural — só vale se houver esse objetivo.

---

## Priorização recomendada (resumo)

| Ordem | Item | Fase | Esforço | Quem |
|---|---|---|---|---|
| 1 | `AUTH_SECRET` + ligar Evolution/Claude/Calendar | 0 | 🟢🟡 | 🙋 |
| 2 | Cadastrar equipe + dados + backup | 0 | 🟢 | 🙋 |
| 3 | Domínio próprio | 0 | 🟢 | 🙋 |
| 4 | Relatórios/gráficos de evolução | 2 | 🟡 | 👨‍💻 |
| 5 | Metas por líder | 2 | 🟡 | 👨‍💻 |
| 6 | Auditoria de ações | 1 | 🟡 | 👨‍💻 |
| 7 | Disparo em massa via fila/n8n | 3 | 🔴 | 👨‍💻🙋 |
| 8 | Inbox em tempo real | 3 | 🟡 | 👨‍💻 |
| 9 | Pooler + proteção no login | 1 | 🟢🟡 | 👨‍💻 |
| 10 | Segmentação por tags · formulários · automações | 2–3 | 🟡 | 👨‍💻 |

**Sugestão de execução:** você toca a **Fase 0** (configurações — sem código) em
paralelo enquanto eu avanço pela **Fase 2** (Relatórios + Metas), que entrega
muito valor visível. Depois fechamos a **Fase 1** (confiança) e partimos para a
**Fase 3** (escala).

---

## Riscos e atenção

- **Bloqueio do WhatsApp:** disparo em massa sem cadência controlada pode derrubar
  o número. Tratar na Fase 3.1 (fila com *delay*).
- **Custos externos:** geocoding (3.5) e volume da Claude têm custo por uso —
  avaliar antes de ligar em escala.
- **Privacidade/LGPD:** a base tem dados pessoais de eleitores. Recomenda-se
  política de acesso clara, retenção e (futuramente) consentimento na captação.
- **Dependência de serviços:** Evolution e Supabase são externos — backup e
  monitoramento reduzem o risco de indisponibilidade.

---

*Documento vivo — atualizado em 2026-06-15. Detalhes técnicos do que já existe em
`DOCUMENTACAO.md`; checklist operacional em `O-QUE-FAZER.md`.*
