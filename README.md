# CAND PRO

CRM eleitoral + geomapeamento de votos + atendimento por IA no WhatsApp para
campanha em São Paulo.

Construído com **Next.js 14 + PostgreSQL + Leaflet**. Documentação completa em
[DOCUMENTACAO.md](DOCUMENTACAO.md).

## Como rodar

1. Copie `.env.example` para `.env.local` e preencha pelo menos `AUTH_SECRET`,
   as variáveis `PG*` do Postgres e, no primeiro uso, `ADMIN_EMAIL` e `ADMIN_SENHA`.
2. Instale e suba:

```bash
npm install          # instala as dependências (só na primeira vez)
npm run dev          # sobe o sistema
```

Depois abra **http://localhost:3000** no navegador.

## Acesso (login)

O sistema exige login e **não tem usuário nem senha padrão**. Num banco vazio,
o primeiro admin é criado com o `ADMIN_EMAIL` e a `ADMIN_SENHA` do `.env.local`.
Sem essas variáveis, nenhum usuário é criado. Os demais usuários são criados
pelo admin na tela **Usuários**.

| Perfil | O que vê |
|---------|----------|
| Administrador | Tudo + gestão de usuários e configurações |
| Marketing | Cadastros, mapa, dashboard |
| Coordenação | Cadastros, mapa, dashboard |
| Candidato | Dashboard, mapa e o próprio gabinete |
| Líder | Só os **próprios** cadastros + mapa |
| Atendente | Atendimento dos números vinculados |

## Telas

| Tela | URL | O que faz |
|------|-----|-----------|
| Dashboard | `/` | Indicadores (total de cadastros, lideranças, cidades, WhatsApps, hoje, 7 dias) |
| Cadastrar | `/cadastro` | Formulário "Cadastrar Pessoa" |
| Cadastros | `/pessoas` | Contatos cadastrados |
| Mapa de Votos | `/mapa` | Geomapeamento por cidade (densidade por cor e tamanho) + Top Cidades |

## Como funciona o mapa

Ao cadastrar, a **cidade** é casada com a base oficial das **645 cidades de SP**
(IBGE) e ganha coordenadas automaticamente. A **região** é inferida sozinha
quando deixada em "Auto". No mapa, cada cidade vira um círculo cujo tamanho/cor
reflete a quantidade de cadastros.

## Agentes de IA no WhatsApp

Cada candidato tem um **agente de IA** que responde no WhatsApp automaticamente.
Fluxo: a **Evolution API** envia as mensagens recebidas para o **webhook** do
sistema → o agente do candidato gera a resposta com a **Claude** → a resposta
volta pelo WhatsApp via Evolution. Tudo fica registrado (mensagens + métricas).

**Para ativar (em `Configurações`, perfil Admin):**
1. `URL da Evolution API` + `apikey` da sua instância Evolution
2. `Chave da API da Claude` (https://console.anthropic.com)

**Em `Agentes IA`:** crie o agente de cada candidato, informe o **nome da
instância** Evolution, o número, ajuste a **persona** e **ligue** o agente. Copie
a **URL do webhook** exibida na tela e configure-a na sua instância Evolution
(evento `messages.upsert`).

> Sem as chaves, os agentes ainda **registram** as mensagens, mas só
> **respondem** quando Evolution + Claude estiverem configuradas.

## Dados

Banco **PostgreSQL** configurado pelas variáveis `PG*`. As tabelas são criadas
automaticamente no primeiro acesso. O sistema começa sem nenhum dado.
