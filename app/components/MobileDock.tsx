"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Icon from "./Icon";
import { ITENS, itemAtivo } from "./navItens";

// Dock inferior (mobile) estilo Apple: substitui a sidebar no celular.
// Mesma ordem/ícones da navegação (fonte única em navItens.ts). O item da tela
// atual fica em destaque (magnify) e é centralizado. Catraca sonora leve ao
// deslizar (falha em silêncio). Respeita prefers-reduced-motion.
export default function MobileDock({ perfil }: { perfil: string }) {
  const path = usePathname();
  const router = useRouter();
  const trackRef = useRef<HTMLDivElement>(null);
  const acRef = useRef<AudioContext | null>(null);
  const ultimoIdxRef = useRef<number>(-1);

  const visiveis = ITENS.filter((i) => i.perfis.includes(perfil));
  const ativoIdx = Math.max(0, visiveis.findIndex((i) => itemAtivo(i.href, path)));

  // Centraliza o item ativo ao entrar e ao trocar de tela.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const el = track.children[ativoIdx] as HTMLElement | undefined;
    if (!el) return;
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const alvo = el.offsetLeft - (track.clientWidth - el.clientWidth) / 2;
    track.scrollTo({ left: alvo, behavior: reduz ? "auto" : "smooth" });
    ultimoIdxRef.current = ativoIdx;
  }, [ativoIdx]);

  // Catraca: clique curtíssimo ao passar de um item para outro no scroll.
  function catraca() {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      let ac = acRef.current;
      if (!ac) {
        ac = new (window.AudioContext || (window as any).webkitAudioContext)();
        acRef.current = ac;
      }
      if (ac.state === "suspended") ac.resume();
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "square";
      osc.frequency.value = 1050;
      g.gain.value = 0.06;
      osc.connect(g);
      g.connect(ac.destination);
      const t = ac.currentTime;
      osc.start(t);
      osc.stop(t + 0.011);
    } catch {
      /* som é enfeite */
    }
  }

  function onScroll() {
    const track = trackRef.current;
    if (!track || !track.children.length) return;
    const largura = (track.children[0] as HTMLElement).clientWidth || 1;
    const idx = Math.round(track.scrollLeft / largura);
    if (idx !== ultimoIdxRef.current) {
      ultimoIdxRef.current = idx;
      catraca();
    }
  }

  return (
    <nav
      className="mobile-dock"
      role="navigation"
      aria-label="Navegação"
      onTouchStart={() => {
        // Autoplay policy: libera o áudio no 1º toque.
        try {
          if (!acRef.current) {
            acRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          }
          acRef.current?.resume?.();
        } catch {
          /* ignore */
        }
      }}
    >
      <div className="mobile-dock-track" ref={trackRef} onScroll={onScroll}>
        {visiveis.map((i) => (
          <button
            key={i.href}
            className={`mobile-dock-item${itemAtivo(i.href, path) ? " active" : ""}`}
            onClick={() => {
              catraca();
              router.push(i.href);
            }}
            aria-current={itemAtivo(i.href, path) ? "page" : undefined}
          >
            <Icon name={i.icon} size={19} />
            <span>{i.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
