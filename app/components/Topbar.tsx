"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import Logo from "./Logo";
import Notificacoes from "./Notificacoes";
import { areaDaRota, itemDaRota } from "./navItens";
import { rotuloContagem } from "./eleicao";

// Selo de contagem até a votação. Some quando as urnas abrem.
function Contagem() {
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => {
    setAgora(Date.now());
    const id = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (agora == null) return null;
  const longo = rotuloContagem(agora);
  const curto = rotuloContagem(agora, true);
  if (!longo) return null;
  return (
    <span className="tb-contagem" title="Contagem até a votação do 1º turno (4/10, urnas às 8h)">
      <Icon name="flag" size={13} />
      <span className="tb-contagem-longo">{longo}</span>
      <span className="tb-contagem-curto">{curto}</span>
    </span>
  );
}

// Barra superior: onde estou (desktop), marca (celular), contagem, busca e sino.
export default function Topbar({ onBusca }: { onBusca: () => void }) {
  const path = usePathname();
  const area = areaDaRota(path);
  const item = itemDaRota(path);
  const mostraTrilha = area && item && area.chave !== "inicio";

  return (
    <header className="topbar">
      <Link href="/" className="tb-logo" aria-label="CAND PRO, início">
        <Logo size={16} />
      </Link>
      {mostraTrilha && (
        <div className="tb-trilha" aria-label="Você está em">
          <span>{area!.titulo}</span>
          <Icon name="chevron-right" size={14} />
          <b>{item!.label}</b>
        </div>
      )}
      <div className="tb-acoes">
        <Contagem />
        <button type="button" className="tb-btn tb-busca" onClick={onBusca} aria-label="Buscar">
          <Icon name="search" size={19} />
        </button>
        <Notificacoes />
      </div>
    </header>
  );
}
