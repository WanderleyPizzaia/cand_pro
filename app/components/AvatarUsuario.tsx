"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

// Avatar do usuário logado. Clica -> abre a foto em tamanho grande (modal).
// Reaproveitado na sidebar e no dashboard. Cai para iniciais quando sem foto.
function iniciais(nome: string): string {
  const p = (nome || "").trim().split(/\s+/);
  if (p.length === 0 || !p[0]) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export default function AvatarUsuario({
  foto,
  nome,
  className = "",
  iniClassName = "",
}: {
  foto?: string | null;
  nome: string;
  className?: string;
  iniClassName?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [montado, setMontado] = useState(false);
  const temFoto = !!foto;

  useEffect(() => setMontado(true), []);

  // Trava o scroll do fundo enquanto a foto está ampliada.
  useEffect(() => {
    if (!aberto) return;
    const ant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = ant;
    };
  }, [aberto]);

  return (
    <>
      <button
        type="button"
        className="avatar-btn"
        onClick={() => temFoto && setAberto(true)}
        title={temFoto ? "Ver foto" : nome}
        aria-label={temFoto ? "Ampliar foto" : nome}
        style={{ cursor: temFoto ? "zoom-in" : "default" }}
      >
        {temFoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={className} src={foto!} alt={nome} referrerPolicy="no-referrer" />
        ) : (
          <span className={`${className} ${iniClassName}`}>{iniciais(nome)}</span>
        )}
      </button>

      {aberto &&
        temFoto &&
        montado &&
        createPortal(
          <div className="avatar-lightbox" onClick={() => setAberto(false)}>
            <div className="avatar-lightbox-inner" onClick={(e) => e.stopPropagation()}>
              <button
                className="avatar-lightbox-x"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
              >
                ✕
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto!} alt={nome} referrerPolicy="no-referrer" />
              <div className="avatar-lightbox-nome">{nome}</div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
