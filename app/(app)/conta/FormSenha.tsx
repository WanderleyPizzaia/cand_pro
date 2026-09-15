"use client";

import { useState } from "react";

export default function FormSenha() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; texto: string } | null>(
    null
  );
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (nova.length < 6) {
      setMsg({ tipo: "err", texto: "A nova senha deve ter ao menos 6 caracteres." });
      return;
    }
    if (nova !== confirma) {
      setMsg({ tipo: "err", texto: "A confirmação não confere com a nova senha." });
      return;
    }

    setEnviando(true);
    try {
      const r = await fetch("/api/conta/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atual, nova }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setMsg({ tipo: "ok", texto: "Senha alterada com sucesso." });
        setAtual("");
        setNova("");
        setConfirma("");
      } else {
        setMsg({ tipo: "err", texto: d.erro || "Não foi possível alterar a senha." });
      }
    } catch {
      setMsg({ tipo: "err", texto: "Erro de conexão. Tente novamente." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="form-card" style={{ maxWidth: 460 }} onSubmit={enviar}>
      {msg && <div className={`msg ${msg.tipo}`}>{msg.texto}</div>}

      <div className="field full">
        <label>
          Senha atual <span className="req">*</span>
        </label>
        <input
          type="password"
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <div className="field full">
        <label>
          Nova senha <span className="req">*</span>
        </label>
        <input
          type="password"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          autoComplete="new-password"
          placeholder="Mínimo 6 caracteres"
        />
      </div>
      <div className="field full">
        <label>
          Confirmar nova senha <span className="req">*</span>
        </label>
        <input
          type="password"
          value={confirma}
          onChange={(e) => setConfirma(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={enviando}>
          {enviando ? "Salvando…" : "Alterar senha"}
        </button>
      </div>
    </form>
  );
}
