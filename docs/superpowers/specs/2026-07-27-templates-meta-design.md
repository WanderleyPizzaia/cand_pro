# Design — Sistema de Templates da Meta (WhatsApp Cloud API)

**Data:** 2026-07-27
**Status:** Aprovado para planejamento
**Autor:** Gabriel + Claude

## Objetivo

Permitir que o usuário **crie templates de mensagem**, **submeta para aprovação
da Meta** (categoria Marketing ou Utilidade) e **defina variáveis rotuladas**
(nome, número, cidade etc.) ligadas aos campos do cadastro de eleitores — tudo
por uma tela própria, sem sair do sistema.

## Escopo

### Nesta etapa (etapa 1)
- Nova tela `/templates` com seleção de agente (WABA/token), listagem com status
  ao vivo e formulário de criação.
- Construtor de template com **cabeçalho** (texto/imagem), **corpo** (com
  variáveis rotuladas), **rodapé** e **botões** (URL / resposta rápida).
- Variáveis **rotuladas + mapeadas** a campos do cadastro (`pessoas`), com
  exemplo obrigatório para aprovação da Meta.
- Submissão para a Meta (`POST /{waba_id}/message_templates`), sincronização de
  status (PENDENTE → APROVADO/REJEITADO) e exclusão.
- Envio de **teste manual** de um template aprovado para um número.

### Fora de escopo (etapa 2)
- Auto-preenchimento das variáveis a partir do cadastro **no disparo de
  campanha** em massa. (O modelo de dados já guarda o mapeamento para viabilizar
  isso depois.)

## Contexto do código existente

`lib/meta.ts` já implementa, para o provedor `meta` (por agente):
- `enviarTemplateMeta(phoneId, token, numero, template, idioma, variaveis[])` — envio de template aprovado.
- `listarTemplatesMeta(wabaId, token)` — lista templates da WABA com `status` e `corpo`.
- `validarNumeroMeta`, parse de webhook, envio de texto.

Credenciais por agente (colunas em `agentes`): `meta_phone_id`, `meta_token`,
`meta_waba_id`, `provedor='meta'`.

Campos disponíveis para mapeamento (`pessoas`): `nome`, `whatsapp`, `email`,
`cidade`, `regiao`, `bairro`, `partido`, `funcao`, `categoria`, `instagram`.

Migrações seguem o padrão `ALTER TABLE ... ADD COLUMN/CREATE TABLE IF NOT EXISTS`
dentro de `ensureSchema()` em `lib/db.ts`. Acesso ADMIN igual ao de Configurações.

## Modelo de dados — nova tabela `templates`

Guardamos cópia local porque a Meta devolve só `{{1}}` (sem rótulo/mapeamento).

| Campo | Tipo | Uso |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `agente_id` | BIGINT FK agentes | dono / WABA / token |
| `nome` | TEXT | slug do template na Meta (ex.: `boas_vindas`), minúsculo/underscore |
| `categoria` | TEXT | `MARKETING` \| `UTILITY` |
| `idioma` | TEXT | `pt_BR` (default) |
| `componentes` | JSONB | header/body/footer/buttons exatamente como enviados à Meta |
| `variaveis` | JSONB | `[{ pos, rotulo, campo, exemplo }]` |
| `status` | TEXT | `PENDENTE` \| `APROVADO` \| `REJEITADO` (sincronizado) |
| `meta_id` | TEXT | id do template na Meta |
| `motivo_rejeicao` | TEXT | razão da recusa (quando `REJEITADO`) |
| `criado_por` | TEXT | usuário |
| `criado_em` | TIMESTAMPTZ | default now() |

`variaveis[].campo`: nome de coluna de `pessoas` ou `null` (preenchimento manual
na etapa 2). `variaveis[].exemplo`: valor de exemplo (obrigatório p/ Meta).

## Construtor (UI `/templates`)

Topo: seletor de **agente Meta** (só provedor `meta` com WABA/token). Abaixo:
lista de templates (nome, categoria, status colorido, motivo se rejeitado, ações)
e botão **Novo template**.

Formulário:
- **Nome** (slug) + **Categoria** (Marketing/Utilidade) + **Idioma** (pt_BR).
- **Cabeçalho** (opcional): Nenhum · Texto · Imagem (URL de exemplo).
- **Corpo** (obrigatório): textarea + botão **“+ Variável”** que insere `{{n}}`
  no cursor e cria uma linha com: **Rótulo**, **Campo do cadastro** (dropdown dos
  campos de `pessoas` ou “digitar manual”), **Exemplo** (obrigatório).
- **Rodapé** (opcional): texto curto.
- **Botões** (opcional, até 3): tipo URL ou Resposta rápida.
- **Prévia ao vivo** renderizando o texto com os exemplos aplicados.

Validações: corpo obrigatório; toda `{{n}}` no corpo precisa de linha
correspondente com exemplo; nome em formato slug; imagem exige URL.

## Backend — `app/api/templates/route.ts`

- **GET** `?agente=<id>`: lista do banco local do agente + faz **sync de status**
  chamando `listarTemplatesMeta(waba, token)` e casando por `nome`; atualiza
  `status`/`meta_id`/`motivo_rejeicao`.
- **POST**: valida, monta `components` da Graph API a partir de header/body/
  footer/buttons + `example` das variáveis, chama nova função
  `criarTemplateMeta(waba, token, payload)` (em `lib/meta.ts`) →
  `POST /{waba_id}/message_templates`; grava local como `PENDENTE` com `meta_id`.
- **DELETE** `?id=<id>`: remove na Meta (`DELETE /{waba_id}/message_templates?name=`)
  e localmente.
- **POST** `?teste=1`: envio de teste via `enviarTemplateMeta` para um número
  informado (usa os exemplos como variáveis).

Erros da Meta tratados e exibidos claros — em especial falta da permissão
`whatsapp_business_management` no token (mensagem orientando o usuário).

## Nova função em `lib/meta.ts`

`criarTemplateMeta(wabaId, token, { name, category, language, components })`:
`POST https://graph.facebook.com/{ver}/{wabaId}/message_templates`, retorna
`{ ok, metaId?, status?, erro? }`. Segue o padrão das funções existentes
(fetch + tratamento de `d.error.message`).

## Segurança / permissões
- Só ADMIN acessa a tela e as rotas de escrita (mesmo guard de Configurações).
- Token nunca vai ao cliente; toda chamada à Graph API é server-side.

## Critérios de sucesso
1. ADMIN cria um template com cabeçalho, corpo com 2 variáveis rotuladas, rodapé
   e 1 botão; ele aparece como PENDENTE.
2. Após aprovação na Meta, o GET sincroniza e mostra APROVADO.
3. Se rejeitado, mostra o motivo.
4. Envio de teste de um template aprovado chega no número informado.
5. Token sem `whatsapp_business_management` gera mensagem de erro clara.
