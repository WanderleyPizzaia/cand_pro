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
  // Resposta da IA orquestrada pelo n8n (Tarefa B): sem cookie, protegido por token.
  "/api/agente/responder",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const temCookie = !!req.cookies.get("sessao")?.value;

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
