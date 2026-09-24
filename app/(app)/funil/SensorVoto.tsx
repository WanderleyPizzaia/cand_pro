"use client";

import { useEffect, useState } from "react";

type Comp = { chave: string; rotulo: string; valor: number; detalhe: string };
type Dados = { score: number; nivel: string; atualizadoEm: string; base: number; componentes: Comp[] };

// Temperatura do voto, do frio (azul) ao quentíssimo (vermelho), nos tons do sistema.
const COR: Record<string, string> = { Fria: "#78a2f2", Morna: "#f0b43c", Quente: "#f28a4b", "Quentíssima": "#ef6b63" };

export default function SensorVoto() {
  const [d, setD] = useState<Dados | null>(null);

  useEffect(() => {
    const puxar = () => fetch("/api/sensor", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (typeof j.score === "number") setD(j); }).catch(() => {});
    puxar();
    const t = setInterval(puxar, 15000);
    return () => clearInterval(t);
  }, []);

  if (!d) return null;
  const cor = COR[d.nivel] || "#78a2f2";

  return (
    <div className="sensor">
      <div className="sensor-medidor">
        <div className="sm-ring" style={{ background: `conic-gradient(${cor} ${d.score * 3.6}deg, var(--border) 0)` }}>
          <div className="sm-centro">
            <b>{d.score}<small>%</small></b>
            <span>propensão</span>
          </div>
        </div>
      </div>
      <div className="sensor-info">
        <div className="si-top">
          <span className="si-live"><i /> AO VIVO</span>
          <span className="si-nivel" style={{ color: cor }}>{d.nivel}</span>
        </div>
        <h3>Sensor de propensão ao voto</h3>
        <p className="si-sub">Índice por <b>engajamento e comunicação</b> com a base ({d.base.toLocaleString("pt-BR")} pessoas). Estimativa dos dados, não é pesquisa eleitoral.</p>
        <div className="si-comps">
          {d.componentes.map((c) => (
            <div className="si-comp" key={c.chave}>
              <div className="sc-lab"><span>{c.rotulo}</span><b>{c.valor}%</b></div>
              <div className="sc-bar"><i style={{ width: c.valor + "%", background: cor }} /></div>
              <small>{c.detalhe}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
