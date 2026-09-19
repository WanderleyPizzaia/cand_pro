"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Busca ativa enquanto a tela está aberta: a cada poucos segundos pede ao
// servidor que consulte a Evolution e importe o que chegou. É o plano B do
// webhook — quando o servidor da Evolution não avisa, as mensagens aparecem
// assim mesmo. Não duplica (dedup por id da mensagem no WhatsApp).
export default function PuxarNovas({ segundos = 15 }: { segundos?: number }) {
  const router = useRouter();
  const rodando = useRef(false);
  const [falhas, setFalhas] = useState(0);

  const ciclo = useCallback(async () => {
    if (rodando.current) return;
    if (typeof document !== "undefined" && document.hidden) return; // aba em segundo plano
    rodando.current = true;
    try {
      const r = await fetch("/api/whatsapp/puxar", { method: "POST", cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setFalhas(0);
        if ((d.novas ?? 0) > 0) router.refresh();
      } else {
        setFalhas((f) => f + 1);
      }
    } catch {
      setFalhas((f) => f + 1);
    } finally {
      rodando.current = false;
    }
  }, [router]);

  useEffect(() => {
    ciclo();
    const id = setInterval(ciclo, Math.max(5, segundos) * 1000);
    return () => clearInterval(id);
  }, [ciclo, segundos]);

  // Só avisa quando está falhando de forma persistente (3 ciclos seguidos).
  if (falhas < 3) return null;
  return (
    <div style={{ fontSize: 12.5, color: "var(--yellow)", marginBottom: 8 }}>
      Não estou conseguindo buscar mensagens novas no servidor de WhatsApp.
    </div>
  );
}
