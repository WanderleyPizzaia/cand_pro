"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DashboardData, CandidatoStat, SerieContatos } from "@/lib/dashboard";
import type { MetaProgresso, Metrica } from "@/lib/metas";
import type { Perfil } from "@/lib/auth";
import CountUp from "../components/CountUp";
import Icon, { IconName } from "../components/Icon";
import type { Pendencia } from "@/lib/pendencias";

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
  const serie = data.serieContatos;
  const spark = serie.global
    .slice(Math.max(0, serie.hojeIdx - 13), serie.hojeIdx + 1)
    .map((v) => (typeof v === "number" ? v : 0));

  return (
    <>
      {/* ===== O que precisa de alguém agora ===== */}
      {data.escopo !== "lider" && <Agora itens={data.pendencias} />}

      {/* ===== Indicadores principais ===== */}
      <div className="kpis">
        <Link href="/pessoas" className="kpi kpi-link">
          <div className="label">Contatos na base</div>
          <div className="kpi-linha">
            <div className="value accent">
              <CountUp value={data.totalCadastros} />
            </div>
            {spark.length > 1 && <Sparkline valores={spark} />}
          </div>
          <div className="kpi-sub">
            {data.contatos.d7 > 0 ? (
              <span className="kpi-delta up">+{nf(data.contatos.d7)} em 7 dias</span>
            ) : (
              "nenhum novo nos últimos 7 dias"
            )}
          </div>
        </Link>
        {data.escopo !== "lider" && (
          <Link href={ehCandidato ? "/meu-agente" : "/agentes"} className="kpi kpi-link">
            <div className="label">{ehCandidato ? "Seus números" : "Números de WhatsApp"}</div>
            <div className="value">
              <CountUp value={data.whats.total} />
            </div>
            <div className="kpi-sub">
              <span className={data.whats.conectados ? "stat-on" : "stat-off"}>
                {data.whats.conectados} respondendo
              </span>
              {data.whats.total - data.whats.conectados > 0 && (
                <> · {data.whats.total - data.whats.conectados} parado{data.whats.total - data.whats.conectados === 1 ? "" : "s"}</>
              )}
            </div>
          </Link>
        )}
        {data.escopo !== "lider" && (
          <Link href="/atendimento" className="kpi kpi-link">
            <div className="label">Mensagens hoje</div>
            <div className="value">
              <CountUp value={data.mensagensHoje} />
            </div>
            <div className="kpi-sub">
              {nf(data.metricas.mensagens)} no total · {nf(data.metricas.entrada)} recebidas
            </div>
          </Link>
        )}
        {data.escopo !== "lider" && (
          <Link href="/atendimento" className="kpi kpi-link">
            <div className="label">1ª resposta (média)</div>
            <div className="value">{fmtTempo(data.metricas.tempoRespMedioSeg)}</div>
            <div className="kpi-sub">tempo até responder · últimos 30 dias</div>
          </Link>
        )}
        {data.escopo === "lider" && (
          <div className="kpi">
            <div className="label">Novos hoje</div>
            <div className="value">
              <CountUp value={data.contatos.hoje} />
            </div>
            <div className="kpi-sub">{nf(data.contatos.d30)} nos últimos 30 dias</div>
          </div>
        )}
      </div>

      <div className="inicio-grid">
        {/* ===== CONTATOS ACUMULADOS ===== */}
        {serie.dias.length > 0 && (
          <section className="map-panel inicio-graf">
            <h3>
              <Icon name="user-plus" size={16} /> Contatos acumulados{" "}
              <span className="muted h3-sub">
                {data.escopo === "lider" ? "seus cadastros" : ehCandidato ? "seus números" : "total e por candidato"}
              </span>
            </h3>
            <GraficoAcumulado serie={serie} porInstancia={!ehCandidato} />
          </section>
        )}

        {/* ===== Novos cadastros (filtro hoje/7/15/30) ===== */}
        <section className="map-panel inicio-novos">
          <h3>Novos cadastros</h3>
          <div className="filtro-tabs">
            {ABAS.map((a) => (
              <button
                key={a.chave}
                type="button"
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
            {janela === "hoje" ? "cadastrados hoje" : `nos últimos ${janela.replace("d", "")} dias`}
          </div>
          {data.lideranca.length > 0 && (
            <div className="inicio-ranking">
              <span className="rotulo">Quem mais cadastra</span>
              {data.lideranca.slice(0, 5).map((l, i) => (
                <div key={l.nome + i} className="rank-item">
                  <span>
                    <span className="rank-pos">{i + 1}</span> {l.nome}
                  </span>
                  <b className="n">{nf(l.total)}</b>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ===== METAS (progresso da captação) ===== */}
      <MetasSecao metas={data.metas} podeGerir={podeGerir} candidatos={data.porCandidato.map((c) => c.candidato)} onMudou={buscar} />

      {/* ===== VISÃO POR CANDIDATO (gestão) ===== */}
      {data.porCandidato.length > 0 && (
        <section className="map-panel secao">
          <h3>
            <Icon name="users" size={16} /> Por candidato
          </h3>
          <div className="cand-grid">
            {data.porCandidato.map((c) => (
              <CandidatoCard key={c.candidato} c={c} />
            ))}
          </div>
        </section>
      )}

      <div className={`live-badge${vivo ? "" : " off"}`}>
        <span className="live-dot" />
        {vivo ? "Atualizando sozinho a cada 15 s" : "Sem conexão. Tentando de novo…"}
      </div>
    </>
  );
}

const TOM_ICONE: Record<Pendencia["tom"], IconName> = {
  erro: "chat",
  atencao: "alert",
  info: "clock",
};
const CHAVE_ICONE: Record<Pendencia["chave"], IconName> = {
  fila: "chat",
  parados: "plug",
  tarefas: "tasks",
  pautas: "inbox",
};

// "Precisa de você agora": o que está parado esperando a equipe.
function Agora({ itens }: { itens: Pendencia[] }) {
  return (
    <section className="agora" aria-labelledby="agora-tit">
      <h2 id="agora-tit" className="agora-tit">Precisa de você agora</h2>
      {itens.length === 0 ? (
        <div className="agora-ok">
          <Icon name="check" size={18} />
          <span>
            <b>Tudo em dia.</b> Nenhuma conversa na fila, número parado, tarefa vencida ou pauta sem triagem.
          </span>
        </div>
      ) : (
        <ul className="agora-lista">
          {itens.map((p) => (
            <li key={p.chave}>
              <Link href={p.href} className={`agora-item tom-${p.tom}`}>
                <span className="agora-ic">
                  <Icon name={CHAVE_ICONE[p.chave] || TOM_ICONE[p.tom]} size={18} />
                </span>
                <span className="agora-txt">
                  <b>{p.titulo}</b>
                  {p.detalhe && <span>{p.detalhe}</span>}
                </span>
                <span className="agora-acao">
                  <span className="agora-acao-txt">{p.acao}</span> <Icon name="arrow-right" size={14} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Minigráfico dos últimos 14 dias (contatos acumulados).
function Sparkline({ valores }: { valores: number[] }) {
  const W = 84,
    H = 28;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const esc = max - min || 1;
  const pts = valores.map((v, i) => [
    (i / (valores.length - 1)) * (W - 4) + 2,
    H - 3 - ((v - min) / esc) * (H - 6),
  ]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${d} L${pts[pts.length - 1][0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z`;
  const [ux, uy] = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <path d={area} fill="var(--accent-soft)" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ux} cy={uy} r={2.4} fill="var(--accent)" />
    </svg>
  );
}

const CORES_SERIE = ["var(--accent)", "var(--blue)", "var(--green)", "var(--violet)", "var(--yellow)", "var(--red)"];

// Arredonda o topo do eixo para um número "redondo" (passos 1/2/5 × 10^n),
// para os rótulos do eixo Y ficarem limpos (10.000, 20.000…) em vez de quebrados.
function eixoMax(valor: number, traços: number): number {
  const raw = Math.max(1, valor) / traços;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  // Passo mínimo 1: contagem é inteira (evita eixo "2, 2, 1, 1, 0" com base pequena).
  const passo = Math.max(1, (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag);
  return passo * traços;
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
          <path d={area(serie.global)} fill="var(--accent)" opacity={0.1} />
          <path d={linha(serie.global)} fill="none" stroke="var(--accent)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
          {/* linhas por instância */}
          {series.map((s, i) => (
            <path key={s.nome} d={linha(s.valores)} fill="none" stroke={CORES_SERIE[(i + 1) % CORES_SERIE.length]} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
          ))}
          {/* ponto de HOJE (onde a coleta está) */}
          {typeof vHoje === "number" && (
            <circle cx={x(hIdx)} cy={y(vHoje)} r={4} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
          )}
          {/* MARCO da votação: linha vermelha tracejada + bandeira no topo */}
          <line x1={xElei} y1={PT} x2={xElei} y2={H - PB} stroke="var(--red)" strokeWidth={1.6} strokeDasharray="5 4" />
          <circle cx={xElei} cy={PT + 1} r={3.4} fill="var(--red)" />
          {/* rótulos X (início · hoje · votação) */}
          <text x={PL} y={H - 12} textAnchor="start" className="graf-eixo">{fmtDia(serie.dias[0])}</text>
          {hIdx > 4 && hIdx < n - 8 && (
            <text x={x(hIdx)} y={H - 12} textAnchor="middle" className="graf-eixo">hoje</text>
          )}
          <text x={W - PR} y={H - 12} textAnchor="end" className="graf-eixo graf-eixo-alerta">votação {fmtDia(serie.eleicao)}</text>
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
          <i style={{ background: "var(--red)" }} /> Votação {fmtDia(serie.eleicao)} · faltam <b>{faltam}</b> dias
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
        <span className={`cand-status ${c.ativo ? "on" : "off"}`}><i aria-hidden="true" /> {c.ativo ? "ativo" : "parado"}</span>
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
    <section className="map-panel secao">
      <div className="panel-head">
        <h3><Icon name="flag" size={16} /> Metas de captação</h3>
        {podeGerir && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAbrir((v) => !v)}>
            {abrir ? "Fechar" : <><Icon name="plus" size={14} /> Nova meta</>}
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
        <div className="empty empty-sm">
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
                    <button type="button" className="meta-del" onClick={() => excluir(m.id)} aria-label="Remover meta"><Icon name="x" size={14} /></button>
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
    </section>
  );
}
