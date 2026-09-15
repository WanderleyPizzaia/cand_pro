"use client";

import { useEffect, useState } from "react";
import { TEMAS, TIPOS, STATUS, rotulo } from "@/lib/pautas";

type Pauta = {
  id: number; origem: string; nome: string | null; contato: string | null;
  cidade: string | null; bairro: string | null; regiao: string | null;
  tema: string; tipo: string; titulo: string | null; descricao: string;
  status: string; prioridade: string | null; resposta: string | null; criado_em: string;
};
type Conta = { tema?: string; local?: string; c: number };

export default function PautasCliente() {
  const [pautas, setPautas] = useState<Pauta[]>([]);
  const [porTema, setPorTema] = useState<Conta[]>([]);
  const [porBairro, setPorBairro] = useState<Conta[]>([]);
  const [linkSlug, setLinkSlug] = useState<string | null>(null);
  const [fTema, setFTema] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [msg, setMsg] = useState("");
  const [novaAberta, setNovaAberta] = useState(false);
  const [nova, setNova] = useState({ tema: "", tipo: "solicitacao", titulo: "", descricao: "", cidade: "", bairro: "", nome: "", contato: "" });
  const [contatoConversa, setContatoConversa] = useState("");
  const [gerando, setGerando] = useState(false);

  async function carregar() {
    const qs = new URLSearchParams();
    if (fTema) qs.set("tema", fTema);
    if (fStatus) qs.set("status", fStatus);
    const r = await fetch("/api/pautas?" + qs.toString());
    const j = await r.json();
    if (r.ok) {
      setPautas(j.pautas || []);
      setPorTema(j.porTema || []);
      setPorBairro(j.porBairro || []);
      setLinkSlug(j.linkSlug || null);
    } else setMsg(j.erro || "Falha ao carregar.");
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [fTema, fStatus]);

  async function post(body: any) {
    const r = await fetch("/api/pautas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, j: await r.json().catch(() => ({})) };
  }

  async function salvarTriagem(p: Pauta, campos: Partial<Pauta>) {
    setPautas((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...campos } : x)));
    await post({ acao: "atualizar", id: p.id, ...campos });
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!nova.descricao.trim()) { setMsg("Descreva a pauta."); return; }
    const { ok, j } = await post({ acao: "criar", ...nova });
    if (ok) { setNova({ tema: "", tipo: "solicitacao", titulo: "", descricao: "", cidade: "", bairro: "", nome: "", contato: "" }); setNovaAberta(false); setMsg("Pauta registrada."); carregar(); }
    else setMsg(j.erro || "Falha ao registrar.");
  }

  async function gerarDaConversa() {
    if (!contatoConversa.trim()) { setMsg("Informe o número da conversa."); return; }
    setGerando(true); setMsg("");
    const { ok, j } = await post({ acao: "gerar-de-conversa", contato: contatoConversa.trim() });
    setGerando(false);
    if (ok) { setContatoConversa(""); setMsg("Pauta gerada a partir da conversa."); carregar(); }
    else setMsg(j.erro || "Não consegui gerar.");
  }

  const linkPublico = linkSlug ? `${typeof window !== "undefined" ? window.location.origin : ""}/pauta/${linkSlug}` : "";

  return (
    <div className="pautas">
      {/* Barra de ações */}
      <div className="pt-acoes">
        {linkPublico && (
          <button className="btn" onClick={() => { navigator.clipboard?.writeText(linkPublico); setMsg("Link público copiado."); }}>
            Copiar link público de pauta
          </button>
        )}
        <button className="btn btn-primary" onClick={() => setNovaAberta((v) => !v)}>Nova pauta</button>
        <div className="pt-conversa">
          <input value={contatoConversa} onChange={(e) => setContatoConversa(e.target.value)} placeholder="WhatsApp de uma conversa" inputMode="numeric" />
          <button className="btn" onClick={gerarDaConversa} disabled={gerando}>{gerando ? "Gerando…" : "Gerar da conversa (IA)"}</button>
        </div>
      </div>
      {msg && <div className="pt-msg">{msg}</div>}

      {novaAberta && (
        <form className="pt-nova" onSubmit={criar}>
          <div className="pt-grid2">
            <div className="field"><label>Tema</label>
              <select value={nova.tema} onChange={(e) => setNova((s) => ({ ...s, tema: e.target.value }))}>
                <option value="">Selecione</option>{TEMAS.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}
              </select>
            </div>
            <div className="field"><label>Tipo</label>
              <select value={nova.tipo} onChange={(e) => setNova((s) => ({ ...s, tipo: e.target.value }))}>
                {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>Descrição</label>
            <textarea rows={2} value={nova.descricao} onChange={(e) => setNova((s) => ({ ...s, descricao: e.target.value }))} placeholder="O que o eleitor trouxe" />
          </div>
          <div className="pt-grid2">
            <div className="field"><label>Cidade</label><input value={nova.cidade} onChange={(e) => setNova((s) => ({ ...s, cidade: e.target.value }))} /></div>
            <div className="field"><label>Bairro</label><input value={nova.bairro} onChange={(e) => setNova((s) => ({ ...s, bairro: e.target.value }))} /></div>
          </div>
          <button type="submit" className="btn btn-primary">Registrar pauta</button>
        </form>
      )}

      {/* Demografia */}
      <div className="pt-demo">
        <div className="pt-demo-card">
          <div className="pt-demo-tit">Por tema</div>
          {porTema.length === 0 && <div className="pt-vazio">Sem pautas ainda.</div>}
          {porTema.map((t) => (
            <div key={t.tema} className="pt-linha"><span>{rotulo(TEMAS, t.tema || "")}</span><b>{t.c}</b></div>
          ))}
        </div>
        <div className="pt-demo-card">
          <div className="pt-demo-tit">Por bairro / cidade</div>
          {porBairro.length === 0 && <div className="pt-vazio">Sem pautas ainda.</div>}
          {porBairro.map((t, i) => (
            <div key={i} className="pt-linha"><span>{t.local}</span><b>{t.c}</b></div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="pt-filtros">
        <select value={fTema} onChange={(e) => setFTema(e.target.value)}>
          <option value="">Todos os temas</option>{TEMAS.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Todos os status</option>{STATUS.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}
        </select>
      </div>

      {/* Lista */}
      <div className="pt-lista">
        {pautas.length === 0 && <div className="pt-vazio" style={{ padding: 24 }}>Nenhuma pauta neste filtro.</div>}
        {pautas.map((p) => (
          <div key={p.id} className="pt-card">
            <div className="pt-topo">
              <span className={`pt-badge tema-${p.tema}`}>{rotulo(TEMAS, p.tema)}</span>
              <span className={`pt-badge tipo ${p.tipo === "denuncia" ? "den" : ""}`}>{rotulo(TIPOS, p.tipo)}</span>
              <span className="pt-origem">{p.origem}</span>
              <span className="pt-data">{p.criado_em}</span>
            </div>
            {p.titulo && <div className="pt-tit">{p.titulo}</div>}
            <div className="pt-desc">{p.descricao}</div>
            <div className="pt-meta">
              {(p.bairro || p.cidade) && <span>{[p.bairro, p.cidade].filter(Boolean).join(" · ")}</span>}
              {p.nome && <span>{p.nome}</span>}
              {p.contato && <span>{p.contato}</span>}
            </div>
            <div className="pt-triagem">
              <select value={p.status} onChange={(e) => salvarTriagem(p, { status: e.target.value })}>
                {STATUS.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}
              </select>
              <input
                defaultValue={p.resposta || ""}
                placeholder="O que o gabinete fez / vai fazer"
                onBlur={(e) => { if (e.target.value !== (p.resposta || "")) salvarTriagem(p, { resposta: e.target.value }); }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
