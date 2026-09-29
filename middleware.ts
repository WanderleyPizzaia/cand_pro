import { NextRequest, NextResponse } from "next/server";

// Gating grosseiro: exige a presenca do cookie de sessao para as rotas do app.
// A verificacao criptografica (HMAC) acontece no servidor (layout/rotas).
const PUBLICAS = [
  "/login",
  "/api/auth/login",
  // Vitrine institucional (pitch para decisores) - acesso público, sem login.
  "/candpro",
  "/form",
  "/api/form",
  // Acolhimento de pauta público (sem login): página e API por slug do gabinete.
  // Barra final para NÃO casar o backoffice interno /pautas e /api/pautas.
  "/pauta/",
  "/api/pauta/",
  "/api/whatsapp",
  // Webhook do BTG (confirmação de PIX cash-in): sem cookie, protegido por token opcional.
  "/api/pagamento/btg/webhook",
  // Callback do n8n (disparo em massa): sem cookie de sessão, protegido por token.
  "/api/campanhas/callback",
  // Agendador de disparos chamado pelo cron-job.org: sem cookie, protegido por token.
  "/api/campanhas/agendador",
  // Resposta da IA orquestrada pelo n8n (Tarefa B): sem cookie, protegido por token.
  "/api/agente/responder",
];

// Atendente só trabalha no Atendimento. Tudo fora desta lista volta para a
// fila (telas) ou é negado (APIs), inclusive telas e rotas criadas no futuro.
const ATENDENTE_TELAS = ["/atendimento", "/conta"];
const ATENDENTE_APIS = [
  "/api/atendimento",
  "/api/respostas",
  "/api/notificacoes",
  "/api/contadores",
  "/api/conta/",
  "/api/auth/",
  "/api/onboarded",
  // Só o arquivo em si (imagem/PDF mandado na conversa), não a gestão da galeria.
  "/api/galeria/",
];

// Perfil gravado no cookie. A assinatura NÃO é conferida aqui (o middleware
// roda no edge, sem o segredo): é conferida no servidor em toda tela e rota.
// Serve só para NEGAR: quem altera o perfil do cookie para fugir desta trava
// quebra a assinatura e é recusado lá.
function perfilDoCookie(valor: string): string | null {
  try {
    const b64 = valor.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64))?.perfil ?? null;
  } catch {
    return null;
  }
}

const casa = (pathname: string, lista: string[]) =>
  lista.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/"));

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const cookie = req.cookies.get("sessao")?.value;
  const temCookie = !!cookie;

  const ehPublica = PUBLICAS.some((p) => pathname.startsWith(p));

  if (!temCookie && !ehPublica) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (temCookie && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (cookie && !ehPublica && perfilDoCookie(cookie) === "ATENDENTE") {
    if (pathname.startsWith("/api/")) {
      if (!casa(pathname, ATENDENTE_APIS))
        return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
    } else if (!casa(pathname, ATENDENTE_TELAS)) {
      const url = req.nextUrl.clone();
      url.pathname = "/atendimento";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Protege tudo, menos assets internos do Next, arquivos estaticos e os
  // arquivos do PWA (manifest, icones, service worker) - que precisam ficar
  // publicos para a instalacao funcionar mesmo antes do login.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)",
  ],
};
