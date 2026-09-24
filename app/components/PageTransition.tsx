"use client";

import { usePathname } from "next/navigation";

// Entrada curta a cada troca de tela (150 ms, só opacidade). Numa ferramenta
// aberta o dia inteiro, a animação não pode virar espera.
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
