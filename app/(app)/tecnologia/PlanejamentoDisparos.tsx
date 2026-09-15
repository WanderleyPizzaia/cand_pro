"use client";

import { useEffect, useState } from "react";
import Icon, { IconName } from "../../components/Icon";

type Modelo = { eleicao: string };

const PONTOS: { rot: string; d: number; q: number; ico: IconName }[] = [
  { rot: "Aquecimento", d: 30, q: 5000, ico: "megaphone" },
  { rot: "Intensificação", d: 15, q: 10000, ico: "megaphone" },
  { rot: "Reta final", d: 7, q: 20000, ico: "megaphone" },
  { rot: "Véspera", d: 1, q: 30000, ico: "clock" },
  { rot: "Dia da votação · Boca de Urna", d: 0, q: 40000, ico: "trophy" },
];

const ACOES = [
  "Convidar amigos e familiares pra base",
  "Fazer união com parceiros e lideranças",
  "Organizar grupos da sociedade (bairro, igreja, categoria)",
  "Provocar a base com uma ativação por semana",
  "Pedir indicação: cada apoiador traz 3 contatos",
];

// Tela de PLANEJAMENTO: acessada pela equipe toda. Só operacional (volumes,
// datas, fases, metas). NENHUM valor: custo, corretagem, imposto e saldo
// ficam só na aba Financeiro (restrita).
export default function PlanejamentoDisparos() {
  const [m, setM] = useState<Modelo | null>(null);
  const [qtd, setQtd] = useState("10000");
  const [feitos, setFeitos] = useState<number[]>([]);
  const [meta, setMeta] = useState("");
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => { fetch("/api/plano-disparo").then((r) => r.json()).then((d) => { if (d.eleicao) setM({ eleicao: d.eleicao }); }).catch(() => {}); }, []);
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { try { setFeitos(JSON.parse(localStorage.getItem("plano_acoes") || "[]")); setMeta(localStorage.getItem("plano_meta") || ""); } catch {} }, []);
  function toggle(i: number) { const f = feitos.includes(i) ? feitos.filter((x) => x !== i) : [...feitos, i]; setFeitos(f); try { localStorage.setItem("plano_acoes", JSON.stringify(f)); } catch {} }
  function salvarMeta(v: string) { setMeta(v); try { localStorage.setItem("plano_meta", v); } catch {} }

  if (!m) return <div className="map-panel">Carregando…</div>;

  const eleicao = new Date(m.eleicao).getTime();
  const dias = Math.max(0, Math.ceil((eleicao - agora) / 86400000));
  const q = Math.max(0, parseInt((qtd || "0").replace(/\D/g, ""), 10) || 0);
  const metaN = Math.max(0, parseInt((meta || "0").replace(/\D/g, ""), 10) || 0);
  const dt = (dOffset: number) => new Date(eleicao - dOffset * 86400000);

  return (
    <div className="plano">
      <div className="plano-head">
        <div>
          <span className="ph-eyebrow">Régua de disparos · até a votação</span>
          <h3 style={{ margin: "4px 0 0" }}>Faltam <b>{dias}</b> dias para 04/10/2026</h3>
        </div>
      </div>

      {/* Régua horizontal: só volume e datas */}
      <div className="regua">
        {PONTOS.map((p, i) => {
          const data = dt(p.d);
          const passou = data.getTime() < agora;
          return (
            <div className={"regua-pt" + (passou ? " passou" : "")} key={i}>
              <div className="rp-ic"><Icon name={p.ico} size={16} /></div>
              <b>{p.rot}</b>
              <span className="rp-data">{data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
              <span className="rp-q">{p.q.toLocaleString("pt-BR")} disparos</span>
            </div>
          );
        })}
      </div>

      <div className="plano-grid">
        <div className="map-panel">
          <h3>Planejar volume</h3>
          <div className="field"><label>Quantidade de disparos</label><input inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} /></div>
          <div className="plano-total">
            <span>Volume planejado</span>
            <b>{q.toLocaleString("pt-BR")} disparos</b>
          </div>
        </div>

        <div className="map-panel">
          <h3>Metas e ativação da base</h3>
          <div className="field"><label>Meta de disparos desta semana</label><input inputMode="numeric" placeholder="Ex.: 5000" value={meta} onChange={(e) => salvarMeta(e.target.value)} /></div>
          {metaN > 0 && <div className="plano-saldo-aviso" style={{ marginBottom: 12 }}>Meta da semana: <b>{metaN.toLocaleString("pt-BR")}</b> disparos</div>}
          <div className="plano-acoes">
            {ACOES.map((a, i) => (
              <label key={i} className={"plano-acao" + (feitos.includes(i) ? " ok" : "")}>
                <input type="checkbox" checked={feitos.includes(i)} onChange={() => toggle(i)} />
                <span>{a}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
