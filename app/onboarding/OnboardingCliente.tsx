"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "../components/Logo";
import Icon from "../components/Icon";

const ETAPAS = [
  "Conectando seus dados…",
  "Carregando seus contatos…",
  "Preparando o mapa de São Paulo…",
  "Organizando suas demandas…",
  "Ativando o motor de IA…",
  "Tudo pronto.",
];

const DURACAO = 10000; // 10s de expectativa

function iniciais(nome: string) {
  const p = (nome || "").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "GP";
}

export default function OnboardingCliente({
  nome,
  candidato,
  foto,
}: {
  nome: string;
  candidato: string;
  foto: string | null;
}) {
  const router = useRouter();
  const [prog, setProg] = useState(0);
  const [etapa, setEtapa] = useState(0);
  const [pronto, setPronto] = useState(false);
  const inicio = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      if (inicio.current === null) inicio.current = t;
      const dec = Math.min(1, (t - inicio.current) / DURACAO);
      setProg(dec);
      setEtapa(Math.min(ETAPAS.length - 1, Math.floor(dec * ETAPAS.length)));
      if (dec < 1) raf = requestAnimationFrame(tick);
      else setPronto(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  async function escolher(destino: string, comTour: boolean) {
    try {
      await fetch("/api/onboarded", { method: "POST" });
    } catch {
      /* segue mesmo se falhar */
    }
    // Marca que já passou pela tela de escolhas nesta sessão do navegador.
    document.cookie = "onboarding_visto=1; path=/; SameSite=Lax";
    if (comTour) sessionStorage.setItem("tour-candpro", "1");
    router.push(destino);
    router.refresh();
  }

  const pct = Math.round(prog * 100);

  return (
    <div className="ob-wrap">
      <div className="ob-bg" />
      <div className="ob-card">
        <div className="ob-foto-col">
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ob-foto" src={foto} alt={candidato} />
          ) : (
            <div className="ob-foto ob-foto-ph" aria-hidden="true">
              <span>{iniciais(candidato)}</span>
              <i className="ob-foto-stripe" />
            </div>
          )}
          <div className="ob-foto-nome">
            {candidato}
            <span>Seu gabinete no CAND PRO</span>
          </div>
        </div>

        <div className="ob-info">
          <div className="ob-logo">
            <Logo size={26} flag />
          </div>

          <h1 className="ob-titulo">Seja bem-vindo, {nome}.</h1>
          <p className="ob-sub">
            Estamos carregando o seu sistema completo de gestão com IA
          </p>

          {!pronto ? (
            <div className="ob-load">
              <div className="ob-bar">
                <div className="ob-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="ob-bar-row">
                <span className="ob-etapa">{ETAPAS[etapa]}</span>
                <span className="ob-pct">{pct}%</span>
              </div>
            </div>
          ) : (
            <div className="ob-acoes">
              <p className="ob-pergunta">Como você prefere começar?</p>
              <button className="btn btn-primary ob-btn" onClick={() => escolher("/primeiros-passos", false)}>
                Configurar meu gabinete
              </button>
              <button className="btn ob-btn ob-btn-tour" onClick={() => escolher("/", true)}>
                <Icon name="star" size={16} /> Me mostre o sistema
              </button>
              <span className="ob-dica">
                Você e a equipe preenchem o gabinete: assistente, posicionamento e WhatsApp.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
