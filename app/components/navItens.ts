import { IconName } from "./Icon";

// ============================================================
// Navegação — fonte única da casca (menu lateral, barra do celular,
// busca Ctrl K e abas de cada área).
//
// Organização: Início + 4 áreas (Base, WhatsApp, Gabinete, Ajustes).
// Cada item pode ter ABAS (telas irmãs). As permissões espelham o
// `redirect` de cada page.tsx: ninguém vê link que dá "acesso negado".
// ============================================================

export type Aba = {
  href: string;
  label: string;
  icon: IconName;
  perfis: string[];
  desc?: string;
};

export type ItemMenu = {
  chave: string;
  label: string;
  icon: IconName;
  desc: string;
  // Telas que compõem o item. O link do menu vai para a 1ª que o perfil pode ver.
  abas: Aba[];
  // Outras rotas que também acendem este item (ex.: /cadastro em Contatos).
  extras?: string[];
};

export type Area = {
  chave: "inicio" | "base" | "whatsapp" | "gabinete" | "ajustes";
  titulo: string;
  icon: IconName;
  itens: ItemMenu[];
};

const ADMIN = "ADMIN";
const COORD = "COORDENACAO";
const MKT = "MARKETING";
const CAND = "CANDIDATO";
const LIDER = "LIDER";
const ATEND = "ATENDENTE";

export const TODOS = [ADMIN, MKT, COORD, CAND, LIDER];
export const GESTAO = [ADMIN, COORD, MKT, CAND];

export const AREAS: Area[] = [
  {
    chave: "inicio",
    titulo: "Início",
    icon: "dashboard",
    itens: [
      {
        chave: "inicio",
        label: "Início",
        icon: "dashboard",
        desc: "O que precisa de você agora e os números do dia",
        abas: [{ href: "/", label: "Início", icon: "dashboard", perfis: TODOS }],
      },
    ],
  },
  {
    chave: "base",
    titulo: "Base",
    icon: "users",
    itens: [
      {
        chave: "contatos",
        label: "Contatos",
        icon: "users",
        desc: "Eleitores, lideranças e apoiadores",
        abas: [{ href: "/pessoas", label: "Contatos", icon: "users", perfis: [ADMIN, MKT, COORD, CAND, LIDER] }],
        extras: ["/cadastro"],
      },
      {
        chave: "mapas",
        label: "Mapas",
        icon: "map",
        desc: "Votos e lideranças por cidade",
        abas: [
          { href: "/mapa", label: "Mapa de votos", icon: "map", perfis: TODOS },
          { href: "/mapa/liderancas", label: "Lideranças", icon: "star", perfis: TODOS },
        ],
      },
      {
        chave: "comunidades",
        label: "Comunidades",
        icon: "chats",
        desc: "Grupos e comunidades do WhatsApp",
        abas: [{ href: "/comunidades", label: "Comunidades", icon: "chats", perfis: GESTAO }],
      },
      {
        chave: "matriz",
        label: "Matriz política",
        icon: "matriz",
        desc: "Posicionamento do candidato",
        abas: [{ href: "/matriz", label: "Matriz política", icon: "matriz", perfis: GESTAO }],
      },
      {
        chave: "funil",
        label: "Funil",
        icon: "funil",
        desc: "Do alcance ao voto confirmado",
        abas: [{ href: "/funil", label: "Funil", icon: "funil", perfis: [ADMIN] }],
      },
    ],
  },
  {
    chave: "whatsapp",
    titulo: "WhatsApp",
    icon: "whatsapp",
    itens: [
      {
        chave: "conversas",
        label: "Conversas",
        icon: "chat",
        desc: "Fila da equipe e caixa de cada número",
        abas: [
          {
            href: "/atendimento",
            label: "Atendimento",
            icon: "chat",
            perfis: [ADMIN, COORD, MKT, CAND, ATEND],
            desc: "Fila da equipe, distribuída entre atendentes",
          },
          {
            href: "/inbox",
            label: "Por número",
            icon: "whatsapp",
            perfis: GESTAO,
            desc: "Caixa de entrada de cada número",
          },
        ],
      },
      {
        chave: "disparos",
        label: "Disparos",
        icon: "send",
        desc: "Envio em massa, campanhas e planejamento",
        abas: [
          { href: "/disparos", label: "Novo disparo", icon: "send", perfis: [ADMIN, COORD, CAND] },
          { href: "/campanhas", label: "Campanhas", icon: "megaphone", perfis: [ADMIN, COORD] },
          { href: "/disparos/planejamento", label: "Planejamento", icon: "flag", perfis: GESTAO },
        ],
      },
      {
        chave: "agentes",
        label: "Agentes de IA",
        icon: "bot",
        desc: "Quem responde no WhatsApp e como",
        abas: [
          { href: "/agentes", label: "Agentes", icon: "bot", perfis: [ADMIN, COORD] },
          { href: "/meu-agente", label: "Meu agente", icon: "bot", perfis: [CAND] },
        ],
      },
      {
        chave: "modelos",
        label: "Modelos e listas",
        icon: "file-text",
        desc: "Mensagens prontas e listas de envio",
        abas: [
          { href: "/templates", label: "Modelos", icon: "file-text", perfis: [ADMIN, CAND] },
          { href: "/listas", label: "Listas", icon: "list", perfis: [ADMIN, COORD, CAND] },
        ],
      },
    ],
  },
  {
    chave: "gabinete",
    titulo: "Gabinete",
    icon: "flag",
    itens: [
      {
        chave: "pautas",
        label: "Pautas",
        icon: "inbox",
        desc: "Pedidos e denúncias da população",
        abas: [{ href: "/pautas", label: "Pautas", icon: "inbox", perfis: GESTAO }],
      },
      {
        chave: "tarefas",
        label: "Tarefas",
        icon: "tasks",
        desc: "Demandas da equipe",
        abas: [{ href: "/tarefas", label: "Tarefas", icon: "tasks", perfis: [ADMIN, MKT, COORD] }],
      },
      {
        chave: "assessoria",
        label: "Assessoria",
        icon: "newspaper",
        desc: "Imprensa, crise e posicionamento",
        abas: [{ href: "/assessoria", label: "Assessoria", icon: "newspaper", perfis: GESTAO }],
      },
      {
        chave: "agenda",
        label: "Agenda",
        icon: "calendar",
        desc: "Compromissos da campanha",
        abas: [{ href: "/agenda", label: "Agenda", icon: "calendar", perfis: TODOS }],
      },
    ],
  },
  {
    chave: "ajustes",
    titulo: "Ajustes",
    icon: "settings",
    itens: [
      {
        chave: "configurar",
        label: "Configurar gabinete",
        icon: "check",
        desc: "Passo a passo para deixar tudo pronto",
        abas: [{ href: "/primeiros-passos", label: "Configurar gabinete", icon: "check", perfis: [COORD, CAND] }],
      },
      {
        chave: "tecnologia",
        label: "Tecnologia",
        icon: "cpu",
        desc: "Discurso e financeiro da operação",
        abas: [{ href: "/tecnologia", label: "Tecnologia", icon: "cpu", perfis: GESTAO }],
      },
      {
        chave: "configuracoes",
        label: "Configurações",
        icon: "settings",
        desc: "Usuários, integrações e cargos",
        abas: [{ href: "/configuracoes", label: "Configurações", icon: "settings", perfis: [ADMIN] }],
        extras: ["/usuarios"],
      },
      {
        chave: "conta",
        label: "Minha conta",
        icon: "user",
        desc: "Senha e dados de acesso",
        abas: [{ href: "/conta", label: "Minha conta", icon: "user", perfis: [...TODOS, ATEND] }],
      },
    ],
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

// ----- Filtragem por perfil -----

export function abasVisiveis(item: ItemMenu, perfil: string): Aba[] {
  return item.abas.filter((a) => a.perfis.includes(perfil));
}

export type ItemVisivel = ItemMenu & { href: string; visiveis: Aba[] };

export function itensVisiveis(area: Area, perfil: string): ItemVisivel[] {
  const out: ItemVisivel[] = [];
  for (const it of area.itens) {
    const vis = abasVisiveis(it, perfil);
    if (vis.length) out.push({ ...it, href: vis[0].href, visiveis: vis });
  }
  return out;
}

export function areasVisiveis(perfil: string) {
  return AREAS.map((a) => ({ ...a, visiveis: itensVisiveis(a, perfil) })).filter(
    (a) => a.visiveis.length > 0
  );
}

// ----- Rota ativa -----

function casa(href: string, path: string): boolean {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(href + "/");
}

// Aba ativa: a de href mais longo que casa com a rota (ex.: /disparos/planejamento
// vence /disparos).
export function abaAtiva(abas: Aba[], path: string): Aba | null {
  let melhor: Aba | null = null;
  for (const a of abas) {
    if (casa(a.href, path) && (!melhor || a.href.length > melhor.href.length)) melhor = a;
  }
  return melhor;
}

export function itemAtivo(item: ItemMenu, path: string): boolean {
  if (abaAtiva(item.abas, path)) return true;
  return (item.extras || []).some((e) => casa(e, path));
}

export function areaDaRota(path: string): Area | null {
  for (const a of AREAS) if (a.itens.some((i) => itemAtivo(i, path))) return a;
  return null;
}

export function itemDaRota(path: string): ItemMenu | null {
  for (const a of AREAS) for (const i of a.itens) if (itemAtivo(i, path)) return i;
  return null;
}
