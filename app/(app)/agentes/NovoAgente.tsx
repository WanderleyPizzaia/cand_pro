"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Cria um novo candidato/agente em tempo real. Depois é só "Conectar WhatsApp"
// no card para gerar a instância na Evolution (plug-and-play).
export default function NovoAgente() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [candidato, setCandidato] = useState("");
  const [apikey, setApikey] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function criar() {
    if (!candidato.trim()) {
      setErro("Informe o nome do candidato.");
      return;
    }
    setSalvando(true);
    setErro("");
    const r = await fetch("/api/agentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidato: candidato.trim(), apikey: apikey.trim() || undefined }),
    });
    setSalvando(false);
    if (r.ok) {
      setCandidato("");
      setApikey("");
      setAberto(false);
      router.refresh();
    } else {
      const d = await r.json().catch(() => ({}));
      setErro(d.erro || "Falha ao criar.");
    }
  }

  if (!aberto) {
    return (
      <button className="btn btn-primary" onClick={() => setAberto(true)} style={{ marginBottom: 18 }}>
        + Novo candidato
      </button>
    );
  }

  return (
    <div className="novo-agente">
      <div className="field">
        <label>Nome do candidato</label>
        <input
          autoFocus
          placeholder="ex: Maria Souza"
          value={candidato}
          onChange={(e) => setCandidato(e.target.value)}
        />
      </div>
      <div className="field">
        <label>
          Apikey da instância (opcional) <span className="muted">- deixe vazio p/ usar a chave global</span>
        </label>
        <input
          placeholder="apikey específica do número (se houver)"
          value={apikey}
          onChange={(e) => setApikey(e.target.value)}
        />
      </div>
      {erro && <div className="msg err">{erro}</div>}
      <div className="actions">
        <button className="btn-link" onClick={() => setAberto(false)}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={criar} disabled={salvando}>
          {salvando ? "Criando…" : "Criar candidato"}
        </button>
      </div>
    </div>
  );
}
