"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar, { type Contadores } from "./Sidebar";
import Topbar from "./Topbar";
import SubNav from "./SubNav";
import MobileNav from "./MobileNav";
import CommandPalette from "./CommandPalette";
import PageTransition from "./PageTransition";
import AutoRefresh from "./AutoRefresh";
import TourGuiado from "./TourGuiado";

function lerPref(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravarPref(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* navegação privada: segue sem lembrar */
  }
}

// Casca do app: menu lateral (desktop), barra superior, abas da área,
// barra de navegação do celular e a busca global (Ctrl K).
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
  const [busca, setBusca] = useState(false);
  const [contadores, setContadores] = useState<Contadores>({ fila: 0, pautas: 0, tarefas: 0 });

  useEffect(() => {
    if (lerPref("sidebar-collapsed") === "1") setCollapsed(true);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      gravarPref("sidebar-collapsed", c ? "0" : "1");
      return !c;
    });
  }, []);

  // Atalhos: Ctrl/Cmd+K em qualquer lugar; "/" quando não está digitando.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando =
        !!alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBusca((b) => !b);
      } else if (e.key === "/" && !digitando) {
        e.preventDefault();
        setBusca(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Selos do menu (fila, pautas novas, tarefas vencendo): a cada 30 s.
  useEffect(() => {
    let vivo = true;
    const puxar = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const r = await fetch("/api/contadores", { cache: "no-store" });
        if (r.ok && vivo) setContadores(await r.json());
      } catch {
        /* sem rede: mantém o último valor */
      }
    };
    puxar();
    const id = setInterval(puxar, 30_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className={`app${collapsed ? " app-collapsed" : ""}`}>
      <a href="#conteudo" className="pular">
        Ir para o conteúdo
      </a>
      <Sidebar
        nome={nome}
        perfil={perfil}
        foto={foto}
        contadores={contadores}
        onToggle={toggle}
        onBusca={() => setBusca(true)}
      />
      <div className="app-col">
        <Topbar onBusca={() => setBusca(true)} />
        <main className="main" id="conteudo">
          <AutoRefresh seconds={15} />
          <SubNav perfil={perfil} />
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <MobileNav nome={nome} perfil={perfil} foto={foto} contadores={contadores} />
      <CommandPalette aberto={busca} onFechar={() => setBusca(false)} perfil={perfil} />
      {tour && <TourGuiado />}
    </div>
  );
}
