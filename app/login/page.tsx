"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "../components/Icon";
import Splash from "../components/Splash";
import InstallApp from "../components/InstallApp";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      // Resposta pode vir vazia (ex.: 500 durante um deploy). Lê como texto e só
      // então tenta o JSON — evita o "Unexpected end of JSON input" cru na tela.
      const bruto = await r.text();
      let data: any = {};
      try {
        data = bruto ? JSON.parse(bruto) : {};
      } catch {
        data = {};
      }
      if (!r.ok)
        throw new Error(
          data.erro ||
            "Servidor indisponível no momento. Tente novamente em instantes."
        );
      setEntrando(true);
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1100);
    } catch (err: any) {
      setErro(err.message);
      setCarregando(false);
    }
  }

  if (entrando) return <Splash />;

  return (
    <div className="ml-shell">
      {/* Aurora dourada viva + arcos de contorno (mapa eleitoral) */}
      <div className="ml-aura ml-aura-1" aria-hidden="true" />
      <div className="ml-aura ml-aura-2" aria-hidden="true" />
      <div className="ml-rings" aria-hidden="true" />
      <div className="ml-grid" aria-hidden="true" />

      <main className="ml-card">
        <div className="ml-kicker">Painel de campanha & gestão</div>

        <div className="ml-brand">
          <span className="ml-mark" aria-hidden="true">
            <svg viewBox="0 0 512 512" width="46" height="46">
              <defs>
                <linearGradient id="mlg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#f2d488" />
                  <stop offset="0.55" stopColor="#e0b24d" />
                  <stop offset="1" stopColor="#c8973a" />
                </linearGradient>
              </defs>
              <path
                d="M344 168 A120 120 0 1 0 344 344"
                fill="none"
                stroke="url(#mlg)"
                strokeWidth="46"
                strokeLinecap="round"
              />
              <circle cx="256" cy="256" r="30" fill="url(#mlg)" />
            </svg>
          </span>
          <h1 className="ml-word">
            CAND<span> PRO</span>
          </h1>
        </div>

        <p className="ml-tag">Inteligência para campanha e gestão política.</p>

        <form className="ml-form" onSubmit={entrar}>
          {erro && <div className="msg err">{erro}</div>}

          <label className="ml-field">
            <span className="ml-field-ic">
              <Icon name="at" size={16} />
            </span>
            <input
              placeholder="Usuário ou e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </label>

          <label className="ml-field">
            <span className="ml-field-ic">
              <Icon name="lock" size={16} />
            </span>
            <input
              type={mostrar ? "text" : "password"}
              placeholder="Senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="ml-eye"
              onClick={() => setMostrar((v) => !v)}
              tabIndex={-1}
              aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"}
            >
              {mostrar ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" />
                  <path d="M9.5 9.5a3 3 0 0 0 4.24 4.24" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </label>

          <button type="submit" className="ml-cta" disabled={carregando}>
            {carregando ? (
              "Entrando…"
            ) : (
              <>
                Acessar painel
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </>
            )}
          </button>
        </form>

        <InstallApp />

        <div className="ml-foot">
          <span className="ml-status">
            <i className="ml-status-dot" /> Sistema online
          </span>
          <a
            href="https://wa.me/5511963342541"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-help"
          >
            Precisa de acesso?
          </a>
        </div>
      </main>
    </div>
  );
}
