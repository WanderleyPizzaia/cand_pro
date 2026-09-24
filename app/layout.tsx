import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { IBM_Plex_Mono, IBM_Plex_Sans, Montserrat } from "next/font/google";
// Leaflet primeiro: as regras do sistema (ex.: fundo do mapa) vêm depois e vencem.
import "leaflet/dist/leaflet.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/shell.css";
import "./styles/telas.css";
import "./styles/modulos.css";
import "./styles/publico.css";
import PWARegister from "./components/PWARegister";

// Fontes self-hosted pelo Next (sem @import bloqueante, sem layout shift).
// Plex Sans é a fonte de interface (mais estreita: cabe mais por linha);
// Montserrat fica para a marca, títulos e números grandes; Plex Mono para
// telefones, códigos e números alinhados.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-plex-mono",
});
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  applicationName: "CAND PRO",
  title: "CAND PRO · Campanha & Gestão",
  description: "Inteligência para campanha e gestão política — dados, mapa e IA no WhatsApp.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/candpro.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/icons/candpro.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/candpro.svg" }],
  },
  // Tags que o iOS/Safari usa para "Adicionar à Tela de Início".
  appleWebApp: {
    capable: true,
    title: "CAND PRO",
    statusBarStyle: "black-translucent",
  },
};

// Zoom liberado: quem precisa ampliar (vista cansada, número pequeno na rua)
// consegue com os dedos. O zoom por duplo toque segue desligado pelo
// `touch-action: manipulation` do CSS, então a sensação de app continua.
export const viewport: Viewport = {
  themeColor: "#0c0e12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${plexSans.variable} ${plexMono.variable} ${montserrat.variable}`}
    >
      <head>
        {/* Captura o evento de instalação do Chrome o mais cedo possível
            (ele dispara antes do React montar). Guarda em window.__bip para
            o botão "Instalar app" conseguir instalar direto. */}
        <Script id="bip-capture" strategy="beforeInteractive">
          {`window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bip=e;window.dispatchEvent(new Event('bip-ready'));});window.addEventListener('appinstalled',function(){window.__bip=null;});`}
        </Script>
      </head>
      <body>
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
