"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Icon, { IconName } from "./Icon";

// Tour guiado que "dirige sozinho": navega entre as telas e mostra uma
// legenda em cada uma, avançando automaticamente. Disparado pela opção
// "Me mostre o sistema" do onboarding (flag em sessionStorage).
// Fica montado no AppShell (layout persiste entre navegações).

type Passo = { path: string; titulo: string; texto: string; icone: IconName };

const PASSOS: Passo[] = [
  { path: "/", icone: "dashboard", titulo: "Seu painel em tempo real", texto: "Cadastros, mensagens e alcance, tudo atualizando ao vivo, com os números subindo na sua frente." },
  { path: "/pessoas", icone: "users", titulo: "Sua base de contatos", texto: "Cada eleitor com foto, cidade e categoria. Filtre, edite e fale com qualquer um em um clique." },
  { path: "/mapa", icone: "map", titulo: "Mapa de votos e lideranças", texto: "Veja onde sua força está, espalhada por todo o estado de São Paulo." },
  { path: "/inbox", icone: "chat", titulo: "WhatsApp com IA", texto: "Réplica do WhatsApp dentro do sistema. A IA responde no seu tom, 24 horas por dia." },
  { path: "/tarefas", icone: "tasks", titulo: "Demandas no kanban", texto: "Organize os pedidos dos eleitores e acompanhe cada um até a resolução." },
  { path: "/", icone: "star", titulo: "Pronto para ser seu", texto: "Quando quiser, conecte o seu WhatsApp e o sistema passa a espelhar tudo ao vivo, no seu número." },
];

// Tempo de leitura por passo (contemplativo): base + proporcional ao texto.
function duracaoPasso(p: Passo): number {
  return Math.min(16000, Math.max(8000, (p.titulo.length + p.texto.length) * 95));
}

export default function TourGuiado() {
  const router = useRouter();
  const pathname = usePathname();
  const [ativo, setAtivo] = useState(false);
  const [passo, setPasso] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [pct, setPct] = useState(0); // 0..1 -> largura da barrinha de tempo

  const rafRef = useRef<number | null>(null);
  const acumuladoRef = useRef(0); // ms já decorridos (antes de pausas)
  const inicioRef = useRef(0); // performance.now() do trecho atual

  // Dispara o tour se a flag estiver setada (vinda do onboarding).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("tour-candpro") === "1") {
      sessionStorage.removeItem("tour-candpro");
      setAtivo(true);
      setPasso(0);
    }
  }, []);

  // Navega para a tela do passo atual.
  useEffect(() => {
    if (!ativo) return;
    const alvo = PASSOS[passo]?.path;
    if (alvo && alvo !== pathname) router.push(alvo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, passo]);

  // Relógio do passo: anima a barrinha e avança no fim. Pausa congela tudo.
  useEffect(() => {
    if (!ativo) return;
    const ultimo = passo === PASSOS.length - 1;
    const dur = duracaoPasso(PASSOS[passo]);

    // (re)inicia a contagem deste passo
    acumuladoRef.current = 0;
    inicioRef.current = performance.now();
    setPct(0);

    const tick = () => {
      if (pausado) return; // congela (o efeito re-roda quando despausar)
      const decorrido = acumuladoRef.current + (performance.now() - inicioRef.current);
      const fracao = Math.min(1, decorrido / dur);
      setPct(fracao);
      if (fracao >= 1) {
        // No último passo NÃO fecha sozinho: deixa o usuário assumir o controle.
        if (!ultimo) setPasso((x) => x + 1);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, passo]);

  // Pausar/continuar sem reiniciar a contagem do passo atual.
  useEffect(() => {
    if (!ativo) return;
    if (pausado) {
      // congela: guarda o quanto já decorreu e para o RAF
      acumuladoRef.current += performance.now() - inicioRef.current;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    } else {
      // retoma de onde parou
      const dur = duracaoPasso(PASSOS[passo]);
      const ultimo = passo === PASSOS.length - 1;
      inicioRef.current = performance.now();
      const tick = () => {
        if (pausado) return;
        const decorrido = acumuladoRef.current + (performance.now() - inicioRef.current);
        const fracao = Math.min(1, decorrido / dur);
        setPct(fracao);
        if (fracao >= 1) {
          if (!ultimo) setPasso((x) => x + 1);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pausado]);

  function encerrar() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setAtivo(false);
    setPausado(false);
  }

  // Quando o tour não está rodando, deixa um botão flutuante para reabrir
  // (dá para rever o tour quantas vezes quiser).
  if (!ativo) {
    return (
      <button
        className="tour-launcher"
        onClick={() => {
          setPasso(0);
          setPausado(false);
          setAtivo(true);
        }}
        title="Ver o tour guiado do sistema"
      >
        <span className="tour-launcher-ico"><Icon name="star" size={16} /></span> Me mostre o sistema
      </button>
    );
  }
  const p = PASSOS[passo];
  const ultimo = passo === PASSOS.length - 1;

  return (
    <div className="tour-cam">
      <div className="tour-spot" />
      <div className="tour-card">
        <div className="tour-emoji"><Icon name={p.icone} size={30} /></div>
        <div className="tour-corpo">
          <div className="tour-titulo">{p.titulo}</div>
          <div className="tour-texto">{p.texto}</div>
          <div className="tour-dots">
            {PASSOS.map((_, i) => (
              <span key={i} className={`tour-dot${i === passo ? " on" : ""}`} />
            ))}
          </div>
        </div>
        <div className="tour-acoes">
          {!ultimo ? (
            <>
              <button className="tour-link" onClick={encerrar}>
                Pular
              </button>
              <button className="tour-link" onClick={() => setPausado((v) => !v)}>
                {pausado ? "Continuar" : "Pausar"}
              </button>
              <button
                className="btn btn-primary tour-next"
                onClick={() => setPasso((x) => Math.min(PASSOS.length - 1, x + 1))}
              >
                Próximo →
              </button>
            </>
          ) : (
            <button className="btn btn-primary tour-next" onClick={encerrar}>
              Começar a usar →
            </button>
          )}
        </div>

        {/* Barrinha azul fininha: tempo do passo (congela ao pausar) */}
        <div className="tour-barra">
          <div
            className={`tour-barra-fill${pausado ? " pausada" : ""}`}
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
