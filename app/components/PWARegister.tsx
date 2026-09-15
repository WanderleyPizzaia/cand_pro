"use client";

import { useEffect } from "react";

// Registra o service worker no cliente. Sem isso o Chrome/Android não oferece
// a opção "Instalar app". É silencioso: não renderiza nada.
export default function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // falha de registro não pode quebrar o app
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
