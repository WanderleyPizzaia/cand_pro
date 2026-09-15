"use client";

// Painel de status das integrações do gabinete: Google, WhatsApp, Meta e
// Instagram, com ícone da marca e indicador verde piscando (conectado/verificado).

const ICON_GOOGLE = (
  <svg viewBox="0 0 48 48" width="26" height="26" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.3-5.5l-6.6-5.6C29.6 34.6 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.6l6.6 5.6C41.9 36.3 44 30.7 44 24c0-1.3-.1-2.7-.4-3.5z" />
  </svg>
);

const ICON_WHATS = (
  <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
    <path fill="#25D366" d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.2 1.6 6L4 29l8.2-1.6c1.7.9 3.6 1.4 5.6 1.4h.2c6.6 0 12-5.4 12-12S22.6 3 16 3z" />
    <path fill="#fff" d="M12.5 9.5c-.3-.7-.6-.7-.9-.7h-.7c-.3 0-.7.1-1 .5-.4.4-1.3 1.3-1.3 3.1s1.4 3.6 1.5 3.9c.2.3 2.7 4.3 6.7 5.9 3.3 1.3 4 1 4.7.9.7-.1 2.3-.9 2.6-1.9.3-.9.3-1.7.2-1.9-.1-.2-.4-.3-.8-.5s-2.3-1.1-2.6-1.3c-.3-.1-.6-.2-.9.2-.3.4-1 1.3-1.2 1.5-.2.2-.4.3-.8.1s-1.6-.6-3-1.9c-1.1-1-1.9-2.2-2.1-2.6-.2-.4 0-.6.2-.8.2-.2.4-.4.6-.7.1-.2.2-.4.3-.7.1-.3.1-.5 0-.7-.1-.2-.9-2.2-1.2-2.9z" />
  </svg>
);

const ICON_META = (
  <svg viewBox="0 0 36 24" width="30" height="22" aria-hidden="true">
    <path fill="#0081FB" d="M6.6 3.2C3.1 3.2 1 7.7 1 12.2c0 2.5.9 4.2 2.6 4.2 1.6 0 2.4-1 4-3.6.5-.8 1.1-1.9 1.8-3.1l1.6-2.9c.1.2.3.4.4.7l2.1 3.5C16.7 15.6 18 17 20 17c1.9 0 2.9-1.5 2.9-3.9 0-4.7-2.2-9.9-5.7-9.9-1.9 0-3.4 1.4-4.7 3.5C11.2 4.6 9.5 3.2 6.6 3.2zm.2 2.6c1.3 0 2.4 1 3.4 2.6l-.9 1.5c-1.3 2.2-1.9 2.9-2.7 2.9-.8 0-1.3-.7-1.3-2 0-2.9 1.2-5 1.5-5zm10.9.1c1.6 0 3 2.6 3 5.3 0 1-.3 1.6-1 1.6-.7 0-1.1-.5-2.1-2.2l-2-3.4c.6-.8 1.3-1.3 2.1-1.3z" />
  </svg>
);

const ICON_INSTA = (
  <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
    <defs>
      <radialGradient id="igbg" cx="30%" cy="107%" r="150%">
        <stop offset="0" stopColor="#fdf497" />
        <stop offset="0.05" stopColor="#fdf497" />
        <stop offset="0.45" stopColor="#fd5949" />
        <stop offset="0.6" stopColor="#d6249f" />
        <stop offset="0.9" stopColor="#285AEB" />
      </radialGradient>
    </defs>
    <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#igbg)" />
    <circle cx="16" cy="16" r="7" fill="none" stroke="#fff" strokeWidth="2.2" />
    <circle cx="23.4" cy="8.6" r="1.7" fill="#fff" />
  </svg>
);

const SERVICOS = [
  { nome: "Google", icon: ICON_GOOGLE, detalhe: "Agenda + Contatos" },
  { nome: "WhatsApp", icon: ICON_WHATS, detalhe: "Atendimento + disparos" },
  { nome: "Meta", icon: ICON_META, detalhe: "API oficial (Cloud)" },
  { nome: "Instagram", icon: ICON_INSTA, detalhe: "Perfil oficial" },
];

export default function IntegracoesStatus() {
  return (
    <div className="integr-grid">
      {SERVICOS.map((s) => (
        <div className="integr-card" key={s.nome}>
          <div className="integr-ic">{s.icon}</div>
          <div className="integr-info">
            <div className="integr-nome">{s.nome}</div>
            <div className="integr-detalhe">{s.detalhe}</div>
          </div>
          <div className="integr-badge">
            <span className="dot-verde" />
            Conectado
          </div>
        </div>
      ))}
    </div>
  );
}
