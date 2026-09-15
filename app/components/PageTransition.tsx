"use client";

import { usePathname } from "next/navigation";

// Anima TODO o conteúdo da página a cada navegação (sem tela de carregamento).
// A key=pathname força remontar e reanimar ao trocar de tela.
export default function PageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-anim">
      {children}
    </div>
  );
}
