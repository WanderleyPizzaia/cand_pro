"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { abaAtiva, abasVisiveis, itemDaRota } from "./navItens";

// Abas da área atual (ex.: Conversas → Atendimento | Por número). Só aparece
// quando o item tem mais de uma tela que o perfil pode abrir.
export default function SubNav({ perfil }: { perfil: string }) {
  const path = usePathname();
  const item = itemDaRota(path);
  if (!item) return null;
  const abas = abasVisiveis(item, perfil);
  if (abas.length < 2) return null;
  const ativa = abaAtiva(abas, path);
  return (
    <nav className="subnav" aria-label={item.label}>
      {abas.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={a === ativa ? "ativo" : ""}
          aria-current={a === ativa ? "page" : undefined}
          title={a.desc}
        >
          <Icon name={a.icon} size={16} /> {a.label}
        </Link>
      ))}
    </nav>
  );
}
