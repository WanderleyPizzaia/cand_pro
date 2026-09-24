"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Icon from "./Icon";
import AvatarUsuario from "./AvatarUsuario";
import { ROTULO, areasVisiveis, itemAtivo, type Area, type ItemVisivel } from "./navItens";
import { seloDoItem, sairDoSistema, type Contadores } from "./Sidebar";

type AreaVis = Area & { visiveis: ItemVisivel[] };

// Navegação do celular: barra fixa com até 5 abas (Início, Base, WhatsApp,
// Gabinete, Mais). Cada área abre um painel com as telas dela; área com uma
// tela só vai direto. Sem carrossel escondendo itens, sem som.
export default function MobileNav({
  nome,
  perfil,
  foto,
  contadores,
}: {
  nome: string;
  perfil: string;
  foto: string | null;
  contadores: Contadores;
}) {
  const path = usePathname();
  const router = useRouter();
  const [aberta, setAberta] = useState<string | null>(null);

  // Fecha o painel ao trocar de tela.
  useEffect(() => setAberta(null), [path]);

  // Esc fecha; o fundo não rola com o painel aberto.
  useEffect(() => {
    if (!aberta) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAberta(null);
    window.addEventListener("keydown", onKey);
    const ant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = ant;
    };
  }, [aberta]);

  const areas = areasVisiveis(perfil) as AreaVis[];
  const principais = areas.filter((a) => a.chave !== "ajustes");
  const ajustes = areas.find((a) => a.chave === "ajustes");
  const areaAtiva =
    areas.find((a) => a.visiveis.some((i) => itemAtivo(i, path)))?.chave ?? null;

  const seloArea = (a: AreaVis) =>
    a.visiveis.reduce((s, i) => s + seloDoItem(i.chave, contadores), 0);

  const painel = aberta === "mais" ? ajustes : principais.find((a) => a.chave === aberta);

  return (
    <>
      <nav className="tabbar" aria-label="Navegação">
        {principais.map((a) => {
          const ativo = areaAtiva === a.chave;
          const selo = seloArea(a);
          const conteudo = (
            <>
              <span className="tabbar-ic">
                <Icon name={a.icon} size={21} />
                {selo > 0 && <span className="tabbar-selo">{selo > 99 ? "99+" : selo}</span>}
              </span>
              <span className="tabbar-rot">{a.titulo}</span>
            </>
          );
          // Área com uma tela só (ex.: Início): link direto.
          if (a.visiveis.length === 1) {
            return (
              <Link
                key={a.chave}
                href={a.visiveis[0].href}
                className={`tabbar-item${ativo ? " ativo" : ""}`}
                aria-current={ativo ? "page" : undefined}
              >
                {conteudo}
              </Link>
            );
          }
          return (
            <button
              key={a.chave}
              type="button"
              className={`tabbar-item${ativo ? " ativo" : ""}${aberta === a.chave ? " aberto" : ""}`}
              onClick={() => setAberta(aberta === a.chave ? null : a.chave)}
              aria-expanded={aberta === a.chave}
            >
              {conteudo}
            </button>
          );
        })}
        <button
          type="button"
          className={`tabbar-item${areaAtiva === "ajustes" ? " ativo" : ""}${aberta === "mais" ? " aberto" : ""}`}
          onClick={() => setAberta(aberta === "mais" ? null : "mais")}
          aria-expanded={aberta === "mais"}
        >
          <span className="tabbar-ic">
            <Icon name="more" size={21} />
          </span>
          <span className="tabbar-rot">Mais</span>
        </button>
      </nav>

      {aberta && (
        <div className="sheet-scrim" onClick={() => setAberta(null)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={aberta === "mais" ? "Mais" : painel?.titulo}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-alca" aria-hidden="true" />
            {aberta === "mais" && (
              <div className="sheet-user">
                <AvatarUsuario foto={foto} nome={nome} className="user-avatar" iniClassName="user-avatar-ini" />
                <div className="sb-user-meta">
                  <span className="sb-user-nome">{nome}</span>
                  <span className="sb-user-perfil">{ROTULO[perfil] || perfil}</span>
                </div>
              </div>
            )}
            {aberta !== "mais" && <div className="sheet-tit">{painel?.titulo}</div>}
            <div className="sheet-lista">
              {painel?.visiveis.map((it) => {
                const ativo = itemAtivo(it, path);
                const selo = seloDoItem(it.chave, contadores);
                return (
                  <Link
                    key={it.chave}
                    href={it.href}
                    className={`sheet-item${ativo ? " ativo" : ""}`}
                    aria-current={ativo ? "page" : undefined}
                  >
                    <span className="sheet-ic">
                      <Icon name={it.icon} size={20} />
                    </span>
                    <span className="sheet-txt">
                      <b>{it.label}</b>
                      <small>{it.desc}</small>
                    </span>
                    {selo > 0 && <span className="sb-badge quente">{selo}</span>}
                    <Icon name="chevron-right" size={16} />
                  </Link>
                );
              })}
              {aberta === "mais" && (
                <button type="button" className="sheet-item sheet-sair" onClick={() => sairDoSistema(router)}>
                  <span className="sheet-ic">
                    <Icon name="power" size={20} />
                  </span>
                  <span className="sheet-txt">
                    <b>Sair</b>
                    <small>Encerrar a sessão neste aparelho</small>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
