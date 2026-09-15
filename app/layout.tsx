import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Montserrat } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import PWARegister from "./components/PWARegister";

// Fonte self-hosted pelo Next (sem @import bloqueante, sem layout shift).
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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

export const viewport: Viewport = {
  themeColor: "#0b0e14",
  width: "device-width",
  initialScale: 1,
  // Bloqueia o zoom (pinça e duplo-toque) - comportamento de app.
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={montserrat.variable}>
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
