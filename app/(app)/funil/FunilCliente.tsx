"use client";

import { useEffect, useState } from "react";
import CountUp from "../../components/CountUp";
import SensorVoto from "./SensorVoto";
import Icon from "../../components/Icon";

type Etapa = { chave: string; rotulo: string; desc: string; total: number };
type Meta = { minima: number; objetivo: number; atual: number };
type Dados = { candidato: string; numero: string; data: string; etapas: Etapa[]; meta?: Meta };

// Bonequinho (eleitor) — ícone SVG simples.
function Boneco() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1z" />
    </svg>
  );
}

export default function FunilCliente() {
  const [d, setD] = useState<Dados | null>(null);

  useEffect(() => {
    const puxar = () => fetch("/api/funil", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.etapas) setD(j); }).catch(() => {});
    puxar();
    const t = setInterval(puxar, 15000); // tempo real
    return () => clearInterval(t);
  }, []);

  if (!d) return <div className="map-panel">Carregando…</div>;

  const max = Math.max(1, ...d.etapas.map((e) => e.total));
  const larguras = [100, 84, 68, 54, 42]; // afunila do topo ao fundo
  const dataFmt = new Date(d.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="funil">
      <SensorVoto />
      <div className="funil-head">
        <div className="fh-urna" aria-hidden="true">
          {/* Urna eletrônica */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="8" width="18" height="13" rx="2" />
            <path d="M7 8V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" />
            <path d="M9 13h6M9 16h6" />
          </svg>
        </div>
        <div className="fh-txt">
          <b>{d.candidato}</b>
          <span>Eleição 2026 · {dataFmt}</span>
          <span className="fh-live">
            <i />
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M3 4h18l-7 8v6l-4 2v-8z" /></svg>
            AO VIVO · funil de voto
          </span>
        </div>
        {d.numero && <div className="fh-num">{d.numero}</div>}
      </div>

      {d.meta && (
        <div className="funil-meta">
          <div className="fm-top">
            <span>Meta mínima <b>{d.meta.minima.toLocaleString("pt-BR")}</b> votos · entra com margem</span>
            <span>Objetivo <b>{d.meta.objetivo.toLocaleString("pt-BR")}</b></span>
          </div>
          <div className="fm-bar">
            <i style={{ width: Math.min(100, (d.meta.atual / d.meta.objetivo) * 100) + "%" }} />
            <span className="fm-min" style={{ left: Math.min(100, (d.meta.minima / d.meta.objetivo) * 100) + "%" }} title="Meta mínima (45 mil)" />
          </div>
          <div className="fm-leg">
            <b>{d.meta.atual.toLocaleString("pt-BR")}</b> na base · {Math.round((d.meta.atual / d.meta.objetivo) * 100)}% do objetivo · faltam <b>{Math.max(0, d.meta.minima - d.meta.atual).toLocaleString("pt-BR")}</b> pra margem mínima
          </div>
        </div>
      )}

      <div className="funil-body">
        {d.etapas.map((e, i) => {
          const bonecos = Math.max(1, Math.min(14, Math.round((e.total / max) * 14)));
          return (
            <div className="funil-etapa" key={e.chave} style={{ ["--w" as string]: larguras[i] + "%", animationDelay: i * 0.12 + "s" }}>
              <div className="fe-band">
                <span className="fe-chuva" aria-hidden="true">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <span key={j} className="fc-p" style={{ left: (6 + j * 15) + "%", ["--dur" as string]: (2.2 + (j % 3) * 0.7) + "s", ["--del" as string]: (j * 0.4) + "s" }}><Boneco /></span>
                  ))}
                </span>
                <div className="fe-info">
                  <span className="fe-rotulo">{e.rotulo}</span>
                  <span className="fe-desc">{e.desc}</span>
                </div>
                <div className="fe-num"><CountUp value={e.total} /></div>
                <div className="fe-bonecos" aria-hidden="true">
                  {Array.from({ length: bonecos }).map((_, k) => (
                    <span key={k} style={{ animationDelay: (i * 0.12 + k * 0.05) + "s" }}><Boneco /></span>
                  ))}
                </div>
              </div>
              {i < d.etapas.length - 1 && <div className="fe-seta" aria-hidden="true"><Icon name="chevron-down" size={18} /></div>}
            </div>
          );
        })}
      </div>

      <a
        className="boca-urna"
        href={`https://wa.me/5511991612610?text=${encodeURIComponent(`Quero ativar a Boca de Urna Digital (disparo em massa) — campanha ${d.candidato} ${d.numero || ""}`.trim())}`}
        target="_blank"
        rel="noopener"
      >
        <div className="bu-txt">
          <span className="bu-tag com-icone"><Icon name="zap" size={12} /> Boca de Urna Digital</span>
          <b>Fazer disparo em massa</b>
          <small>Fale com o administrador e ative o disparo pra toda a base agora.</small>
        </div>
        <span className="bu-ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-3-.2-.3A8 8 0 1 1 12 20z" /></svg>
        </span>
      </a>
    </div>
  );
}
