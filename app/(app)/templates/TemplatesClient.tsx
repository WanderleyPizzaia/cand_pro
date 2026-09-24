"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "../../components/Icon";

type AgenteOpt = { id: number; nome: string; waba: string | null };
type Variavel = { pos: number; rotulo: string; campo: string; exemplo: string };
type Botao = { tipo: "URL" | "RAPIDA"; texto: string; url: string };
type Template = {
  id: number; nome: string; categoria: string; status: string;
  motivo_rejeicao: string | null; idioma: string;
  categoria_original: string | null;
};

const CAMPOS = ["nome", "whatsapp", "email", "cidade", "regiao", "bairro", "partido", "funcao", "categoria", "instagram"];
const CORES: Record<string, string> = { APROVADO: "var(--green)", PENDENTE: "var(--yellow)", REJEITADO: "var(--red)" };

export default function TemplatesClient({ agentes }: { agentes: AgenteOpt[] }) {
  const [agenteId, setAgenteId] = useState<number | null>(agentes[0]?.id ?? null);
  const [lista, setLista] = useState<Template[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState(false);

  // Form
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("UTILITY");
  const [headerTipo, setHeaderTipo] = useState<"NENHUM" | "TEXTO">("NENHUM");
  const [headerTexto, setHeaderTexto] = useState("");
  const [corpo, setCorpo] = useState("");
  const corpoRef = useRef<HTMLTextAreaElement>(null);
  const [variaveis, setVariaveis] = useState<Variavel[]>([]);
  const [rodape, setRodape] = useState("");
  const [botoes, setBotoes] = useState<Botao[]>([]);
  const [msg, setMsg] = useState("");
  // Teste inline (substitui o prompt/alert nativo do navegador).
  const [testId, setTestId] = useState<number | null>(null);
  const [numTeste, setNumTeste] = useState("");
  const [enviandoTeste, setEnviandoTeste] = useState(false);
  const [testMsg, setTestMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);

  async function carregar() {
    if (!agenteId) return;
    setCarregando(true);
    const r = await fetch(`/api/templates?agente=${agenteId}`);
    const d = await r.json();
    setLista(Array.isArray(d) ? d : []);
    setCarregando(false);
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [agenteId]);

  function addVariavel() {
    const pos = variaveis.length + 1;
    const token = `{{${pos}}}`;
    const ta = corpoRef.current;
    // Insere o marcador na posição do cursor (não grudado no fim, que a Meta recusa).
    const ini = ta ? ta.selectionStart : corpo.length;
    const fim = ta ? ta.selectionEnd : corpo.length;
    const novo = corpo.slice(0, ini) + token + corpo.slice(fim);
    setCorpo(novo);
    setVariaveis((v) => [...v, { pos, rotulo: "", campo: "nome", exemplo: "" }]);
    // Reposiciona o cursor logo após o marcador inserido.
    requestAnimationFrame(() => {
      if (!ta) return;
      const p = ini + token.length;
      ta.focus();
      ta.setSelectionRange(p, p);
    });
  }
  function setVar(i: number, patch: Partial<Variavel>) {
    setVariaveis((v) => v.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function addBotao() {
    if (botoes.length >= 3) return;
    setBotoes((b) => [...b, { tipo: "URL", texto: "", url: "" }]);
  }
  function setBotao(i: number, patch: Partial<Botao>) {
    setBotoes((b) => b.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  function preview(): string {
    let t = corpo;
    for (const v of variaveis) t = t.replaceAll(`{{${v.pos}}}`, v.exemplo || `{{${v.rotulo || v.pos}}}`);
    return t;
  }

  async function salvar() {
    setMsg("");
    const header =
      headerTipo === "TEXTO" ? { formato: "TEXTO", texto: headerTexto } : null;
    const body = {
      agente_id: agenteId, nome, categoria, idioma: "pt_BR",
      header, corpo,
      variaveis: variaveis.map((v) => ({ pos: v.pos, rotulo: v.rotulo, campo: v.campo || null, exemplo: v.exemplo })),
      rodape: rodape || null,
      botoes: botoes.map((b) => ({ tipo: b.tipo, texto: b.texto, url: b.url })),
    };
    const r = await fetch("/api/templates", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) { setMsg(d.erro || "Erro ao criar"); return; }
    setAberto(false);
    setNome(""); setCorpo(""); setVariaveis([]); setRodape(""); setBotoes([]); setHeaderTipo("NENHUM");
    carregar();
  }

  async function excluir(id: number) {
    if (!confirm("Excluir este template na Meta e localmente?")) return;
    await fetch(`/api/templates?id=${id}`, { method: "DELETE" });
    carregar();
  }
  function abrirTeste(id: number) {
    setTestId((cur) => (cur === id ? null : id));
    setNumTeste("");
    setTestMsg(null);
  }
  async function enviarTeste(id: number) {
    const numero = numTeste.replace(/\D/g, "");
    if (numero.length < 10) {
      setTestMsg({ t: "err", x: "Digite o número com DDD (ex.: 11987654321)." });
      return;
    }
    setEnviandoTeste(true);
    setTestMsg(null);
    try {
      const r = await fetch("/api/templates?teste=1", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, numero }),
      });
      const d = await r.json().catch(() => ({} as any));
      setTestMsg(r.ok ? { t: "ok", x: "Enviado! ✓" } : { t: "err", x: d.erro || `Falha ao enviar (HTTP ${r.status}).` });
      if (r.ok) setNumTeste("");
    } finally {
      setEnviandoTeste(false);
    }
  }

  if (!agentes.length)
    return <p className="page-sub">Nenhum agente Meta configurado. Configure um agente com provedor Meta primeiro.</p>;

  const agente = agentes.find((a) => a.id === agenteId);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <select value={agenteId ?? ""} onChange={(e) => setAgenteId(Number(e.target.value))}>
          {agentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => setAberto((v) => !v)}>
          <Icon name="plus" size={16} /> Novo template
        </button>
        {agente && !agente.waba && <span style={{ color: "var(--red)" }}>Este agente não tem WABA configurada.</span>}
      </div>

      {aberto && (
        <form className="form-card" style={{ marginBottom: 20 }} onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <div className="grid2">
            <div className="field">
              <label>Nome (slug)</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="boas_vindas" />
            </div>
            <div className="field">
              <label>Categoria</label>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="UTILITY">Utilidade</option>
                <option value="MARKETING">Marketing</option>
              </select>
            </div>

            <div className="field full">
              <label>Cabeçalho</label>
              <select value={headerTipo} onChange={(e) => setHeaderTipo(e.target.value as any)}>
                <option value="NENHUM">Nenhum</option>
                <option value="TEXTO">Texto</option>
              </select>
              {headerTipo === "TEXTO" && (
                <input style={{ marginTop: 8 }} placeholder="Texto do cabeçalho" value={headerTexto} onChange={(e) => setHeaderTexto(e.target.value)} />
              )}
            </div>

            <div className="field full">
              <label>Corpo</label>
              <textarea ref={corpoRef} rows={4} value={corpo} onChange={(e) => setCorpo(e.target.value)} placeholder="Olá {{1}}, ..." />
              <button type="button" className="btn" style={{ marginTop: 8 }} onClick={addVariavel}>
                <Icon name="plus" size={14} /> Variável
              </button>
            </div>

            {variaveis.map((v, i) => (
              <div key={i} className="field full" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <strong>{`{{${v.pos}}}`}</strong>
                <input placeholder="Rótulo" value={v.rotulo} onChange={(e) => setVar(i, { rotulo: e.target.value })} />
                <select value={v.campo} onChange={(e) => setVar(i, { campo: e.target.value })}>
                  {CAMPOS.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="">(manual)</option>
                </select>
                <input placeholder="Exemplo" value={v.exemplo} onChange={(e) => setVar(i, { exemplo: e.target.value })} />
              </div>
            ))}

            <div className="field">
              <label>Rodapé</label>
              <input value={rodape} onChange={(e) => setRodape(e.target.value)} placeholder="Opcional" />
            </div>

            <div className="field full">
              <button type="button" className="btn" onClick={addBotao}>
                <Icon name="plus" size={14} /> Botão
              </button>
              {botoes.map((b, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <select value={b.tipo} onChange={(e) => setBotao(i, { tipo: e.target.value as any })}>
                    <option value="URL">URL</option>
                    <option value="RAPIDA">Resposta rápida</option>
                  </select>
                  <input placeholder="Texto do botão" value={b.texto} onChange={(e) => setBotao(i, { texto: e.target.value })} />
                  {b.tipo === "URL" && <input placeholder="https://..." value={b.url} onChange={(e) => setBotao(i, { url: e.target.value })} />}
                </div>
              ))}
            </div>

            <div className="field full">
              <label>Prévia</label>
              <div className="empty" style={{ whiteSpace: "pre-wrap", textAlign: "left" }}>{preview() || "—"}</div>
            </div>
          </div>

          {msg && <div className="msg err">{msg}</div>}
          <div className="actions" style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn btn-primary">Enviar para aprovação</button>
            <button type="button" className="btn" onClick={() => setAberto(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {carregando ? <p className="page-sub">Carregando...</p> : (
        <div className="table-wrap">
          {!lista.length ? (
            <div className="empty">Nenhum template ainda.</div>
          ) : (
            <table>
              <thead><tr><th>Nome</th><th>Categoria</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.id}>
                    <td>{t.nome}</td>
                    <td>
                      {t.categoria}
                      {t.categoria_original && t.categoria_original !== t.categoria && (
                        <div style={{ fontSize: 12, color: "var(--yellow)", display: "flex", alignItems: "center", gap: 4 }} title="A Meta reclassificou a categoria deste template">
                          <Icon name="alert" size={12} /> reclassificado pela Meta ({t.categoria_original} para {t.categoria})
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ color: CORES[t.status] || "var(--muted)", fontWeight: 600 }}>{t.status}</span>
                      {t.motivo_rejeicao && <div style={{ fontSize: 12, color: "var(--red)" }}>{t.motivo_rejeicao}</div>}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {t.status === "APROVADO" && (
                          <button className="btn" onClick={() => abrirTeste(t.id)}>
                            {testId === t.id ? "Fechar" : "Testar"}
                          </button>
                        )}
                        <button className="btn" onClick={() => excluir(t.id)}><Icon name="x" size={14} /></button>
                      </div>
                      {testId === t.id && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, minWidth: 240 }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <input
                              autoFocus
                              value={numTeste}
                              onChange={(e) => setNumTeste(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && enviarTeste(t.id)}
                              placeholder="Número com DDD (ex.: 11987654321)"
                              style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-2)" }}
                            />
                            <button className="btn btn-primary" disabled={enviandoTeste} onClick={() => enviarTeste(t.id)}>
                              {enviandoTeste ? "…" : "Enviar"}
                            </button>
                          </div>
                          {testMsg && (
                            <span style={{ fontSize: 12.5, color: testMsg.t === "ok" ? "var(--green)" : "var(--red)" }}>
                              {testMsg.x}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
