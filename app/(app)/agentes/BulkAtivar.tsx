"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "../../components/Icon";

// Botão plug-and-play: liga TODOS os agentes reais de uma vez (ADMIN/COORD).
// Reativa a operação sem precisar abrir card por card.
export default function BulkAtivar() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState("");

  async function ligarTodos() {
    if (!confirm("Ligar TODOS os agentes? Eles voltam a responder eleitores automaticamente (nos números conectados)."))
      return;
    setCarregando(true);
    setMsg("");
    const r = await fetch("/api/agentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "ativar_todos" }),
    });
    const d = await r.json().catch(() => ({}));
    setCarregando(false);
    if (r.ok) {
      setMsg(`${d.ativados} agente(s) ligado(s).`);
      router.refresh();
      setTimeout(() => setMsg(""), 2500);
    } else {
      setMsg(d.erro || "Falha ao ligar.");
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
      <button className="btn btn-sm" onClick={ligarTodos} disabled={carregando} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon name="power" size={15} /> {carregando ? "Ligando…" : "Ligar todos os agentes"}
      </button>
      {msg && <span style={{ color: "var(--green)", fontSize: 13 }}>{msg}</span>}
    </div>
  );
}
