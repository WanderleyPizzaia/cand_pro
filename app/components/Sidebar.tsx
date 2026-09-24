"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Icon from "./Icon";
import Logo from "./Logo";
import AvatarUsuario from "./AvatarUsuario";
import { ROTULO, areasVisiveis, itemAtivo } from "./navItens";

export type Contadores = { fila: number; pautas: number; tarefas: number };

// Selo de cada item do menu: o que está esperando alguém.
export function seloDoItem(chave: string, c: Contadores): number {
  if (chave === "conversas") return c.fila;
  if (chave === "pautas") return c.pautas;
  if (chave === "tarefas") return c.tarefas;
  return 0;
}

export async function sairDoSistema(router: ReturnType<typeof useRouter>) {
  await fetch("/api/auth/logout", { method: "POST" });
  router.push("/login");
  router.refresh();
}

// Menu lateral (desktop): Início + áreas com título, ajustes e conta no rodapé.
// Recolhido vira uma faixa só de ícones (o nome aparece no title).
export default function Sidebar({
  nome,
  perfil,
  foto,
  contadores,
  onToggle,
  onBusca,
}: {
  nome: string;
  perfil: string;
  foto?: string | null;
  contadores: Contadores;
  onToggle: () => void;
  onBusca: () => void;
}) {
  const path = usePathname();
  const router = useRouter();
  const areas = areasVisiveis(perfil);
  const principais = areas.filter((a) => a.chave !== "ajustes");
  const ajustes = areas.find((a) => a.chave === "ajustes");

  return (
    <aside className="sidebar" aria-label="Menu principal">
      <div className="sb-top">
        <Link href="/" className="sb-logo" aria-label="CAND PRO, início">
          <span className="sb-logo-full">
            <Logo size={17} />
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sb-logo-mark" src="/icons/candpro.svg" alt="" width={30} height={30} />
        </Link>
        <button
          type="button"
          className="sb-collapse"
          onClick={onToggle}
          title="Recolher ou expandir o menu"
          aria-label="Recolher ou expandir o menu"
        >
          <Icon name="chevron-left" size={16} />
        </button>
      </div>

      <button type="button" className="sb-search" onClick={onBusca} title="Buscar (Ctrl K)">
        <Icon name="search" size={16} />
        <span className="sb-label">Buscar</span>
        <kbd className="sb-kbd">Ctrl K</kbd>
      </button>

      <nav className="sb-nav">
        {principais.map((area) => (
          <div className="sb-grupo" key={area.chave}>
            {area.chave !== "inicio" && <div className="sb-grupo-tit">{area.titulo}</div>}
            {area.visiveis.map((it) => {
              const ativo = itemAtivo(it, path);
              const selo = seloDoItem(it.chave, contadores);
              return (
                <Link
                  key={it.chave}
                  href={it.href}
                  className={`sb-item${ativo ? " ativo" : ""}`}
                  aria-current={ativo ? "page" : undefined}
                  title={it.label}
                >
                  <Icon name={it.icon} size={18} />
                  <span className="sb-label">{it.label}</span>
                  {selo > 0 && (
                    <span className={`sb-badge${it.chave === "conversas" ? " quente" : ""}`}>
                      {selo > 99 ? "99+" : selo}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sb-foot">
        {ajustes?.visiveis.map((it) => {
          const ativo = itemAtivo(it, path);
          return (
            <Link
              key={it.chave}
              href={it.href}
              className={`sb-item sb-item-sm${ativo ? " ativo" : ""}`}
              aria-current={ativo ? "page" : undefined}
              title={it.label}
            >
              <Icon name={it.icon} size={17} />
              <span className="sb-label">{it.label}</span>
            </Link>
          );
        })}
        <div className="sb-user">
          <AvatarUsuario foto={foto} nome={nome} className="user-avatar" iniClassName="user-avatar-ini" />
          <div className="sb-user-meta">
            <span className="sb-user-nome">{nome}</span>
            <span className="sb-user-perfil">{ROTULO[perfil] || perfil}</span>
          </div>
          <button
            type="button"
            className="sb-sair"
            onClick={() => sairDoSistema(router)}
            title="Sair"
            aria-label="Sair"
          >
            <Icon name="power" size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
