"use client";

import { useEffect, useRef, useState } from "react";

// Número que anima só quando o valor MUDA (atualização ao vivo). Na abertura
// da tela ele já aparece pronto: contar do zero a cada visita era espera.
// Respeita "reduzir movimento".
export default function CountUp({
  value,
  duration = 700,
  format,
}: {
  value: number;
  duration?: number;
  // Mantido por compatibilidade com chamadas antigas (efeito cascata).
  delay?: number;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(value);
  const shown = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const from = shown.current;
    const to = value;
    if (from === to) return;
    const reduz =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduz) {
      shown.current = to;
      setDisplay(to);
      return;
    }
    let inicio: number | null = null;
    const passo = (ts: number) => {
      if (inicio === null) inicio = ts;
      const t = Math.min(1, (ts - inicio) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (to - from) * e);
      shown.current = v;
      setDisplay(v);
      if (t < 1) raf.current = requestAnimationFrame(passo);
    };
    raf.current = requestAnimationFrame(passo);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  return <>{format ? format(display) : display.toLocaleString("pt-BR")}</>;
}
