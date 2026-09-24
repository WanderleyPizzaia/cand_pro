"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "../../components/Icon";

type Resumo = {
  investido: number; taxaPct: number; taxaServico: number;
  disparos: number; custoUnit: number; custoDisparos: number;
  custosManuais: number; saldo: number;
};
type Lanc = { id: number; tipo: string; valor: number; descricao: string | null; criado_em: string };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function TecnologiaCliente() {
  const [aba, setAba] = useState<"financeiro" | "discurso">("financeiro");
  return (
    <div className="tec-wrap">
      <div className="tec-tabs">
        <button type="button" className={aba === "financeiro" ? "on" : ""} onClick={() => setAba("financeiro")}><Icon name="gauge" size={16} /> Financeiro</button>
        <button type="button" className={aba === "discurso" ? "on" : ""} onClick={() => setAba("discurso")}><Icon name="megaphone" size={16} /> Discurso</button>
      </div>
      {aba === "financeiro" && <Financeiro />}
      {aba === "discurso" && <Nota chave="discurso" titulo="Discurso" dica="Mensagem central, bordões e argumentos-chave do candidato." atalhos={[["Assessoria de Imprensa", "/assessoria"], ["Treinar assistente", "/meu-agente"]]} />}
    </div>
  );
}

function Financeiro() {
  const [d, setD] = useState<{ resumo: Resumo; lancamentos: Lanc[]; podeLancar: boolean } | null>(null);
  const [tipo, setTipo] = useState<"aporte" | "custo">("aporte");
  const [valor, setValor] = useState("");
  const [desc, setDesc] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [pixValor, setPixValor] = useState("");
  const [pixDesc, setPixDesc] = useState("");
  const [pixLoad, setPixLoad] = useState(false);
  const [pix, setPix] = useState<{ emv?: string; qrcodeBase64?: string; aviso?: string; erro?: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function gerarPix() {
    const v = Number((pixValor || "").replace(",", "."));
    if (!v || v <= 0) return;
    setPixLoad(true); setPix(null);
    try {
      const r = await fetch("/api/pagamento/pix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valor: v, descricao: pixDesc }) });
      const d = await r.json();
      setPix(d.ok ? { emv: d.emv, qrcodeBase64: d.qrcodeBase64 } : { aviso: d.aviso, erro: d.erro });
    } catch { setPix({ erro: "Falha de conexão." }); }
    finally { setPixLoad(false); }
  }

  async function carregar() {
    const r = await fetch("/api/financeiro", { cache: "no-store" });
    if (r.ok) setD(await r.json());
  }
  useEffect(() => { carregar(); }, []);

  async function lancar() {
    const v = Number(valor.replace(",", "."));
    if (!v || v <= 0) return;
    setSalvando(true);
    try {
      await fetch("/api/financeiro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, valor: v, descricao: desc }) });
      setValor(""); setDesc(""); await carregar();
    } finally { setSalvando(false); }
  }
  async function remover(id: number) {
    if (!confirm("Remover este lançamento?")) return;
    await fetch(`/api/financeiro?id=${id}`, { method: "DELETE" });
    carregar();
  }

  if (!d) return <div className="map-panel">Carregando…</div>;
  const r = d.resumo;
  const pct = Math.round(r.taxaPct * 100);
  const verba = Math.round((r.investido - r.taxaServico) * 100) / 100;
  const passos = [
    { n: 1, nome: "Aporte recebido", valor: r.investido, desc: "Investimento lançado na operação", ok: r.investido > 0 },
    { n: 2, nome: "Taxa de serviço + NF", valor: r.taxaServico, desc: `Taxa da agência (${pct}%) · emitir nota fiscal`, ok: r.taxaServico > 0 },
    { n: 3, nome: "Verba operacional", valor: verba, desc: "Disponível para os disparos", ok: verba > 0 },
    { n: 4, nome: "Disparos executados", valor: r.custoDisparos, desc: `${r.disparos.toLocaleString("pt-BR")} envios × ${brl(r.custoUnit)}`, ok: r.disparos > 0 },
    { n: 5, nome: "Saldo / conciliação", valor: r.saldo, desc: "Saldo disponível, conferido", ok: true },
  ];

  return (
    <div className="fin">
      <div className="fin-cards">
        <div className="fin-card"><span>Investido (aportes)</span><b>{brl(r.investido)}</b></div>
        <div className="fin-card"><span>Taxa de serviço ({Math.round(r.taxaPct * 100)}%)</span><b className="taxa">{brl(r.taxaServico)}</b><small>agência · declarada</small></div>
        <div className="fin-card"><span>Custo dos disparos</span><b>{brl(r.custoDisparos)}</b><small>{r.disparos.toLocaleString("pt-BR")} envios × {brl(r.custoUnit)}</small></div>
        <div className="fin-card saldo"><span>Saldo disponível</span><b>{brl(r.saldo)}</b></div>
      </div>

      <div className="fin-nota">
        <Icon name="check" size={14} /> Transparência: o valor investido, a <b>taxa de serviço da agência ({pct}%)</b>, o custo real dos disparos e o saldo aparecem aqui de forma aberta. Emissão de nota fiscal sobre a taxa de serviço.
      </div>

      <div className="map-panel">
        <h3>Processo financeiro</h3>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
          Da entrada do aporte à conciliação. A integração bancária (Open Banking) vai alimentar as etapas automaticamente.
        </p>
        <div className="fin-proc">
          {passos.map((p, i) => (
            <div className={"fin-step" + (p.ok ? " ok" : "")} key={p.n}>
              <div className="fs-mark"><span>{p.ok ? "✓" : p.n}</span></div>
              <div className="fs-body">
                <div className="fs-top"><b>{p.nome}</b><span className="fs-val">{brl(p.valor)}</span></div>
                <small>{p.desc}</small>
              </div>
              {i < passos.length - 1 && <div className="fs-line" />}
            </div>
          ))}
        </div>
        <div className="fin-int"><Icon name="plug" size={14} /> Integração de pagamento <b>BTG · PIX (cash-in)</b>: cobrança com QR, confirmação por webhook e baixa automática no Financeiro.</div>
      </div>

      {d.podeLancar && (
        <div className="map-panel">
          <h3>Cobrança PIX (BTG)</h3>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
            Gera o QR Code / copia-e-cola pelo BTG. Quando o pagador confirma, o <b>aporte</b> entra sozinho aqui (webhook).
          </p>
          <div className="fin-form-row">
            <input inputMode="decimal" placeholder="Valor (R$)" value={pixValor} onChange={(e) => setPixValor(e.target.value)} />
            <input placeholder="Descrição (opcional)" value={pixDesc} onChange={(e) => setPixDesc(e.target.value)} style={{ gridColumn: "span 2" }} />
            <button className="btn btn-primary" disabled={pixLoad} onClick={gerarPix}>{pixLoad ? "Gerando…" : "Gerar PIX"}</button>
          </div>
          {pix && (pix.aviso || pix.erro) && (
            <div className="fin-int" style={{ marginTop: 12 }}><Icon name="alert" size={14} /> {pix.aviso || pix.erro}</div>
          )}
          {pix && pix.emv && (
            <div className="pix-out">
              {pix.qrcodeBase64 && <img className="pix-qr" src={pix.qrcodeBase64.startsWith("data:") ? pix.qrcodeBase64 : "data:image/png;base64," + pix.qrcodeBase64} alt="QR Code PIX" />}
              <div className="pix-copy">
                <label>PIX copia-e-cola</label>
                <textarea readOnly rows={3} value={pix.emv} onFocus={(e) => e.currentTarget.select()} />
                <button className="mini" onClick={() => { navigator.clipboard?.writeText(pix.emv || ""); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }}>{copiado ? "Copiado!" : "Copiar código"}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {d.podeLancar && (
        <div className="map-panel fin-form">
          <h3>Lançar</h3>
          <div className="fin-form-row">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as "aporte" | "custo")}>
              <option value="aporte">Aporte (investimento)</option>
              <option value="custo">Custo avulso</option>
            </select>
            <input inputMode="decimal" placeholder="Valor (R$)" value={valor} onChange={(e) => setValor(e.target.value)} />
            <input placeholder="Descrição (opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <button className="btn btn-primary" disabled={salvando} onClick={lancar}>{salvando ? "…" : "Lançar"}</button>
          </div>
        </div>
      )}

      <div className="map-panel">
        <h3>Lançamentos</h3>
        {d.lancamentos.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Nenhum lançamento ainda.</div>
        ) : (
          <div className="fin-lista">
            {d.lancamentos.map((l) => (
              <div className="fin-item" key={l.id}>
                <span className={"fin-tag " + l.tipo}>{l.tipo === "aporte" ? "Aporte" : "Custo"}</span>
                <span className="fin-desc">{l.descricao || (l.tipo === "aporte" ? "Investimento" : "Custo")}</span>
                <span className="fin-data">{new Date(l.criado_em).toLocaleDateString("pt-BR")}</span>
                <span className={"fin-valor " + l.tipo}>{l.tipo === "aporte" ? "+" : "−"} {brl(l.valor)}</span>
                {d.podeLancar && <button className="fin-del" onClick={() => remover(l.id)} title="Remover">✕</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Bloco de notas simples (Planejamento / Discurso) — salvo neste navegador.
function Nota({ chave, titulo, dica, atalhos }: { chave: string; titulo: string; dica: string; atalhos: [string, string][] }) {
  const [txt, setTxt] = useState("");
  const [salvo, setSalvo] = useState(false);
  const k = "tec_nota_" + chave;
  useEffect(() => { try { setTxt(localStorage.getItem(k) || ""); } catch {} }, [k]);
  function salvar(v: string) { setTxt(v); try { localStorage.setItem(k, v); setSalvo(true); setTimeout(() => setSalvo(false), 1200); } catch {} }
  return (
    <div className="map-panel">
      <h3>{titulo}</h3>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>{dica}</p>
      <div className="tec-atalhos">
        {atalhos.map(([nome, href]) => (
          <Link key={href} href={href} className="btn" style={{ padding: "8px 14px", fontSize: 13 }}>{nome}</Link>
        ))}
      </div>
      <textarea rows={10} value={txt} onChange={(e) => salvar(e.target.value)} placeholder={`Anote aqui o ${titulo.toLowerCase()}…`} style={{ width: "100%", marginTop: 12 }} />
      <div style={{ fontSize: 12, color: salvo ? "var(--green)" : "var(--muted)", marginTop: 4 }}>{salvo ? "Salvo" : "Salva automaticamente neste navegador"}</div>
    </div>
  );
}
