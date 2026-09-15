import Logo from "./Logo";

// Tela de carregamento - usada APENAS na entrada (login). Não aparece ao navegar.
export default function Splash() {
  return (
    <div className="loading-screen">
      <div className="loading-logo">
        <Logo size={42} flag />
      </div>
      <div className="loading-bar">
        <span />
      </div>
      <p className="loading-txt">Entrando…</p>
    </div>
  );
}
