import type { MetadataRoute } from "next";

// Web App Manifest (PWA). Permite "Instalar app" no Chrome/Android e
// "Adicionar à Tela de Início" no Safari/iOS, com a marca CAND PRO.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CAND PRO · Campanha & Gestão",
    short_name: "CAND PRO",
    description: "Inteligência para campanha e gestão política — dados, mapa e IA no WhatsApp.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "pt-BR",
    dir: "ltr",
    background_color: "#0b0e14",
    theme_color: "#0b0e14",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/candpro.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/candpro.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
