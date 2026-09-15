"use client";

import { useEffect, useState } from "react";
import Icon from "../../components/Icon";
import {
  PAUTAS_RISCO,
  RISCO_ROTULO,
  COMUNICACAO_ORIENTADA,
  CHECKLIST_CRISE,
  SEVERIDADES,
  modeloNota,
  CRISE_VAZIA,
  EstadoCrise,
  Risco,
} from "@/lib/assessoria";

const corRisco: Record<Risco, string> = {
  alto: "#c0392b",
  medio: "#c77d0a",
  baixo: "#0b7a4b",
};

export default function AssessoriaCliente({ gabinete }: { gabinete: string }) {
  const [crise, setCrise] = useState<EstadoCrise>({ ...CRISE_VAZIA });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState<"" | Risco>("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [copiado, setCopiado] = useState("");
  const [iaLoading, setIaLoading] = useState(false);

  async function redigirIA() {
    if (!crise.titulo.trim()) { alert("Preencha o assunto da crise primeiro."); return; }
    setIaLoading(true);
    try {
      const r = await fetch("/api/assessoria/crise/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: crise.titulo, severidade: crise.severidade, portaVoz: crise.portaVoz, gabinete }),
      });
      const d = await r.json();
      if (d.ok && d.texto) { setCrise((c) => ({ ...c, nota: d.texto })); salvar("atualizar", { nota: d.texto }); }
      else alert(d.erro || "Não foi possível gerar agora.");
    } catch {
      alert("Falha de conexão ao gerar.");
    } finally {
      setIaLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/assessoria/crise")
      .then((r) => r.json())
      .then((d) => { if (d.estado) setCrise(d.estado); })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  async function salvar(acao: string, extra: Partial<EstadoCrise> = {}) {
    setSalvando(true);
    try {
      const r = await fetch("/api/assessoria/crise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, ...crise, ...extra }),
      });
      const d = await r.json();
      if (d.estado) setCrise(d.estado);
    } catch {
      /* silencioso */
    } finally {
      setSalvando(false);
    }
  }

  function ativar(titulo = "", severidade = "media") {
    const nota = modeloNota(gabinete, severidade);
    const novo = { ...crise, ativa: true, titulo, severidade, nota: crise.nota || nota };
    setCrise(novo);
    salvar("ativar", { titulo, severidade, nota: novo.nota });
    document.getElementById("painel-crise")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleFeito(id: string) {
    const feitos = crise.feitos.includes(id)
      ? crise.feitos.filter((x) => x !== id)
      : [...crise.feitos, id];
    setCrise({ ...crise, feitos });
    salvar("atualizar", { feitos });
  }

  function copiar(txt: string, tag: string) {
    navigator.clipboard?.writeText(txt).then(() => {
      setCopiado(tag);
      setTimeout(() => setCopiado(""), 1600);
    });
  }

  const pautas = filtro ? PAUTAS_RISCO.filter((p) => p.risco === filtro) : PAUTAS_RISCO;
  const progresso = Math.round((crise.feitos.length / CHECKLIST_CRISE.length) * 100);

  return (
    <div className="assess">
      {/* ── Painel de Gestão de Crise ── */}
      <section id="painel-crise" className={"crise-box" + (crise.ativa ? " ativa" : "")}>
        {!crise.ativa ? (
          <div className="crise-off">
            <div>
              <h2 style={{ margin: "0 0 4px" }}>Gestão de Crise</h2>
              <p style={{ color: "var(--muted)", margin: 0 }}>
                Sala de guerra da comunicação. Ative para abrir o protocolo, a nota de contenção e o checklist da 1ª hora.
              </p>
            </div>
            <button className="btn-crise" disabled={carregando || salvando} onClick={() => ativar()}>
              <Icon name="alert" size={20} /> ATIVAR GESTÃO DE CRISE
            </button>
          </div>
        ) : (
          <div className="crise-on">
            <div className="crise-head">
              <div className="crise-tag"><span className="pulse" /> CRISE ATIVA</div>
              <button className="btn-encerrar" disabled={salvando} onClick={() => { if (confirm("Encerrar a gestão de crise?")) salvar("encerrar"); }}>
                <Icon name="check" size={16} /> Encerrar crise
              </button>
            </div>

            <div className="crise-grid">
              <div className="field">
                <label>Assunto da crise</label>
                <input value={crise.titulo} placeholder="Ex.: Corte de vídeo fora de contexto"
                  onChange={(e) => setCrise({ ...crise, titulo: e.target.value })}
                  onBlur={() => salvar("atualizar")} />
              </div>
              <div className="field">
                <label>Severidade</label>
                <select value={crise.severidade}
                  onChange={(e) => { const v = e.target.value; setCrise({ ...crise, severidade: v }); salvar("atualizar", { severidade: v }); }}>
                  {SEVERIDADES.map((s) => <option key={s.v} value={s.v}>{s.r}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Porta-voz único</label>
                <input value={crise.portaVoz} placeholder="Quem fala pelo gabinete"
                  onChange={(e) => setCrise({ ...crise, portaVoz: e.target.value })}
                  onBlur={() => salvar("atualizar")} />
              </div>
            </div>

            <div className="crise-checklist">
              <div className="cc-head">
                <strong>Checklist da 1ª hora</strong>
                <span>{crise.feitos.length}/{CHECKLIST_CRISE.length} · {progresso}%</span>
              </div>
              <div className="cc-bar"><i style={{ width: progresso + "%" }} /></div>
              <ul>
                {CHECKLIST_CRISE.map((c) => (
                  <li key={c.id} className={crise.feitos.includes(c.id) ? "ok" : ""} onClick={() => toggleFeito(c.id)}>
                    <span className="box">{crise.feitos.includes(c.id) && <Icon name="check" size={13} />}</span>
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="field">
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Nota de contenção (holding statement)</span>
                <span style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="mini ia-btn" disabled={iaLoading} onClick={redigirIA}>
                    {iaLoading ? "Gerando…" : "✨ Redigir com IA"}
                  </button>
                  <button type="button" className="mini" onClick={() => { const n = modeloNota(gabinete, crise.severidade); setCrise({ ...crise, nota: n }); salvar("atualizar", { nota: n }); }}>Modelo</button>
                  <button type="button" className="mini" onClick={() => copiar(crise.nota, "nota")}>{copiado === "nota" ? "Copiado!" : "Copiar"}</button>
                </span>
              </label>
              <textarea rows={9} value={crise.nota}
                onChange={(e) => setCrise({ ...crise, nota: e.target.value })}
                onBlur={() => salvar("atualizar")} />
            </div>
          </div>
        )}
      </section>

      {/* ── Comunicação Orientada ── */}
      <section className="assess-card">
        <h2><Icon name="megaphone" size={20} /> Comunicação orientada</h2>
        <p className="assess-tom"><strong>Tom:</strong> {COMUNICACAO_ORIENTADA.tom}</p>
        <div className="co-grid">
          {COMUNICACAO_ORIENTADA.principios.map((p, i) => (
            <div key={i} className="co-item"><span>{String(i + 1).padStart(2, "0")}</span>{p}</div>
          ))}
        </div>
        <div className="co-regra">
          <strong>Regra de ouro:</strong> {COMUNICACAO_ORIENTADA.regraDeOuro}
        </div>
        <div className="co-resposta">
          <div>
            <strong>Resposta padrão a jornalista</strong>
            <p>{COMUNICACAO_ORIENTADA.respostaJornalista}</p>
          </div>
          <button className="mini" onClick={() => copiar(COMUNICACAO_ORIENTADA.respostaJornalista, "jorn")}>
            {copiado === "jorn" ? "Copiado!" : "Copiar"}
          </button>
        </div>
      </section>

      {/* ── Mapa de Riscos / Pautas de polêmica ── */}
      <section className="assess-card">
        <div className="mr-head">
          <h2 style={{ margin: 0 }}><Icon name="alert" size={20} /> Mapa de riscos · pautas de polêmica</h2>
          <div className="mr-filtros">
            <button className={filtro === "" ? "on" : ""} onClick={() => setFiltro("")}>Todas</button>
            {(["alto", "medio", "baixo"] as Risco[]).map((r) => (
              <button key={r} className={filtro === r ? "on" : ""} onClick={() => setFiltro(r)} style={filtro === r ? { background: corRisco[r], borderColor: corRisco[r], color: "#fff" } : {}}>
                Risco {RISCO_ROTULO[r].toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Cenários possíveis, sinais de alerta e a comunicação orientada para cada um. Antecipe antes de virar problema.
        </p>
        <div className="mr-lista">
          {pautas.map((p) => {
            const open = aberta === p.id;
            return (
              <div key={p.id} className={"mr-card" + (open ? " open" : "")}>
                <button className="mr-top" onClick={() => setAberta(open ? null : p.id)}>
                  <span className="mr-dot" style={{ background: corRisco[p.risco] }} />
                  <span className="mr-tit">{p.titulo}</span>
                  <span className="mr-cat">{p.categoria}</span>
                  <span className="mr-risco" style={{ color: corRisco[p.risco] }}>{RISCO_ROTULO[p.risco]}</span>
                  <Icon name={open ? "x" : "arrow-right"} size={16} />
                </button>
                {open && (
                  <div className="mr-body">
                    <p><strong>Gatilho:</strong> {p.gatilho}</p>
                    <p><strong>Mensagem-chave:</strong> {p.mensagemChave}</p>
                    <div className="mr-cols">
                      <div>
                        <span className="mr-lab">Sinais de alerta</span>
                        <ul>{p.sinais.map((s, i) => <li key={i}>{s}</li>)}</ul>
                      </div>
                      <div>
                        <span className="mr-lab ok">O que dizer</span>
                        <ul>{p.dizer.map((s, i) => <li key={i}>{s}</li>)}</ul>
                      </div>
                      <div>
                        <span className="mr-lab bad">O que evitar</span>
                        <ul>{p.evitar.map((s, i) => <li key={i}>{s}</li>)}</ul>
                      </div>
                    </div>
                    <button className="btn-crise-mini" onClick={() => ativar(p.titulo, p.risco === "alto" ? "alta" : p.risco === "medio" ? "media" : "baixa")}>
                      <Icon name="alert" size={14} /> Abrir crise a partir desta pauta
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
