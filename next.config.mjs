/** @type {import('next').NextConfig} */
const nextConfig = {
  // O sistema não usa next/image. Desligar o otimizador fecha a superfície de
  // ataque do endpoint /_next/image (falhas de RCE/DoS ainda abertas na 14.x).
  images: { unoptimized: true },
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3", "ffmpeg-static"],
    // Garante que o binário estático do ffmpeg vá junto nas funções de API
    // que convertem áudio (WebM -> OGG/Opus) antes de enviar para a Meta.
    outputFileTracingIncludes: {
      "/api/**": ["./node_modules/ffmpeg-static/ffmpeg"],
    },
  },
};

export default nextConfig;
