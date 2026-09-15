"use client";

import { useEffect, useRef, useState } from "react";

// Contador animado: na montagem anima do 0 até o valor (cada troca de tela
// remonta via PageTransition, então re-anima). Em atualizações ao vivo, anima do
// valor anterior até o novo. Usado nos indicadores em todas as telas.
export default function CountUp({
  value,
  duration = 900,
  delay = 0,
  format,
}: {
  value: number;
  duration?: number;
  // Atraso antes de começar — usado para o efeito cascata (stagger) em fileira.
  delay?: number;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const timRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    let inicio: number | null = null;
    const passo = (ts: number) => {
      if (inicio === null) inicio = ts;
      const t = Math.min(1, (ts - inicio) / duration);
      // easeOutCubic
      const e = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * e));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(passo);
      } else {
        fromRef.current = to;
      }
    };
    const arrancar = () => {
      rafRef.current = requestAnimationFrame(passo);
    };
    if (delay > 0) timRef.current = setTimeout(arrancar, delay);
    else arrancar();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timRef.current) clearTimeout(timRef.current);
      fromRef.current = to;
    };
  }, [value, duration, delay]);

  return <>{format ? format(display) : display.toLocaleString("pt-BR")}</>;
}
