"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

// Mantém os dados da tela atualizados em tempo real: revalida os dados do
// servidor a cada N segundos (soft refresh - preserva o estado dos formulários).
// Pausa quando a aba está em segundo plano, para economizar recursos.
export default function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds, pathname]);

  return null;
}
