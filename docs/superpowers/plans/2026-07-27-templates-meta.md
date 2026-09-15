# Sistema de Templates da Meta — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o ADMIN crie templates de WhatsApp (cabeçalho + corpo + rodapé + botões, com variáveis rotuladas mapeadas aos campos do eleitor), submeta para aprovação da Meta (Marketing/Utility), sincronize o status e envie um teste manual.

**Architecture:** Nova tabela local `templates` (guarda rótulos/mapeamento das variáveis que a Meta não devolve). Funções server-side em `lib/meta.ts` falam com a Graph API. Uma rota `app/api/templates/route.ts` orquestra criar/listar+sincronizar/excluir/testar. Uma página `/templates` (server) monta um client component construtor. Só ADMIN.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Postgres (`pg`), WhatsApp Cloud API (graph.facebook.com).

## Global Constraints

- **Sem framework de teste no projeto.** A verificação de cada tarefa é `npx tsc --noEmit` (typecheck) + `npm run build` quando envolver React, e teste manual (curl/UI) onde indicado. Não introduzir Jest/Vitest.
- **Migrações idempotentes** via `CREATE TABLE/ALTER TABLE ... IF NOT EXISTS` dentro de `inicializar()` em `lib/db.ts` (padrão existente).
- **Guard ADMIN** em toda rota de escrita e na página, igual a `app/(app)/configuracoes/page.tsx` (`getSessao()` + `redirect("/")`/403).
- **Token nunca vai ao cliente.** Toda chamada à Graph API é server-side.
- **Idioma padrão** `pt_BR`. Versão da Graph API via `getConfig("META_API_VERSION") || "v21.0"` (já existe em `lib/meta.ts`).
- **Categorias aceitas:** `MARKETING`, `UTILITY`.
- Import alias do projeto: `@/lib/...`.

---

### Task 1: Tabela `templates` + tipo `Template`

**Files:**
- Modify: `lib/db.ts` (bloco DDL, função `inicializar()` ~linha 306, e tipos ~linha 161)

**Interfaces:**
- Produces: tipo `Template` exportado de `lib/db.ts`; tabela `templates` criada no boot.

```ts
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
  meta_id: string | null;
  motivo_rejeicao: string | null;
  criado_por: string | null;
  criado_em: string;
};
```

- [ ] **Step 1: Adicionar o tipo `Template` em `lib/db.ts`**

Logo após o bloco do tipo `Demanda` (~linha 161), inserir o `TemplateVar` e `Template` mostrados acima no bloco Interfaces.

- [ ] **Step 2: Criar a migração da tabela em `inicializar()`**

Em `lib/db.ts`, dentro de `inicializar()`, logo antes de `await semearUsuarios();`, adicionar:

```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (o tipo novo compila; nada mais foi alterado).

- [ ] **Step 4: Commit**

```bash
git add lib/db.ts
git commit -m "feat(templates): tabela templates + tipo Template"
```

---

### Task 2: Funções da Graph API em `lib/meta.ts`

**Files:**
- Modify: `lib/meta.ts` (adicionar 3 exports; reutiliza `apiVersion()` já existente no arquivo)

**Interfaces:**
- Consumes: `apiVersion()` (privada no arquivo), tipo `TemplateVar` de `@/lib/db`.
- Produces:
  - `montarComponents(input): any[]` — monta o array `components` da Graph API.
  - `criarTemplateMeta(wabaId, token, payload): Promise<{ ok: boolean; metaId?: string|null; status?: string|null; erro?: string }>`
  - `excluirTemplateMeta(wabaId, token, nome): Promise<{ ok: boolean; erro?: string }>`

- [ ] **Step 1: Adicionar `import` do tipo e as funções ao fim de `lib/meta.ts`**

No topo do arquivo, na linha `import type { Agente } from "./db";`, trocar por:

```ts
import type { Agente, TemplateVar } from "./db";
```

Ao final do arquivo, adicionar:

```ts
// ===== Criação/gestão de templates (Graph API) =====

export type TemplateInput = {
  header?: { formato: "TEXTO" | "IMAGEM"; texto?: string; exemploUrl?: string } | null;
  corpo: string; // com {{1}}, {{2}}...
  variaveis: TemplateVar[];
  rodape?: string | null;
  botoes?: Array<{ tipo: "URL" | "RAPIDA"; texto: string; url?: string }>;
};

// Monta o array `components` exatamente no formato que a Meta espera.
export function montarComponents(input: TemplateInput): any[] {
  const comps: any[] = [];

  if (input.header) {
    if (input.header.formato === "TEXTO" && input.header.texto) {
      comps.push({ type: "HEADER", format: "TEXT", text: input.header.texto });
    } else if (input.header.formato === "IMAGEM" && input.header.exemploUrl) {
      comps.push({
        type: "HEADER",
        format: "IMAGE",
        example: { header_handle: [input.header.exemploUrl] },
      });
    }
  }

  const body: any = { type: "BODY", text: input.corpo };
  const exemplos = [...input.variaveis]
    .sort((a, b) => a.pos - b.pos)
    .map((v) => v.exemplo || "");
  if (exemplos.length) body.example = { body_text: [exemplos] };
  comps.push(body);

  if (input.rodape) comps.push({ type: "FOOTER", text: input.rodape });

  if (input.botoes && input.botoes.length) {
    comps.push({
      type: "BUTTONS",
      buttons: input.botoes.map((b) =>
        b.tipo === "URL"
          ? { type: "URL", text: b.texto, url: b.url || "" }
          : { type: "QUICK_REPLY", text: b.texto }
      ),
    });
  }

  return comps;
}

// Cria (submete para aprovação) um template na WABA.
export async function criarTemplateMeta(
  wabaId: string,
  token: string,
  payload: { name: string; category: string; language: string; components: any[] }
): Promise<{ ok: boolean; metaId?: string | null; status?: string | null; erro?: string }> {
  if (!wabaId || !token) return { ok: false, erro: "Credenciais Meta ausentes" };
  const ver = await apiVersion();
  try {
    const r = await fetch(`https://graph.facebook.com/${ver}/${wabaId}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payload.name,
        category: payload.category,
        language: payload.language,
        components: payload.components,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      let msg = d?.error?.message || `HTTP ${r.status}`;
      // Erro comum: token sem permissão de gestão de templates.
      if (String(d?.error?.type).includes("OAuth") || r.status === 401 || r.status === 403) {
        msg = `${msg} — verifique se o token tem a permissão 'whatsapp_business_management'.`;
      }
      return { ok: false, erro: `Meta: ${String(msg).slice(0, 240)}` };
    }
    return { ok: true, metaId: d?.id ?? null, status: d?.status ?? "PENDING" };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

// Exclui um template da WABA (por nome).
export async function excluirTemplateMeta(
  wabaId: string,
  token: string,
  nome: string
): Promise<{ ok: boolean; erro?: string }> {
  if (!wabaId || !token) return { ok: false, erro: "Credenciais Meta ausentes" };
  const ver = await apiVersion();
  try {
    const r = await fetch(
      `https://graph.facebook.com/${ver}/${wabaId}/message_templates?name=${encodeURIComponent(nome)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: `Meta: ${String(d?.error?.message || r.status).slice(0, 200)}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Verificação manual do `montarComponents` (node one-off)**

Criar `scripts/_check_components.mjs` temporário só para inspecionar o formato:

```js
// cópia isolada da lógica para conferir o shape do payload
const input = {
  header: { formato: "TEXTO", texto: "Olá {{1}}" },
  corpo: "Oi {{1}}, tudo bem em {{2}}?",
  variaveis: [
    { pos: 1, rotulo: "Nome", campo: "nome", exemplo: "João" },
    { pos: 2, rotulo: "Cidade", campo: "cidade", exemplo: "Campinas" },
  ],
  rodape: "Equipe",
  botoes: [{ tipo: "URL", texto: "Site", url: "https://ex.com" }],
};
// cole aqui o corpo de montarComponents (sem os tipos) e:
// console.log(JSON.stringify(montarComponents(input), null, 2));
```

Run: `node scripts/_check_components.mjs`
Expected: `BODY.example.body_text = [["João","Campinas"]]`, header TEXT, footer, buttons URL.
Depois: `rm scripts/_check_components.mjs` (não commitar).

- [ ] **Step 4: Commit**

```bash
git add lib/meta.ts
git commit -m "feat(templates): criarTemplateMeta, excluirTemplateMeta e montarComponents"
```

---

### Task 3: Rota `app/api/templates/route.ts`

**Files:**
- Create: `app/api/templates/route.ts`

**Interfaces:**
- Consumes: `query/queryOne/execute/Agente/Template/TemplateVar` de `@/lib/db`; `getSessao` de `@/lib/auth`; `criarTemplateMeta/excluirTemplateMeta/montarComponents/listarTemplatesMeta/enviarTemplateMeta` de `@/lib/meta`; `normalizarNumero` de `@/lib/evolution`.
- Produces: endpoints GET/POST/DELETE consumidos pela UI (Task 4).

Contrato:
- `GET /api/templates?agente=<id>` → `Template[]` (do banco, com status sincronizado da Meta).
- `POST /api/templates` body `{ agente_id, nome, categoria, idioma, header, corpo, variaveis, rodape, botoes }` → `{ ok, id }` ou `{ erro }`.
- `POST /api/templates?teste=1` body `{ id, numero }` → `{ ok }` ou `{ erro }` (envia template aprovado usando os `exemplo` como variáveis).
- `DELETE /api/templates?id=<id>` → `{ ok }`.

- [ ] **Step 1: Criar o arquivo com o conteúdo completo**

```ts
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute, Agente, Template, TemplateVar } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { normalizarNumero } from "@/lib/evolution";
import {
  criarTemplateMeta,
  excluirTemplateMeta,
  montarComponents,
  listarTemplatesMeta,
  enviarTemplateMeta,
} from "@/lib/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function admin() {
  const s = getSessao();
  return s && s.perfil === "ADMIN" ? s : null;
}

function mapStatus(metaStatus: string): string {
  const s = (metaStatus || "").toUpperCase();
  if (s === "APPROVED") return "APROVADO";
  if (s === "REJECTED") return "REJEITADO";
  return "PENDENTE"; // PENDING, IN_APPEAL, etc.
}

async function agenteMeta(id: number): Promise<Agente | null> {
  const a = await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [id]);
  return a && a.provedor === "meta" ? a : null;
}

// GET ?agente=<id> -> lista local + sincroniza status com a Meta.
export async function GET(req: NextRequest) {
  if (!admin()) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const agenteId = Number(new URL(req.url).searchParams.get("agente"));
  if (!agenteId) return NextResponse.json([]);

  const a = await agenteMeta(agenteId);
  if (!a) return NextResponse.json({ erro: "Agente Meta não encontrado" }, { status: 404 });

  // Sincroniza status: busca na Meta e casa por nome.
  const r = await listarTemplatesMeta(a.meta_waba_id || "", a.meta_token || "");
  if (r.ok && r.templates) {
    for (const t of r.templates) {
      await execute(
        "UPDATE templates SET status = $1 WHERE agente_id = $2 AND nome = $3",
        [mapStatus(t.status), agenteId, t.nome]
      );
    }
  }

  const rows = await query<Template>(
    "SELECT * FROM templates WHERE agente_id = $1 ORDER BY criado_em DESC",
    [agenteId]
  );
  return NextResponse.json(rows);
}

// POST -> cria template. POST ?teste=1 -> envia teste.
export async function POST(req: NextRequest) {
  const sessao = admin();
  if (!sessao) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const teste = new URL(req.url).searchParams.get("teste");
  const b = await req.json().catch(() => ({}));

  if (teste) {
    const t = await queryOne<Template>("SELECT * FROM templates WHERE id = $1", [Number(b.id)]);
    if (!t) return NextResponse.json({ erro: "Template não encontrado" }, { status: 404 });
    if (t.status !== "APROVADO")
      return NextResponse.json({ erro: "Só é possível testar template APROVADO" }, { status: 400 });
    const a = await agenteMeta(t.agente_id);
    if (!a) return NextResponse.json({ erro: "Agente Meta não encontrado" }, { status: 404 });
    const numero = normalizarNumero(String(b.numero || ""));
    if (!numero) return NextResponse.json({ erro: "Número inválido" }, { status: 400 });
    const vars = (t.variaveis as TemplateVar[]).sort((x, y) => x.pos - y.pos).map((v) => v.exemplo || "");
    const env = await enviarTemplateMeta(a.meta_phone_id || "", a.meta_token || "", numero, t.nome, t.idioma, vars);
    if (!env.ok) return NextResponse.json({ erro: env.erro }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  // Criação
  const agenteId = Number(b.agente_id);
  const a = await agenteMeta(agenteId);
  if (!a) return NextResponse.json({ erro: "Agente Meta não encontrado" }, { status: 404 });

  const nome = String(b.nome || "").trim().toLowerCase().replace(/\s+/g, "_");
  const categoria = String(b.categoria || "").toUpperCase();
  const idioma = String(b.idioma || "pt_BR");
  const corpo = String(b.corpo || "").trim();
  const variaveis: TemplateVar[] = Array.isArray(b.variaveis) ? b.variaveis : [];

  // Validações
  if (!/^[a-z0-9_]{1,512}$/.test(nome))
    return NextResponse.json({ erro: "Nome inválido (use minúsculas, números e _)" }, { status: 400 });
  if (!["MARKETING", "UTILITY"].includes(categoria))
    return NextResponse.json({ erro: "Categoria inválida" }, { status: 400 });
  if (!corpo) return NextResponse.json({ erro: "Corpo obrigatório" }, { status: 400 });
  const usadas = new Set((corpo.match(/\{\{(\d+)\}\}/g) || []).map((m) => Number(m.replace(/\D/g, ""))));
  for (const pos of usadas) {
    const v = variaveis.find((x) => x.pos === pos);
    if (!v || !v.exemplo?.trim())
      return NextResponse.json({ erro: `Variável {{${pos}}} precisa de exemplo` }, { status: 400 });
  }

  const components = montarComponents({
    header: b.header || null,
    corpo,
    variaveis,
    rodape: b.rodape || null,
    botoes: Array.isArray(b.botoes) ? b.botoes : [],
  });

  const criado = await criarTemplateMeta(a.meta_waba_id || "", a.meta_token || "", {
    name: nome,
    category: categoria,
    language: idioma,
    components,
  });
  if (!criado.ok) return NextResponse.json({ erro: criado.erro }, { status: 502 });

  const row = await queryOne<{ id: number }>(
    `INSERT INTO templates (agente_id, nome, categoria, idioma, componentes, variaveis, status, meta_id, criado_por)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
     RETURNING id`,
    [
      agenteId,
      nome,
      categoria,
      idioma,
      JSON.stringify(components),
      JSON.stringify(variaveis),
      mapStatus(criado.status || "PENDING"),
      criado.metaId,
      sessao.nome || null,
    ]
  );
  return NextResponse.json({ ok: true, id: row?.id });
}

// DELETE ?id=<id> -> apaga na Meta e local.
export async function DELETE(req: NextRequest) {
  if (!admin()) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  const t = await queryOne<Template>("SELECT * FROM templates WHERE id = $1", [id]);
  if (!t) return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
  const a = await agenteMeta(t.agente_id);
  if (a) await excluirTemplateMeta(a.meta_waba_id || "", a.meta_token || "", t.nome);
  await execute("DELETE FROM templates WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
```

Nota: `getSessao()` retorna a sessão com `nome` — conferir o tipo `Sessao` em `lib/auth.ts`; se o campo for outro (ex.: `login`), usar o disponível para `criado_por`.

- [ ] **Step 2: Confirmar o campo de nome da sessão**

Run: `grep -nE "type Sessao|nome|login|uid" lib/auth.ts`
Expected: identificar o campo textual do usuário. Ajustar `sessao.nome` no INSERT se necessário.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Teste manual da rota (com o dev server rodando)**

Pré-requisito: `npm run dev` em outra aba e um agente Meta configurado (id conhecido). Autenticado como ADMIN (cookie de sessão).

```bash
# criar (ajuste o cookie e o agente_id)
curl -s -X POST http://localhost:3000/api/templates \
  -H "Content-Type: application/json" -H "Cookie: SEU_COOKIE" \
  -d '{"agente_id":1,"nome":"boas_vindas","categoria":"UTILITY","idioma":"pt_BR","corpo":"Olá {{1}}, bem-vindo!","variaveis":[{"pos":1,"rotulo":"Nome","campo":"nome","exemplo":"João"}]}'
# esperado: {"ok":true,"id":...}  (ou erro claro da Meta)
curl -s "http://localhost:3000/api/templates?agente=1" -H "Cookie: SEU_COOKIE"
# esperado: array com o template em status PENDENTE
```

- [ ] **Step 5: Commit**

```bash
git add app/api/templates/route.ts
git commit -m "feat(templates): rota /api/templates (criar, listar+sync, excluir, testar)"
```

---

### Task 4: Tela `/templates` (página + construtor client) + link no menu

**Files:**
- Create: `app/(app)/templates/page.tsx` (server)
- Create: `app/(app)/templates/TemplatesClient.tsx` (client, `"use client"`)
- Modify: `app/components/Sidebar.tsx` (adicionar item de menu)

**Interfaces:**
- Consumes: rota `/api/templates` (Task 3); `getSessao` de `@/lib/auth`; `query`/`Agente` de `@/lib/db`; `Icon` de `../../components/Icon`.
- Produces: rota navegável `/templates`.

- [ ] **Step 1: Página server `app/(app)/templates/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { query, Agente } from "@/lib/db";
import Icon from "../../components/Icon";
import TemplatesClient from "./TemplatesClient";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const sessao = getSessao()!;
  if (sessao.perfil !== "ADMIN") redirect("/");

  const agentes = await query<Agente>(
    "SELECT id, candidato, meta_waba_id FROM agentes WHERE provedor = 'meta' AND demo = false ORDER BY candidato"
  );

  return (
    <>
      <h1 className="page-title">
        <Icon name="chat" /> Templates
      </h1>
      <p className="page-sub">
        Crie modelos de mensagem, envie para aprovação da Meta e defina variáveis.
      </p>
      <TemplatesClient
        agentes={agentes.map((a) => ({ id: a.id, nome: a.candidato, waba: a.meta_waba_id }))}
      />
    </>
  );
}
```

- [ ] **Step 2: Client construtor `app/(app)/templates/TemplatesClient.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import Icon from "../../components/Icon";

type AgenteOpt = { id: number; nome: string; waba: string | null };
type Variavel = { pos: number; rotulo: string; campo: string; exemplo: string };
type Botao = { tipo: "URL" | "RAPIDA"; texto: string; url: string };
type Template = {
  id: number; nome: string; categoria: string; status: string;
  motivo_rejeicao: string | null; idioma: string;
};

const CAMPOS = ["nome", "whatsapp", "email", "cidade", "regiao", "bairro", "partido", "funcao", "categoria", "instagram"];
const CORES: Record<string, string> = { APROVADO: "#16a34a", PENDENTE: "#d97706", REJEITADO: "#dc2626" };

export default function TemplatesClient({ agentes }: { agentes: AgenteOpt[] }) {
  const [agenteId, setAgenteId] = useState<number | null>(agentes[0]?.id ?? null);
  const [lista, setLista] = useState<Template[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState(false);

  // Form
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("UTILITY");
  const [headerTipo, setHeaderTipo] = useState<"NENHUM" | "TEXTO" | "IMAGEM">("NENHUM");
  const [headerTexto, setHeaderTexto] = useState("");
  const [headerUrl, setHeaderUrl] = useState("");
  const [corpo, setCorpo] = useState("");
  const [variaveis, setVariaveis] = useState<Variavel[]>([]);
  const [rodape, setRodape] = useState("");
  const [botoes, setBotoes] = useState<Botao[]>([]);
  const [msg, setMsg] = useState("");

  async function carregar() {
    if (!agenteId) return;
    setCarregando(true);
    const r = await fetch(`/api/templates?agente=${agenteId}`);
    const d = await r.json();
    setLista(Array.isArray(d) ? d : []);
    setCarregando(false);
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [agenteId]);

  function addVariavel() {
    const pos = variaveis.length + 1;
    setCorpo((c) => c + `{{${pos}}}`);
    setVariaveis((v) => [...v, { pos, rotulo: "", campo: "nome", exemplo: "" }]);
  }
  function setVar(i: number, patch: Partial<Variavel>) {
    setVariaveis((v) => v.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function addBotao() {
    if (botoes.length >= 3) return;
    setBotoes((b) => [...b, { tipo: "URL", texto: "", url: "" }]);
  }
  function setBotao(i: number, patch: Partial<Botao>) {
    setBotoes((b) => b.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  function preview(): string {
    let t = corpo;
    for (const v of variaveis) t = t.replaceAll(`{{${v.pos}}}`, v.exemplo || `{{${v.rotulo || v.pos}}}`);
    return t;
  }

  async function salvar() {
    setMsg("");
    const header =
      headerTipo === "TEXTO" ? { formato: "TEXTO", texto: headerTexto } :
      headerTipo === "IMAGEM" ? { formato: "IMAGEM", exemploUrl: headerUrl } : null;
    const body = {
      agente_id: agenteId, nome, categoria, idioma: "pt_BR",
      header, corpo,
      variaveis: variaveis.map((v) => ({ pos: v.pos, rotulo: v.rotulo, campo: v.campo || null, exemplo: v.exemplo })),
      rodape: rodape || null,
      botoes: botoes.map((b) => ({ tipo: b.tipo, texto: b.texto, url: b.url })),
    };
    const r = await fetch("/api/templates", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) { setMsg(d.erro || "Erro ao criar"); return; }
    setAberto(false);
    setNome(""); setCorpo(""); setVariaveis([]); setRodape(""); setBotoes([]); setHeaderTipo("NENHUM");
    carregar();
  }

  async function excluir(id: number) {
    if (!confirm("Excluir este template na Meta e localmente?")) return;
    await fetch(`/api/templates?id=${id}`, { method: "DELETE" });
    carregar();
  }
  async function testar(id: number) {
    const numero = prompt("Número para teste (com DDD, só dígitos):");
    if (!numero) return;
    const r = await fetch("/api/templates?teste=1", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, numero }),
    });
    const d = await r.json();
    alert(r.ok ? "Enviado!" : `Erro: ${d.erro}`);
  }

  if (!agentes.length)
    return <p className="page-sub">Nenhum agente Meta configurado. Configure um agente com provedor Meta primeiro.</p>;

  const agente = agentes.find((a) => a.id === agenteId);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <select value={agenteId ?? ""} onChange={(e) => setAgenteId(Number(e.target.value))} className="input">
          {agentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => setAberto((v) => !v)}>
          <Icon name="plus" size={16} /> Novo template
        </button>
        {agente && !agente.waba && <span style={{ color: "#dc2626" }}>Este agente não tem WABA configurada.</span>}
      </div>

      {aberto && (
        <div className="card" style={{ padding: 16, marginBottom: 20, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label>Nome (slug)<br /><input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="boas_vindas" /></label>
            <label>Categoria<br />
              <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="UTILITY">Utilidade</option>
                <option value="MARKETING">Marketing</option>
              </select>
            </label>
          </div>

          <div>
            <label>Cabeçalho:{" "}
              <select className="input" value={headerTipo} onChange={(e) => setHeaderTipo(e.target.value as any)}>
                <option value="NENHUM">Nenhum</option>
                <option value="TEXTO">Texto</option>
                <option value="IMAGEM">Imagem</option>
              </select>
            </label>
            {headerTipo === "TEXTO" && <input className="input" placeholder="Texto do cabeçalho" value={headerTexto} onChange={(e) => setHeaderTexto(e.target.value)} />}
            {headerTipo === "IMAGEM" && <input className="input" placeholder="URL da imagem de exemplo" value={headerUrl} onChange={(e) => setHeaderUrl(e.target.value)} />}
          </div>

          <div>
            <label>Corpo</label>
            <textarea className="input" rows={4} value={corpo} onChange={(e) => setCorpo(e.target.value)} placeholder="Olá {{1}}, ..." />
            <button className="btn" onClick={addVariavel}><Icon name="plus" size={14} /> Variável</button>
          </div>

          {variaveis.map((v, i) => (
            <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <strong>{`{{${v.pos}}}`}</strong>
              <input className="input" placeholder="Rótulo" value={v.rotulo} onChange={(e) => setVar(i, { rotulo: e.target.value })} />
              <select className="input" value={v.campo} onChange={(e) => setVar(i, { campo: e.target.value })}>
                {CAMPOS.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="">(manual)</option>
              </select>
              <input className="input" placeholder="Exemplo" value={v.exemplo} onChange={(e) => setVar(i, { exemplo: e.target.value })} />
            </div>
          ))}

          <label>Rodapé<br /><input className="input" value={rodape} onChange={(e) => setRodape(e.target.value)} placeholder="Opcional" /></label>

          <div>
            <button className="btn" onClick={addBotao}><Icon name="plus" size={14} /> Botão</button>
            {botoes.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <select className="input" value={b.tipo} onChange={(e) => setBotao(i, { tipo: e.target.value as any })}>
                  <option value="URL">URL</option>
                  <option value="RAPIDA">Resposta rápida</option>
                </select>
                <input className="input" placeholder="Texto do botão" value={b.texto} onChange={(e) => setBotao(i, { texto: e.target.value })} />
                {b.tipo === "URL" && <input className="input" placeholder="https://..." value={b.url} onChange={(e) => setBotao(i, { url: e.target.value })} />}
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 12, background: "#f8fafc" }}>
            <strong>Prévia:</strong>
            <div style={{ whiteSpace: "pre-wrap" }}>{preview()}</div>
          </div>

          {msg && <div style={{ color: "#dc2626" }}>{msg}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={salvar}>Enviar para aprovação</button>
            <button className="btn" onClick={() => setAberto(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {carregando ? <p>Carregando...</p> : (
        <table className="tabela" style={{ width: "100%" }}>
          <thead><tr><th>Nome</th><th>Categoria</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {lista.map((t) => (
              <tr key={t.id}>
                <td>{t.nome}</td>
                <td>{t.categoria}</td>
                <td>
                  <span style={{ color: CORES[t.status] || "#666", fontWeight: 600 }}>{t.status}</span>
                  {t.motivo_rejeicao && <div style={{ fontSize: 12, color: "#dc2626" }}>{t.motivo_rejeicao}</div>}
                </td>
                <td style={{ display: "flex", gap: 8 }}>
                  {t.status === "APROVADO" && <button className="btn" onClick={() => testar(t.id)}>Testar</button>}
                  <button className="btn" onClick={() => excluir(t.id)}><Icon name="x" size={14} /></button>
                </td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={4} style={{ color: "#666" }}>Nenhum template ainda.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

Nota: as classes CSS (`input`, `btn`, `btn-primary`, `card`, `tabela`, `page-sub`) devem existir no projeto — conferir em `app/globals.css`. Se alguma não existir, usar a classe equivalente já usada em `configuracoes`/`campanhas`.

- [ ] **Step 3: Adicionar item no menu `app/components/Sidebar.tsx`**

No array `ITENS` (após o item de `/tarefas`), inserir:

```tsx
  { href: "/templates", icon: "chat", label: "TEMPLATES", perfis: ["ADMIN"] },
```

- [ ] **Step 4: Conferir classes CSS usadas**

Run: `grep -nE "\.input|\.btn|\.card|\.tabela|\.page-sub" app/globals.css`
Expected: confirmar que existem. Ajustar nomes no client se faltar alguma.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build conclui sem erros de tipo/lint bloqueante; rota `/templates` aparece na lista de rotas.

- [ ] **Step 6: Teste manual na UI**

Com `npm run dev`: logar como ADMIN → menu **TEMPLATES** → escolher agente Meta → **Novo template** → preencher corpo com 1 variável → **Enviar para aprovação** → o template aparece como **PENDENTE**. Recarregar depois de aprovado na Meta → **APROVADO**. Testar envio.

- [ ] **Step 7: Commit**

```bash
git add app/(app)/templates app/components/Sidebar.tsx
git commit -m "feat(templates): tela /templates (construtor + lista) e link no menu"
```

---

## Self-Review (feita pelo autor do plano)

- **Cobertura do spec:** tabela `templates` (Task 1) ✓; `criarTemplateMeta`/`excluirTemplateMeta`/`montarComponents` (Task 2) ✓; rota GET+sync/POST/DELETE/teste (Task 3) ✓; tela `/templates` com construtor header/corpo/variáveis rotuladas+mapeadas/rodapé/botões + prévia (Task 4) ✓; guard ADMIN ✓; tratamento do erro de permissão `whatsapp_business_management` (Task 2) ✓. Auto-preenchimento no disparo = etapa 2 (fora de escopo) ✓.
- **Consistência de tipos:** `TemplateVar` definido na Task 1 e consumido nas Tasks 2/3; `montarComponents`/`criarTemplateMeta`/`excluirTemplateMeta` com assinaturas iguais entre Task 2 (definição) e Task 3 (uso); campos de `pessoas` idênticos ao schema.
- **Placeholders:** nenhum "TBD/TODO"; código completo em todos os steps. Dois pontos exigem verificação em runtime (campo textual de `Sessao` e nomes de classes CSS), com o passo de checagem embutido — não são placeholders, são validações de integração.
