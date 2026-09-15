# n8n — Disparo em massa (Tarefa A)

Tira o disparo de campanhas do loop síncrono da plataforma (limite de 200, risco de
timeout/bloqueio) e delega ao n8n, que entrega **1 a 1 com intervalo** (cadência
anti-bloqueio) e devolve o status por contato via callback.

## Fluxo
1. Admin/Coordenação dispara a campanha em `/campanhas`.
2. Se `N8N_DISPARO_URL` estiver configurada (Configurações → Integrações), a plataforma
   cria a campanha com status `enfileirada` e faz **um POST** ao webhook do n8n com a
   lista completa (até 5000) já normalizada e personalizada.
3. O workflow do n8n faz o loop com `Wait` (padrão 5s), envia por **Meta** (template) ou
   **Evolution** (texto livre) conforme `agente.provedor`, e chama o `callback_url` a cada
   contato — e uma vez no fim com `concluido: true`.
4. A plataforma registra cada resultado em `mensagens (origem='campanha')` e atualiza os
   contadores `enviados/falhas/status` da campanha. A tela atualiza sozinha a cada 5s.

Sem `N8N_DISPARO_URL`, o comportamento antigo (envio síncrono, limite 200) continua valendo.

## Importar
1. n8n → **Workflows → Import from File** → `disparo-candpro.json`.
2. Abra o nó **Webhook Disparo**, copie a **Production URL** (ex.:
   `https://…/webhook/disparo-candpro`).
3. Na plataforma, em **Configurações → Integrações**:
   - `URL do disparo em massa (n8n)` = a URL do webhook.
   - `Token do n8n` = um valor aleatório longo (o mesmo é exigido no callback).
4. Ative o workflow no n8n.

## Payload enviado pela plataforma
```json
{
  "campanha_id": 123,
  "token": "…",
  "callback_url": "https://cand-pro.vercel.app/api/campanhas/callback",
  "evolution_url": "https://…evolution…",
  "evolution_apikey": "…",
  "agente": { "id": 7, "provedor": "meta|evolution", "meta_phone_id": "…",
              "meta_token": "…", "meta_waba_id": "…", "instancia": "…", "apikey": "…" },
  "template": "nome_template", "idioma": "pt_BR", "mensagem": "texto base",
  "destinatarios": [ { "numero": "5511…", "nome": "…", "primeiro_nome": "…",
                       "cidade": "…", "texto": "texto já personalizado" } ]
}
```

## Callback esperado pela plataforma (`POST /api/campanhas/callback`)
Header `X-Candpro-Token: <token>` (ou `token` no corpo). Lote ou item único:
```json
{ "campanha_id": 123, "concluido": false,
  "resultados": [ { "numero": "5511…", "nome": "…", "ok": true,
                    "wa_id": "wamid…", "texto": "…", "erro": null } ] }
```

---

# n8n — Agente IA pelo n8n (Tarefa B)

Roteia o **inbound** (mensagens recebidas) pelo n8n antes da IA responder. A geração
de IA e o log **permanecem na plataforma** (fonte única: `lib/responder.ts`); o n8n só
orquestra o timing (ex.: *debounce* para juntar uma rajada de mensagens do eleitor).

## Como liga/desliga
- Config **`N8N_AGENTE_URL`** (Configurações → Integrações → "URL do agente de IA no n8n").
- **Vazia (padrão): nada muda** — a IA responde direto pela plataforma (Meta/Evolution).
- Preenchida: os webhooks registram o inbound e **encaminham** ao n8n; o workflow chama
  de volta `POST /api/agente/responder` (protegido por `N8N_TOKEN`), que gera e envia a
  resposta humanizada (digitando + bolhas), no canal do agente.

## Degradação graciosa
Se o encaminhamento ao n8n falhar (n8n fora do ar), o webhook **responde inline** na hora
— a IA nunca fica muda por causa do n8n.

## Importar
1. Import from File → `agente-candpro.json`.
2. Copie a Production URL do **Webhook Inbound** → cole em `N8N_AGENTE_URL`.
3. Ajuste o **Debounce** (padrão 4s) conforme o comportamento desejado.
4. Ative o workflow. Teste com uma mensagem real antes de confiar no fluxo.

## Payload que a plataforma envia ao n8n
```json
{
  "token": "…",
  "responder_url": "https://cand-pro.vercel.app/api/agente/responder",
  "agente_id": 7, "canal": "meta|evolution",
  "numero": "5511…", "nome": "…", "wa_id": "wamid…", "texto": "mensagem do eleitor"
}
```

## Chamada de volta esperada (`POST /api/agente/responder`)
Header `X-Candpro-Token: <token>`. Corpo: `{ agente_id, numero, nome?, wa_id? }`.
A plataforma lê o histórico do banco (por número), gera a resposta e envia.

---

## Observações
- **Meta**: fora da janela de 24h exige **template aprovado** + **método de pagamento** na
  conta Meta (pendência do cliente). O nó de envio Meta usa `agente.meta_token`/`meta_phone_id`.
- **Cadência**: ajuste o nó **Aguardar (cadência)** (padrão 5s) conforme o volume/risco.
- O `ok` do callback é inferido da resposta do provedor (`messages`/`id`/`key`). Ajuste o
  mapeamento se quiser capturar o motivo exato da falha da Meta/Evolution.
- Este JSON é um ponto de partida testável; valide contra a versão do n8n em produção
  (nomes/typeVersion de nós podem variar).
