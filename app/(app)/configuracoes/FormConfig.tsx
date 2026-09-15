"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = {
  evolutionUrl: boolean;
  evolutionApiKey: boolean;
  anthropicKey: boolean;
  googleCalendar: boolean;
  n8nDisparoUrl: boolean;
  n8nToken: boolean;
  n8nAgenteUrl: boolean;
  metaAppSecret: boolean;
};

const VAZIO = {
  EVOLUTION_URL: "",
  EVOLUTION_APIKEY: "",
  ANTHROPIC_API_KEY: "",
  GOOGLE_CALENDAR_SRC: "",
  N8N_DISPARO_URL: "",
  N8N_TOKEN: "",
  N8N_AGENTE_URL: "",
  META_APP_SECRET: "",
};

function Selo({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: ok ? "var(--green)" : "var(--yellow)",
      }}
    >
      {ok ? "✓ configurado" : "○ pendente"}
    </span>
  );
}

export default function FormConfig({ status }: { status: Status }) {
  const router = useRouter();
  const [f, setF] = useState(VAZIO);
  const [msg, setMsg] = useState("");
  const [salvando, setSalvando] = useState(false);

  function set(k: string, v: string) {
    setF((s) => ({ ...s, [k]: v }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMsg("");
    const r = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    setSalvando(false);
    if (r.ok) {
      setMsg("Configurações salvas!");
      setF(VAZIO);
      router.refresh();
    } else {
      setMsg("Erro ao salvar");
    }
  }

  return (
    <form className="form-card" onSubmit={salvar}>
      {msg && <div className="msg ok">{msg}</div>}

      <div className="field">
        <label>
          URL da Evolution API <Selo ok={status.evolutionUrl} />
        </label>
        <input
          placeholder="https://sua-evolution.com"
          value={f.EVOLUTION_URL}
          onChange={(e) => set("EVOLUTION_URL", e.target.value)}
        />
      </div>

      <div className="field">
        <label>
          Chave (apikey) da Evolution <Selo ok={status.evolutionApiKey} />
        </label>
        <input
          type="password"
          placeholder="••••••••"
          value={f.EVOLUTION_APIKEY}
          onChange={(e) => set("EVOLUTION_APIKEY", e.target.value)}
        />
      </div>

      <div className="field">
        <label>
          Chave da API de IA <Selo ok={status.anthropicKey} />
        </label>
        <input
          type="password"
          placeholder="••••••••"
          value={f.ANTHROPIC_API_KEY}
          onChange={(e) => set("ANTHROPIC_API_KEY", e.target.value)}
        />
      </div>

      <div className="field">
        <label>
          App Secret do app da Meta (WhatsApp oficial) <Selo ok={status.metaAppSecret} />
        </label>
        <input
          type="password"
          placeholder="••••••••"
          value={f.META_APP_SECRET}
          onChange={(e) => set("META_APP_SECRET", e.target.value)}
        />
        <small style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
          Obrigatório para receber mensagens pela API oficial: o sistema confere a
          assinatura de cada aviso da Meta. Fica em developers.facebook.com → seu app →
          Configurações do app → Básico → <b>Chave secreta do aplicativo</b>.
        </small>
      </div>

      <div className="field">
        <label>
          Google Calendar (ID ou link público) <Selo ok={status.googleCalendar} />
        </label>
        <input
          placeholder="ex: seuemail@gmail.com ou abc123@group.calendar.google.com"
          value={f.GOOGLE_CALENDAR_SRC}
          onChange={(e) => set("GOOGLE_CALENDAR_SRC", e.target.value)}
        />
        <small style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
          No Google Calendar: Configurações → seu calendário → “Integrar
          calendário” → copie o <b>ID do calendário</b> (ou o link de incorporação).
          Para todos verem, deixe o calendário <b>público</b>.
        </small>
      </div>

      <div className="field">
        <label>
          URL do disparo em massa (n8n) <Selo ok={status.n8nDisparoUrl} />
        </label>
        <input
          placeholder="https://seu-n8n.com/webhook/disparo-candpro"
          value={f.N8N_DISPARO_URL}
          onChange={(e) => set("N8N_DISPARO_URL", e.target.value)}
        />
        <small style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
          Com esta URL (e o token abaixo) preenchidos, as campanhas são enviadas ao n8n
          (com intervalo entre mensagens, evitando bloqueio). Vazia = envio direto pelo
          sistema (limite de 200 por disparo).
        </small>
      </div>

      <div className="field">
        <label>
          Token do n8n (segurança) <Selo ok={status.n8nToken} />
        </label>
        <input
          type="password"
          placeholder="••••••••"
          value={f.N8N_TOKEN}
          onChange={(e) => set("N8N_TOKEN", e.target.value)}
        />
        <small style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
          Obrigatório para usar o n8n: é enviado ao n8n e exigido de volta em todo
          retorno. Sem ele, o sistema não usa o n8n. Use um valor aleatório e longo.
        </small>
      </div>

      <div className="field">
        <label>
          URL do agente de IA no n8n (avançado) <Selo ok={status.n8nAgenteUrl} />
        </label>
        <input
          placeholder="https://seu-n8n.com/webhook/agente-candpro"
          value={f.N8N_AGENTE_URL}
          onChange={(e) => set("N8N_AGENTE_URL", e.target.value)}
        />
        <small style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
          <b>Deixe vazio</b> para a IA responder direto pelo sistema (padrão). Preenchida,
          as mensagens recebidas passam pelo n8n antes de responder — só ative depois de
          testar, pois se o n8n cair a IA não responde.
        </small>
      </div>

      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
    </form>
  );
}
