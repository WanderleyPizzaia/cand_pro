"use client";

import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import MobileDock from "./MobileDock";
import PageTransition from "./PageTransition";
import AutoRefresh from "./AutoRefresh";
import TourGuiado from "./TourGuiado";
import Notificacoes from "./Notificacoes";

// Casca do app: controla o recolher/expandir da sidebar (persistido no
// localStorage) e ajusta a largura do conteúdo. A sidebar e o conteúdo são
// renderizados aqui para que o estado de "recolhido" afete o layout inteiro.
export default function AppShell({
  nome,
  perfil,
  foto,
  tour,
  children,
}: {
  nome: string;
  perfil: string;
  foto: string | null;
  tour?: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("sidebar-collapsed") === "1") setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const n = !c;
      localStorage.setItem("sidebar-collapsed", n ? "1" : "0");
      return n;
    });
  }

  return (
    <div className={`app${collapsed ? " app-collapsed" : ""}`}>
      <Sidebar nome={nome} perfil={perfil} foto={foto} onToggle={toggle} />

      {/* Botão flutuante para reabrir quando recolhida (desktop) */}
      {collapsed && (
        <button
          className="sidebar-reopen"
          onClick={toggle}
          title="Expandir menu"
          aria-label="Expandir menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      <main className="main">
        <AutoRefresh seconds={15} />
        <PageTransition>{children}</PageTransition>
      </main>

      {/* Navegação mobile: dock inferior estilo Apple (some no desktop). */}
      <MobileDock perfil={perfil} />

      {/* Sistema de entusiasmo: sino de novidades + toasts comemorativos. */}
      <Notificacoes />

      {/* Tour guiado auto-dirigido (candidato vinculado · "Me mostre o sistema") */}
      {tour && <TourGuiado />}
    </div>
  );
}
