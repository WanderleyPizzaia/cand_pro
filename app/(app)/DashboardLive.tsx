"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DashboardData, CandidatoStat, SerieContatos } from "@/lib/dashboard";
import type { MetaProgresso, Metrica } from "@/lib/metas";
import type { Perfil } from "@/lib/auth";
import CountUp from "../components/CountUp";
import Icon from "../components/Icon";

type Janela = "hoje" | "d7" | "d15" | "d30";
const ABAS: { chave: Janela; rotulo: string }[] = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "d7", rotulo: "7 dias" },
  { chave: "d15", rotulo: "15 dias" },
  { chave: "d30", rotulo: "30 dias" },
];

// Rótulos das métricas (redeclarados no client p/ não puxar o módulo server de metas).
const METRICA_ROTULO: Record<Metrica, string> = {
  cadastros: "Cadastros na base",
  alcance: "Contatos alcançados",
  mensagens: "Mensagens enviadas",
  respostas: "Contatos que responderam",
};

function fmtTempo(seg: number | null): string {
  if (seg == null) return "-";
  if (seg < 60) return `${seg}s`;
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const nf = (n: number) => n.toLocaleString("pt-BR");

export default function DashboardLive({
  inicial,
  perfil,
}: {
  inicial: DashboardData;
  perfil: Perfil;
}) {
  const [data, setData] = useState<DashboardData>(inicial);
  const [janela, setJanela] = useState<Janela>("hoje");
  const [vivo, setVivo] = useState(true);
  const podeGerir = perfil === "ADMIN" || perfil === "COORDENACAO";

  const buscar = async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const r = await fetch("/api/dashboard", { cache: "no-store" });
      if (!r.ok) return;
      setData((await r.json()) as DashboardData);
      setVivo(true);
    } catch {
      setVivo(false);
    }
  };

  // Real time: re-busca os indicadores a cada 15s (pausa com a aba oculta).
  useEffect(() => {
    const id = setInterval(buscar, 15000);
    return () => clearInterval(id);
  }, []);

  const ehCandidato = data.escopo === "candidato";

  return (
    <>
      {/* ===== Indicadores principais ===== */}
      <div className="kpis">
        <Link href="/pessoas" className="kpi kpi-link kpi-destaque">
          <div className="label">
            <span className="kpi-live"><span className="kpi-live-dot" />AO VIVO</span> Contatos na base
          </div>
          <div className="value accent">
            <CountUp value={data.totalCadastros} delay={0} />
          </div>
          <div className="kpi-go">Ver contatos →</div>
        </Link>
        <Link href={ehCandidato ? "/inbox" : "/agentes"} className="kpi kpi-link">
          <div className="label">{ehCandidato ? "Seus números" : "Números de WhatsApp"}</div>
          <div className="value">
            <CountUp value={data.whats.total} delay={120} />
          </div>
          <div className="kpi-sub">
            <span className={data.whats.conectados ? "stat-on" : "stat-off"}>
              ● {data.whats.conectados} conectado{data.whats.conectados === 1 ? "" : "s"}
            </span>
          </div>
        </Link>
        <Link href="/inbox" className="kpi kpi-link">
          <div className="label">Mensagens (WhatsApp)</div>
          <div className="value">
            <CountUp value={data.metricas.mensagens} delay={240} />
          </div>
          <div className="kpi-sub">
            ↓ {nf(data.metricas.entrada)} recebidas · ↑ {nf(data.metricas.saida)} enviadas
          </div>
        </Link>
        <Link href="/atendimento" className="kpi kpi-link">
          <div className="label">Tempo médio de resposta</div>
          <div className="value">{fmtTempo(data.metricas.tempoRespMedioSeg)}</div>
          <div className="kpi-sub">primeira resposta · últimos 30 dias</div>
        </Link>
      </div>

      {/* ===== CONTAGEM REGRESSIVA + RELÓGIO DE BRASÍLIA (ao vivo) ===== */}
      <div className="cd-band">
        <ContagemRegressiva />
        <RelogioBrasilia />
      </div>

      {/* ===== CONTATOS ACUMULADOS (gerencial) ===== */}
      {data.serieContatos.dias.length > 0 && (
        <div className="map-panel" style={{ marginTop: 18 }}>
          <h3><Icon name="user-plus" size={16} /> Contatos acumulados {ehCandidato ? "(seu número)" : "(global + por instância)"}</h3>
          <GraficoAcumulado serie={data.serieContatos} porInstancia={!ehCandidato} />
        </div>
      )}

      {/* ===== METAS (progresso da captação) ===== */}
      <MetasSecao metas={data.metas} podeGerir={podeGerir} candidatos={data.porCandidato.map((c) => c.candidato)} onMudou={buscar} />

      {/* ===== VISÃO POR CANDIDATO (gestão) ===== */}
      {data.porCandidato.length > 0 && (
        <div className="map-panel" style={{ marginTop: 18 }}>
          <h3><Icon name="user-plus" size={16} /> Visão por candidato</h3>
          <div className="cand-grid">
            {data.porCandidato.map((c) => (
              <CandidatoCard key={c.candidato} c={c} />
            ))}
          </div>
        </div>
      )}

      {/* ===== Novos cadastros (filtro 7/15/30) ===== */}
      <div className="map-panel" style={{ marginTop: 18 }}>
        <h3>Novos cadastros</h3>
        <div className="filtro-tabs">
          {ABAS.map((a) => (
            <button
              key={a.chave}
              className={`filtro-tab${janela === a.chave ? " ativo" : ""}`}
              onClick={() => setJanela(a.chave)}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        <div className="big-num accent">
          <CountUp value={data.contatos[janela]} />
        </div>
        <div className="big-num-sub">
          novos cadastros ·{" "}
          {janela === "hoje" ? "hoje" : `últimos ${janela.replace("d", "")} dias`}
        </div>
      </div>

      <div className={`live-badge${vivo ? "" : " off"}`}>
        <span className="live-dot" />
        {vivo ? "Atualizando em tempo real (a cada 15s)" : "Reconectando…"}
      </div>
    </>
  );
}

const CORES_SERIE = ["var(--accent)", "var(--green)", "var(--yellow)", "var(--red)", "#8b5cf6", "#06b6d4"];

// Arredonda o topo do eixo para um número "redondo" (passos 1/2/5 × 10^n),
// para os rótulos do eixo Y ficarem limpos (10.000, 20.000…) em vez de quebrados.
function eixoMax(valor: number, traços: number): number {
  const raw = Math.max(1, valor) / traços;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const passo = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return passo * traços;
}

// Data/hora da votação (1º turno 2026, abertura das urnas 8h, horário de Brasília).
const ELEICAO_TS = new Date("2026-10-04T08:00:00-03:00").getTime();

// Relógio compartilhado: só começa após montar (evita divergência de hidratação SSR).
function useAgora(intervaloMs = 1000): number | null {
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => {
    setAgora(Date.now());
    const id = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return agora;
}

function ContagemRegressiva() {
  const agora = useAgora(1000);
  const diff = agora == null ? null : Math.max(0, ELEICAO_TS - agora);
  const s = diff == null ? null : Math.floor(diff / 1000);
  const dias = s == null ? null : Math.floor(s / 86400);
  const horas = s == null ? null : Math.floor((s % 86400) / 3600);
  const min = s == null ? null : Math.floor((s % 3600) / 60);
  const seg = s == null ? null : s % 60;
  const p2 = (x: number | null) => (x == null ? "--" : String(x).padStart(2, "0"));
  return (
    <div className="cd-card">
      <div className="cd-label"><Icon name="trophy" size={15} /> Contagem regressiva · Votação 1º turno</div>
      <div className="cd-nums">
        <div className="cd-un"><b>{dias == null ? "--" : dias}</b><span>dias</span></div>
        <div className="cd-un"><b>{p2(horas)}</b><span>horas</span></div>
        <div className="cd-un"><b>{p2(min)}</b><span>min</span></div>
        <div className="cd-un"><b>{p2(seg)}</b><span>seg</span></div>
      </div>
      <div className="cd-sub">Domingo, 04 de outubro de 2026 · urnas às 8h</div>
    </div>
  );
}

function RelogioBrasilia() {
  const agora = useAgora(1000);
  const hora =
    agora == null
      ? "--:--:--"
      : new Date(agora).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false });
  const data =
    agora == null
      ? ""
      : new Date(agora).toLocaleDateString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
  return (
    <div className="cd-card relogio">
      <div className="cd-label"><Icon name="clock" size={15} /> Horário de Brasília <span className="kpi-live" style={{ marginLeft: 6 }}><span className="kpi-live-dot" />AO VIVO</span></div>
      <div className="rl-hora">{hora}</div>
      <div className="cd-sub" style={{ textTransform: "capitalize" }}>{data || " "}</div>
    </div>
  );
}

function GraficoAcumulado({ serie, porInstancia }: { serie: SerieContatos; porInstancia: boolean }) {
  const W = 720, H = 260, PL = 64, PR = 18, PT = 18, PB = 34;
  const n = serie.dias.length;
  const linhasY = 4;
  const nums = (arr: (number | null)[]) => arr.filter((v): v is number => v != null);
  const maxY = eixoMax(Math.max(1, ...nums(serie.global)), linhasY);
  const x = (i: number) => PL + (n <= 1 ? 0 : (i / (n - 1)) * (W - PL - PR));
  const y = (v: number) => PT + (1 - v / maxY) * (H - PT - PB);

  // Caminho só sobre os dias PREENCHIDOS (a linha para no "hoje"; futuro fica vazio).
  const linha = (vals: (number | null)[]) => {
    let d = "", on = false;
    vals.forEach((v, i) => {
      if (v == null) return;
      d += `${on ? "L" : "M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      on = true;
    });
    return d.trim();
  };
  const area = (vals: (number | null)[]) => {
    const base = H - PB;
    const f = vals.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
    if (!f.length) return "";
    const pts = f.map((p) => `L ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
    return `M ${x(f[0].i).toFixed(1)} ${base} ${pts} L ${x(f[f.length - 1].i).toFixed(1)} ${base} Z`;
  };

  const fmtDia = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
  const series = porInstancia ? serie.series.slice(0, 6) : [];
  const hIdx = serie.hojeIdx, eIdx = serie.eleicaoIdx;
  const vHoje = serie.global[hIdx];
  const totalHoje = typeof vHoje === "number" ? vHoje : 0;
  const faltam = Math.max(0, eIdx - hIdx);
  const xElei = x(eIdx);

  return (
    <div>
      <div className="graf-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="graf-svg">
          {/* grades + rótulos Y */}
          {Array.from({ length: linhasY + 1 }).map((_, i) => {
            const val = Math.round((maxY / linhasY) * (linhasY - i));
            const yy = PT + (i / linhasY) * (H - PT - PB);
            return (
              <g key={i}>
                <line x1={PL} y1={yy} x2={W - PR} y2={yy} stroke="var(--border)" strokeWidth={1} />
                <text x={PL - 8} y={yy + 4} textAnchor="end" className="graf-eixo">{val.toLocaleString("pt-BR")}</text>
              </g>
            );
          })}
          {/* área + linha global (só até hoje) */}
          <path d={area(serie.global)} fill="var(--accent)" opacity={0.12} />
          <path d={linha(serie.global)} fill="none" stroke="var(--accent)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
          {/* linhas por instância */}
          {series.map((s, i) => (
            <path key={s.nome} d={linha(s.valores)} fill="none" stroke={CORES_SERIE[(i + 1) % CORES_SERIE.length]} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
          ))}
          {/* ponto de HOJE (onde a coleta está) */}
          {typeof vHoje === "number" && (
            <circle cx={x(hIdx)} cy={y(vHoje)} r={3.6} fill="var(--accent)" stroke="#fff" strokeWidth={1.5} />
          )}
          {/* MARCO da votação: linha vermelha tracejada + bandeira no topo */}
          <line x1={xElei} y1={PT} x2={xElei} y2={H - PB} stroke="#ed1c24" strokeWidth={2} strokeDasharray="5 4" />
          <circle cx={xElei} cy={PT + 1} r={3.4} fill="#ed1c24" />
          {/* rótulos X (início · hoje · votação) */}
          <text x={PL} y={H - 12} textAnchor="start" className="graf-eixo">{fmtDia(serie.dias[0])}</text>
          {hIdx > 4 && hIdx < n - 8 && (
            <text x={x(hIdx)} y={H - 12} textAnchor="middle" className="graf-eixo">hoje</text>
          )}
          <text x={W - PR} y={H - 12} textAnchor="end" className="graf-eixo" fill="#ed1c24">votação {fmtDia(serie.eleicao)}</text>
        </svg>
      </div>
      <div className="graf-legenda">
        <span className="graf-item"><i style={{ background: "var(--accent)" }} /> Global <b>{totalHoje.toLocaleString("pt-BR")}</b></span>
        {series.map((s, i) => (
          <span key={s.nome} className="graf-item">
            <i style={{ background: CORES_SERIE[(i + 1) % CORES_SERIE.length] }} /> {s.nome} <b>{s.total.toLocaleString("pt-BR")}</b>
          </span>
        ))}
        <span className="graf-item" style={{ marginLeft: "auto" }}>
          <i style={{ background: "#ed1c24" }} /> Votação {fmtDia(serie.eleicao)} · faltam <b>{faltam}</b> dias
        </span>
      </div>
    </div>
  );
}

function CandidatoCard({ c }: { c: CandidatoStat }) {
  const cotaPct = c.quota > 0 ? Math.min(100, Math.round((c.disparosHoje / c.quota) * 100)) : 0;
  return (
    <div className="cand-card">
      <div className="cand-head">
        <span className="cand-nome">{c.candidato}</span>
        <span className={`cand-status ${c.ativo ? "on" : "off"}`}>● {c.ativo ? "ativo" : "parado"}</span>
      </div>
      <div className="cand-metrics">
        <div><b>{nf(c.alcance)}</b><span>alcançados</span></div>
        <div><b>{nf(c.respostas)}</b><span>responderam</span></div>
        <div><b>{nf(c.mensagensHoje)}</b><span>msgs hoje</span></div>
      </div>
      <div className="cand-cota">
        <div className="cand-cota-bar"><span style={{ width: `${cotaPct}%` }} /></div>
        <small>Disparos hoje: {nf(c.disparosHoje)} / {nf(c.quota)} · {nf(c.mensagens)} msgs no total</small>
      </div>
    </div>
  );
}

function barraCor(pct: number) {
  if (pct >= 100) return "var(--green)";
  if (pct >= 60) return "var(--accent)";
  if (pct >= 30) return "var(--yellow)";
  return "var(--red)";
}

function MetasSecao({
  metas,
  podeGerir,
  candidatos,
  onMudou,
}: {
  metas: MetaProgresso[];
  podeGerir: boolean;
  candidatos: string[];
  onMudou: () => void;
}) {
  const [abrir, setAbrir] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [escopo, setEscopo] = useState<"global" | "candidato">("global");
  const [candidato, setCandidato] = useState("");
  const [metrica, setMetrica] = useState<Metrica>("alcance");
  const [alvo, setAlvo] = useState<number>(1000);
  const [prazo, setPrazo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      const r = await fetch("/api/metas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, escopo, candidato, metrica, alvo, prazo: prazo || null }),
      });
      const d = await r.json();
      if (!r.ok) return setErro(d.erro || "Erro ao salvar.");
      setTitulo("");
      setAlvo(1000);
      setPrazo("");
      setAbrir(false);
      onMudou();
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: number) {
    if (!confirm("Remover esta meta?")) return;
    await fetch(`/api/metas?id=${id}`, { method: "DELETE" });
    onMudou();
  }

  return (
    <div className="map-panel" style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0 }}><Icon name="tasks" size={16} /> Metas de captação</h3>
        {podeGerir && (
          <button className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={() => setAbrir((v) => !v)}>
            {abrir ? "Fechar" : "+ Nova meta"}
          </button>
        )}
      </div>

      {podeGerir && abrir && (
        <form className="meta-form" onSubmit={criar}>
          {erro && <div className="msg err">{erro}</div>}
          <div className="grid2">
            <div className="field">
              <label>Título</label>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: 10 mil alcançados até a eleição" />
            </div>
            <div className="field">
              <label>Alvo (número)</label>
              <input type="number" min={1} value={alvo} onChange={(e) => setAlvo(Number(e.target.value))} />
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>Escopo</label>
              <select value={escopo} onChange={(e) => setEscopo(e.target.value as "global" | "candidato")}>
                <option value="global">Campanha toda (global)</option>
                <option value="candidato">Um candidato</option>
              </select>
            </div>
            {escopo === "candidato" ? (
              <div className="field">
                <label>Candidato</label>
                <select value={candidato} onChange={(e) => setCandidato(e.target.value)}>
                  <option value="">- escolha -</option>
                  {candidatos.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ) : (
              <div className="field" />
            )}
          </div>
          <div className="grid2">
            <div className="field">
              <label>Métrica (o que conta como progresso)</label>
              <select value={metrica} onChange={(e) => setMetrica(e.target.value as Metrica)}>
                {(["alcance", "respostas", "mensagens", "cadastros"] as Metrica[]).map((m) => (
                  <option key={m} value={m}>{METRICA_ROTULO[m]}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Prazo (opcional)</label>
              <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={salvando}>
            {salvando ? "Salvando…" : "Criar meta"}
          </button>
        </form>
      )}

      {metas.length === 0 ? (
        <div className="empty" style={{ marginTop: 10 }}>
          Nenhuma meta ainda.{podeGerir ? " Crie uma para acompanhar o progresso da captação." : ""}
        </div>
      ) : (
        <div className="metas-lista">
          {metas.map((m) => (
            <div key={m.id} className="meta-item">
              <div className="meta-top">
                <div>
                  <span className="meta-titulo">{m.titulo}</span>
                  <span className="meta-tag">
                    {m.escopo === "candidato" ? m.candidato : "Global"} · {METRICA_ROTULO[m.metrica]}
                    {m.prazo ? ` · até ${new Date(m.prazo).toLocaleDateString("pt-BR")}` : ""}
                  </span>
                </div>
                <div className="meta-num">
                  <b>{nf(m.atual)}</b> / {nf(m.alvo)}
                  {podeGerir && (
                    <button className="meta-del" onClick={() => excluir(m.id)} aria-label="Remover">✕</button>
                  )}
                </div>
              </div>
              <div className="meta-bar">
                <span style={{ width: `${m.pct}%`, background: barraCor(m.pct) }} />
              </div>
              <div className="meta-foot">
                <span style={{ color: barraCor(m.pct), fontWeight: 700 }}>{m.pct}%</span>
                <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{m.restante > 0 ? `faltam ${nf(m.restante)}` : (<><Icon name="trophy" size={13} /> meta batida</>)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
