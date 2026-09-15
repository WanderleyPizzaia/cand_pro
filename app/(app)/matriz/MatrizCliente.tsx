"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CRITERIOS, ESCALA, calcular, quadrante } from "@/lib/matriz";

type Pos = { economico: number; social: number };

// Geometria do compasso.
const VB = 320;
const C = 160;
const UNIT = 14; // px por unidade (-10..10 -> 140px de cada lado)
const toX = (econ: number) => C + econ * UNIT;
const toY = (soc: number) => C - soc * UNIT; // +social = cima

export default function MatrizCliente() {
  const [candidato, setCandidato] = useState("");
  const [pos, setPos] = useState<Pos | null>(null);
  const [origem, setOrigem] = useState<string>("");
  const [justificativa, setJustificativa] = useState<string>("");
  const [atualizado, setAtualizado] = useState<string>("");
  const [temPersona, setTemPersona] = useState(false);
  const [respostas, setRespostas] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [calibrando, setCalibrando] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  async function carregar() {
    try {
      const r = await fetch("/api/matriz");
      const j = await r.json();
      if (!r.ok) {
        setMsg(j.erro || "Falha ao carregar.");
        return;
      }
      setCandidato(j.candidato || "");
      setTemPersona(!!j.temPersona);
      if (j.posicao) {
        setPos({ economico: j.posicao.economico, social: j.posicao.social });
        setOrigem(j.posicao.origem || "");
        setJustificativa(j.posicao.justificativa || "");
        setAtualizado(j.posicao.atualizado_em || "");
        if (j.posicao.respostas && typeof j.posicao.respostas === "object") setRespostas(j.posicao.respostas);
      }
    } catch {
      setMsg("Falha ao carregar.");
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  // Prévia ao vivo do questionário (não salva até clicar).
  const preview = useMemo(() => calcular(respostas), [respostas]);
  const respondidas = CRITERIOS.filter((c) => typeof respostas[c.id] === "number").length;

  async function salvarQuestionario() {
    setSalvando(true);
    setMsg("");
    try {
      const r = await fetch("/api/matriz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "salvar", respostas }),
      });
      const j = await r.json();
      if (r.ok) {
        setPos({ economico: j.economico, social: j.social });
        setOrigem("questionario");
        setJustificativa("");
        setMsg("Posição calculada e salva.");
      } else setMsg(j.erro || "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function calibrarIA() {
    setCalibrando(true);
    setMsg("");
    try {
      const r = await fetch("/api/matriz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "calibrar" }),
      });
      const j = await r.json();
      if (r.ok) {
        setPos({ economico: j.economico, social: j.social });
        setOrigem("ia");
        setJustificativa(j.justificativa || "");
        setMsg("Calibrado pela IA a partir da persona do candidato.");
      } else setMsg(j.erro || "Falha na calibragem.");
    } finally {
      setCalibrando(false);
    }
  }

  async function salvarManual(economico: number, social: number) {
    setPos({ economico, social });
    setOrigem("manual");
    setJustificativa("");
    try {
      await fetch("/api/matriz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "salvar", economico, social }),
      });
      setMsg("Posição ajustada manualmente no mapa.");
    } catch {
      /* mantém local mesmo se falhar */
    }
  }

  function clicarMapa(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * VB;
    const py = ((e.clientY - rect.top) / rect.height) * VB;
    const econ = Math.max(-10, Math.min(10, Math.round(((px - C) / UNIT) * 10) / 10));
    const soc = Math.max(-10, Math.min(10, Math.round(((C - py) / UNIT) * 10) / 10));
    salvarManual(econ, soc);
  }

  const rotuloOrigem: Record<string, string> = {
    questionario: "por questionário",
    ia: "calibrado pela IA",
    manual: "ajuste manual",
  };

  return (
    <div className="matriz-wrap">
      {/* Mapa */}
      <div className="form-card matriz-card">
        <div className="matriz-topo">
          <div>
            <div className="matriz-cand">{candidato || "Seu gabinete"}</div>
            {pos ? (
              <div className="matriz-quad">
                {quadrante(pos.economico, pos.social)}
                <span>
                  {" "}· Econômico {pos.economico > 0 ? "+" : ""}{pos.economico} · Social {pos.social > 0 ? "+" : ""}{pos.social}
                </span>
              </div>
            ) : (
              <div className="matriz-quad" style={{ color: "var(--muted)" }}>Sem posição ainda</div>
            )}
            {origem && <div className="matriz-origem">{rotuloOrigem[origem] || origem}{atualizado ? ` · ${atualizado}` : ""}</div>}
          </div>
          <button className="btn" onClick={calibrarIA} disabled={calibrando || !temPersona} title={temPersona ? "" : "Treine a persona do agente para habilitar"}>
            {calibrando ? "Calibrando…" : "Calibrar pela IA"}
          </button>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB} ${VB}`}
          className="matriz-svg"
          onClick={clicarMapa}
          role="img"
          aria-label="Compasso político de dois eixos"
        >
          {/* quadrantes */}
          <rect x="20" y="20" width="140" height="140" className="q q-el-aut" />
          <rect x="160" y="20" width="140" height="140" className="q q-dir-con" />
          <rect x="20" y="160" width="140" height="140" className="q q-el-lib" />
          <rect x="160" y="160" width="140" height="140" className="q q-dir-lib" />
          {/* grade */}
          {[-10, -5, 5, 10].map((g) => (
            <line key={"vx" + g} x1={toX(g)} y1="20" x2={toX(g)} y2="300" className="grid" />
          ))}
          {[-10, -5, 5, 10].map((g) => (
            <line key={"hy" + g} x1="20" y1={toY(g)} x2="300" y2={toY(g)} className="grid" />
          ))}
          {/* eixos */}
          <line x1="20" y1={C} x2="300" y2={C} className="axis" />
          <line x1={C} y1="20" x2={C} y2="300" className="axis" />
          {/* rótulos */}
          <text x="24" y={C - 6} className="lbl">Esquerda</text>
          <text x="296" y={C - 6} className="lbl" textAnchor="end">Direita</text>
          <text x={C} y="16" className="lbl" textAnchor="middle">Autoritário / Conservador</text>
          <text x={C} y="312" className="lbl" textAnchor="middle">Libertário / Progressista</text>
          {/* posição */}
          {pos && (
            <g>
              <circle cx={toX(pos.economico)} cy={toY(pos.social)} r="18" className="pt-halo" />
              <circle cx={toX(pos.economico)} cy={toY(pos.social)} r="7" className="pt" />
            </g>
          )}
        </svg>
        <div className="matriz-dica">Clique no mapa para ajustar a posição manualmente.</div>
        {msg && <div className="matriz-msg">{msg}</div>}
      </div>

      {/* Questionário */}
      <div className="form-card matriz-form">
        <div className="matriz-form-topo">
          <h3 style={{ margin: 0 }}>Critérios ({respondidas}/{CRITERIOS.length})</h3>
          <div className="matriz-preview">
            Prévia: Econ {preview.economico > 0 ? "+" : ""}{preview.economico} · Soc {preview.social > 0 ? "+" : ""}{preview.social}
          </div>
        </div>

        {(["economico", "social"] as const).map((eixo) => (
          <div key={eixo} className="matriz-grupo">
            <div className="matriz-grupo-tit">{eixo === "economico" ? "Econômico" : "Social"}</div>
            {CRITERIOS.filter((c) => c.eixo === eixo).map((c) => (
              <div key={c.id} className="matriz-q">
                <div className="matriz-q-txt">{c.texto}</div>
                <div className="matriz-likert">
                  {ESCALA.map((op) => (
                    <button
                      key={op.v}
                      className={`lk ${respostas[c.id] === op.v ? "on" : ""}`}
                      onClick={() => setRespostas((rs) => ({ ...rs, [c.id]: op.v }))}
                      title={op.r}
                      type="button"
                    >
                      {op.v > 0 ? "+" + op.v : op.v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}

        <div className="actions" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={salvarQuestionario} disabled={salvando || respondidas === 0}>
            {salvando ? "Salvando…" : "Calcular e salvar posição"}
          </button>
        </div>
      </div>
    </div>
  );
}
