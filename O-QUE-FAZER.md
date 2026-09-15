# O que você precisa fazer — Checklist

Guia prático das ações que **dependem de você** (Gabriel) para deixar o sistema
100% operacional e seguir evoluindo. Marque conforme for concluindo.

> Produção: https://cand-pro.vercel.app
> Login atual: **Gabriel Marcelo** (`pereiragabriel08790@gmail.com`).

---

## 🔴 1. Essencial (faça primeiro)

- [ ] **Definir o `AUTH_SECRET` na Vercel.** Hoje a assinatura da sessão usa um
      segredo padrão. Gere um valor aleatório forte e adicione nas *Environment
      Variables* da Vercel com o nome `AUTH_SECRET` (depois, *Redeploy*).
      - Onde: Vercel → seu projeto → **Settings → Environment Variables**.
      - Dica para gerar: qualquer string longa e aleatória (32+ caracteres).

- [ ] **Conferir o login da equipe.** Só existe o seu admin hoje. Garanta que
      você consegue entrar com o **Gabriel Marcelo** e a senha que definiu.
      - Trocar senha quando quiser: **🔑 Alterar senha** (rodapé da sidebar).

- [ ] **Confirmar as variáveis do banco na Vercel** (já configuradas no deploy):
      `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.

---

## 🟢 2. Ativar o WhatsApp com IA

Para os agentes responderem eleitores automaticamente:

- [ ] **Configurar as chaves** em **Configurações** (sidebar, rodapé — só ADMIN):
  - [ ] **URL da Evolution API**
  - [ ] **Chave (apikey) da Evolution**
  - [ ] **Chave da API da Claude (Anthropic)** ← *esta ainda falta*
        - Pegue em https://console.anthropic.com → API Keys.

- [ ] **Configurar cada agente** em **WhatsApp** (`/agentes`):
  - [ ] Preencher **instância** (nome da instância na Evolution) e **telefone**.
  - [ ] Ajustar a **persona** (como o agente fala) se quiser.
  - [ ] **Ligar** o agente (botão liga/desliga) para ele responder.

- [ ] **Colar o webhook na Evolution.** Em cada instância da Evolution, configure
      o webhook para o evento `messages.upsert` apontando para:
      `https://cand-pro.vercel.app/api/whatsapp/webhook`
      (o link aparece pronto na tela de WhatsApp).

> Sem essas chaves o sistema só **registra** as mensagens; com tudo configurado e
> o agente **ligado**, ele responde com a Claude.

---

## 📅 3. Ativar a Agenda (Google Calendar)

- [ ] **Pegar o ID do calendário** no Google Calendar:
      Configurações ⚙ → selecione o calendário → **Integrar calendário** →
      copie o **ID do calendário** (ex.: `seuemail@gmail.com`).
- [ ] **Colar em Configurações** → campo **Google Calendar** → Salvar.
- [ ] **Deixar o calendário público** (se quiser que toda a equipe veja):
      no Google Calendar → calendário → **Permissões de acesso** →
      *Disponibilizar publicamente*. (Se ficar privado, só você verá, logado no
      Google.)
- [ ] Abrir **Agenda** e conferir se aparece.

---

## 👥 4. Cadastrar equipe e dados reais

- [ ] **Criar os usuários reais** da equipe em **Usuários** (`/usuarios`):
      nome, e-mail/login, senha e perfil (ADMIN, Marketing, Coordenação,
      Candidato ou Líder).
- [ ] **Repassar os logins** para cada pessoa (e orientar a trocar a senha em
      🔑 Alterar senha).
- [ ] **Compartilhar os links de captação** dos líderes (cada usuário tem o seu,
      copiável na tela de Usuários e no Dashboard do líder).
- [ ] **Começar os cadastros** de eleitores/lideranças (tela Cadastrar) — ou
      receber via os formulários públicos dos líderes.

---

## 🔒 5. Segurança e boas práticas

- [ ] Definir `AUTH_SECRET` (ver item 1).
- [ ] Usar **senhas fortes** para os admins.
- [ ] Manter as **credenciais do banco/integrações fora de prints e mensagens**
      (elas vivem só no `.env.local` e na Vercel).
- [ ] (Escala) Se o volume crescer muito, migrar a conexão do Postgres para o
      **pooler do Supabase** (evita esgotar conexões no serverless). Hoje está ok.

---

## 🤔 6. Decisões pendentes (me avise como prefere)

- [ ] **Projeção de votos** (no Mapa de Votos): hoje é `cadastros × fator`, com o
      fator definido por você na tela. Se tiver uma **regra própria** (ex.: votos
      por liderança), me diga que eu implemento.
- [ ] **Agenda por candidato?** Hoje a Agenda mostra **um** calendário. Se quiser
      **um calendário por candidato**, dá para evoluir.
- [ ] **Campanhas de WhatsApp em massa** (Fase 2): definir como serão as listas e
      os disparos (combina com seus fluxos de n8n).

---

## 🚀 7. Próximos desenvolvimentos (Fase 2 — comigo)

Não dependem de você além de decidir a prioridade:

- [ ] **Campanhas de WhatsApp em massa** — disparo para listas segmentadas.
- [ ] **Tipos de formulário** de captação (variações por objetivo).
- [ ] **Agenda por candidato** (evolução do item acima).
- [ ] Outras melhorias que você quiser priorizar.

---

## ✅ Já está pronto (não precisa fazer nada)

Login profissional · Dashboard com indicadores · Cadastro e listagem de pessoas ·
Formulário público por líder · Mapa de Votos (com filtro, grupos, demandas,
projeção) · Mapa de Lideranças · Tarefas/Demandas · Gestão de Usuários · Alterar
senha · Banco no Supabase (com persistência) · Deploy na Vercel.

---

*Atualizado em 2026-06-15. Detalhes técnicos completos em `DOCUMENTACAO.md`.*
