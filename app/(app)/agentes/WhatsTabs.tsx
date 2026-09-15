"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { IconName } from "../../components/Icon";

export default function WhatsTabs() {
  const path = usePathname();
  const item = (href: string, icon: IconName, label: string) => (
    <Link href={href} className={`map-tab${path === href ? " ativo" : ""}`}>
      <Icon name={icon} size={16} /> {label}
    </Link>
  );
  return (
    <div className="map-tabs">
      {item("/inbox", "chat", "Conversas")}
      {item("/agentes", "bot", "Agentes")}
      {item("/templates", "message", "Templates")}
      {item("/listas", "users", "Listas")}
      {item("/campanhas", "megaphone", "Campanhas")}
    </div>
  );
}
