"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "./Icon";
import Logo from "./Logo";
import AvatarUsuario from "./AvatarUsuario";
import { ITENS, ROTULO, itemAtivo } from "./navItens";

export default function Sidebar({
  nome,
  perfil,
  foto,
  onToggle,
}: {
  nome: string;
  perfil: string;
  foto?: string | null;
  onToggle?: () => void;
}) {
  const path = usePathname();
  const router = useRouter();
  const [aberta, setAberta] = useState(false); // drawer no mobile

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const visiveis = ITENS.filter((i) => i.perfis.includes(perfil));

  const avatar = (
    <AvatarUsuario
      foto={foto}
      nome={nome}
      className="user-avatar"
      iniClassName="user-avatar-ini"
    />
  );

  return (
    <>
      {/* Barra superior - só no mobile. Sem hambúrguer: a navegação é a catraca
          (dock inferior). Aqui fica só a marca + acesso rápido a config e sair. */}
      <header className="topbar-mobile">
        <div className="topbar-brand">
          <Logo size={17} />
        </div>
        <div className="topbar-actions">
          <Link
            href={perfil === "ADMIN" ? "/configuracoes" : "/conta"}
            className="topbar-btn"
            aria-label="Configurações"
          >
            <Icon name="settings" size={19} />
          </Link>
          <button className="topbar-btn" onClick={sair} aria-label="Sair">
            <Icon name="power" size={19} />
          </button>
        </div>
      </header>

      {aberta && (
        <div className="sidebar-backdrop" onClick={() => setAberta(false)} />
      )}

      <aside className={`sidebar${aberta ? " aberta" : ""}`}>
        <div className="sidebar-top">
          <div className="brand">
            <Logo size={20} flag />
          </div>
          {/* Recolher menu (desktop) */}
          <button
            className="sidebar-collapse"
            onClick={onToggle}
            title="Recolher menu"
            aria-label="Recolher menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
        <div className="brand-sub">Campanha & Gestão · IA</div>

        <nav className="nav">
          {visiveis.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={itemAtivo(i.href, path) ? "active" : ""}
              onClick={() => setAberta(false)}
            >
              <Icon name={i.icon} size={18} />
              {i.label}
            </Link>
          ))}
        </nav>

        <div className="user-box">
          <div className="user-info-row">
            {avatar}
            <div className="user-meta">
              <div className="user-nome">{nome}</div>
              <div className="user-perfil">{ROTULO[perfil] || perfil}</div>
            </div>
            <Link
              href={perfil === "ADMIN" ? "/configuracoes" : "/conta"}
              className="btn-gear"
              title="Configurações"
              onClick={() => setAberta(false)}
            >
              <Icon name="settings" size={16} />
            </Link>
          </div>
          <button className="btn-sair" onClick={sair}>
            <Icon name="power" size={15} /> Sair
          </button>
        </div>
      </aside>
    </>
  );
}
