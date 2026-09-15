"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "../../components/Icon";

// Sub-navegação do candidato na área de WhatsApp: Conversas e Meu Agente.
const ITENS = [
  { href: "/inbox", label: "Conversas", icon: "chat" as const },
  { href: "/meu-agente", label: "Meu Agente", icon: "bot" as const },
  { href: "/templates", label: "Templates", icon: "chat" as const },
];

export default function CandidatoTabs() {
  const path = usePathname();
  return (
    <div className="map-tabs" style={{ marginBottom: 16 }}>
      {ITENS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`map-tab${path === i.href ? " ativo" : ""}`}
        >
          <Icon name={i.icon} size={16} /> {i.label}
        </Link>
      ))}
    </div>
  );
}
