"use client";

import { useState } from "react";
import Icon from "../../components/Icon";

// Tela travada de "Conectar conta Google" (logos Google + CAND PRO).
// A conexão real (OAuth Calendar/Tasks/Gmail) é ativada pelo backend quando as
// credenciais do Google estiverem configuradas; por ora, orienta o usuário.
export default function AgendaConectar() {
  const [msg, setMsg] = useState("");

  async function conectar() {
    setMsg("");
    try {
      const r = await fetch("/api/google/oauth/start", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (d.url) { window.location.href = d.url; return; }
      setMsg(d.aviso || "Conexão Google em ativação. Já já liberamos para a sua conta.");
    } catch {
      setMsg("Conexão Google em ativação. Já já liberamos para a sua conta.");
    }
  }

  return (
    <div className="gconnect">
      <div className="gc-logos">
        <span className="gc-google" aria-label="Google">
          <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.4 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.4 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.3C29.2 35 26.7 36 24 36c-5.3 0-9.6-3.1-11.3-7.4l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.5l6.2 5.3C36.9 40 44 34 44 24c0-1.3-.1-2.3-.4-3.5z"/>
          </svg>
        </span>
        <span className="gc-plus">+</span>
        <span className="gc-marca">
          <b>CAND PRO</b><span className="gc-stripe"></span>
        </span>
      </div>

      <h2 className="gc-title">Conecte sua conta Google</h2>
      <p className="gc-sub">
        Acesse seus <b>eventos</b>, <b>tarefas</b> e <b>e-mails</b> dentro da plataforma.
        Centralize a sua gestão com a tecnologia <b>CAND PRO</b>.
      </p>

      <div className="gc-feats">
        <div className="gc-feat"><Icon name="calendar" size={20} /><span>Agenda em tempo real</span></div>
        <div className="gc-feat"><Icon name="tasks" size={20} /><span>Tarefas do dia</span></div>
        <div className="gc-feat"><Icon name="inbox" size={20} /><span>E-mails no painel</span></div>
      </div>

      <button className="gc-btn" onClick={conectar}>
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.4 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.4 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.3C29.2 35 26.7 36 24 36c-5.3 0-9.6-3.1-11.3-7.4l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.5l6.2 5.3C36.9 40 44 34 44 24c0-1.3-.1-2.3-.4-3.5z"/>
        </svg>
        Conectar conta Google
      </button>
      {msg && <p className="gc-msg">{msg}</p>}
      <p className="gc-lgpd">Acesso somente leitura, com sua autorização. Você pode desconectar quando quiser.</p>
    </div>
  );
}
