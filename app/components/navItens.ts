import { IconName } from "./Icon";

export type NavItem = {
  href: string;
  icon: IconName;
  label: string;
  perfis: string[];
};

export const TODOS = ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO", "LIDER"];

// Quem enxerga o CRM de Atendimento: gestores + o candidato (escopado ao próprio
// número) + o próprio atendente.
export const ATENDE = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO", "ATENDENTE"];

// Navegação principal — fonte única, usada pela Sidebar (desktop) e pelo
// Dock inferior (mobile). Mesma ordem/ícones/rótulos em toda a experiência.
export const ITENS: NavItem[] = [
  { href: "/", icon: "dashboard", label: "VISÃO GERAL", perfis: TODOS },
  {
    href: "/pessoas",
    icon: "users",
    label: "CONTATOS",
    perfis: ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO", "LIDER"],
  },
  {
    href: "/pautas",
    icon: "inbox",
    label: "PAUTAS",
    perfis: ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO"],
  },
  { href: "/mapa", icon: "map", label: "MAPAS", perfis: TODOS },
  {
    href: "/matriz",
    icon: "matriz",
    label: "MATRIZ",
    perfis: ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO"],
  },
  {
    href: "/primeiros-passos",
    icon: "check",
    label: "CONFIGURAR",
    perfis: ["COORDENACAO", "CANDIDATO"],
  },
  {
    href: "/inbox",
    icon: "whatsapp",
    label: "WHATSAPP",
    perfis: ["ADMIN", "COORDENACAO", "CANDIDATO", "MARKETING"],
  },
  {
    href: "/atendimento",
    icon: "chat",
    label: "ATENDIMENTO",
    perfis: ATENDE,
  },
  { href: "/agenda", icon: "calendar", label: "AGENDA", perfis: TODOS },
  {
    href: "/tarefas",
    icon: "tasks",
    label: "TAREFAS",
    perfis: ["ADMIN", "MARKETING", "COORDENACAO"],
  },
  {
    href: "/assessoria",
    icon: "megaphone",
    label: "ASSESSORIA",
    perfis: ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO"],
  },
  {
    href: "/funil",
    icon: "funil",
    label: "FUNIL",
    perfis: ["ADMIN"], // apenas o admin master vê o Funil
  },
  {
    href: "/comunidades",
    icon: "users",
    label: "COMUNIDADES",
    perfis: ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO"],
  },
  {
    href: "/tecnologia",
    icon: "bot",
    label: "TECNOLOGIA",
    perfis: ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO"],
  },
  {
    href: "/disparos",
    icon: "megaphone",
    label: "DISPAROS",
    perfis: ["ADMIN", "COORDENACAO", "CANDIDATO"],
  },
];

export const ROTULO: Record<string, string> = {
  ADMIN: "Administrador",
  MARKETING: "Marketing",
  COORDENACAO: "Coordenação",
  CANDIDATO: "Candidato",
  LIDER: "Líder",
  ATENDENTE: "Atendente",
};

// Item ativo (mesma lógica em Sidebar e Dock): WHATSAPP cobre inbox/campanhas/agentes/meu-agente.
export function itemAtivo(href: string, path: string): boolean {
  if (href === "/") return path === "/";
  if (path.startsWith(href)) return true;
  if (
    href === "/inbox" &&
    (path.startsWith("/campanhas") ||
      path.startsWith("/agentes") ||
      path.startsWith("/meu-agente"))
  )
    return true;
  return false;
}
