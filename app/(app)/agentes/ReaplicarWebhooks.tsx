"use client";

import { useState } from "react";

// Reaplica a URL do webhook (já com o token de segurança) em todas as
// instâncias Evolution. Necessário uma vez nas instâncias conectadas antes do
// token passar a ser obrigatório; as novas conexões já saem com o token.
export default function ReaplicarWebhooks() {
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState(false);

  async function reaplicar() {
    setCarregando(true);
    setMsg("");
    const r = await fetch("/api/agentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "reaplicar_webhooks" }),
    });
    const d = await r.json().catch(() => ({}));
    setCarregando(false);
    if (r.ok) {
      const falhas = d.falhas?.length ? ` Falhou em: ${d.falhas.join(", ")}.` : "";
      setErro(!!d.falhas?.length);
      setMsg(`Webhook atualizado em ${d.ok} de ${d.total} instância(s).${falhas}`);
    } else {
      setErro(true);
      setMsg(d.erro || "Falha ao reaplicar.");
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
      <button className="btn btn-sm" onClick={reaplicar} disabled={carregando}>
        {carregando ? "Aplicando…" : "Reaplicar webhook em todas as instâncias"}
      </button>
      {msg && (
        <span style={{ color: erro ? "var(--yellow)" : "var(--green)", fontSize: 13 }}>{msg}</span>
      )}
    </div>
  );
}
