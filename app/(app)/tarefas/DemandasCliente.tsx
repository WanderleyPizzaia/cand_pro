"use client";

import { useCallback, useEffect, useState } from "react";
import CountUp from "../../components/CountUp";
import Icon from "../../components/Icon";

export const PRIORIDADE = ["Baixa", "Média", "Alta"];

type Opcao = { id: number; nome: string; perfil?: string };

type Demanda = {
  id: number;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  status: string;
  prioridade: string;
  eleitor_id: number | null;
  responsavel_id: number | null;
  cidade: string | null;
  bairro: string | null;
  prazo_fmt: string | null;
  criado_fmt: string;
  responsavel_nome: string | null;
  eleitor_nome: string | null;
};

function corPrioridade(p: string): string {
  if (p === "Alta") return "var(--red)";
  if (p === "Média") return "var(--yellow)";
  return "var(--muted)";
}

const FORM_VAZIO = {
  titulo: "",
  categoria: "",
  prioridade: "Média",
  responsavel_id: "",
  eleitor_id: "",
  cidade: "",
  bairro: "",
  prazo: "",
  descricao: "",
};

export default function DemandasCliente({
  usuarios,
  pessoas,
}: {
  usuarios: Opcao[];
  pessoas: Opcao[];
}) {
  const [demandas, setDemandas] = useState<Demanda[]>([]);
  const [colunas, setColunas] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [colunaNova, setColunaNova] = useState(""); // coluna alvo do form
  const [form, setForm] = useState({ ...FORM_VAZIO });
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [rd, rk] = await Promise.all([
        fetch("/api/demandas", { cache: "no-store" }),
        fetch("/api/kanban", { cache: "no-store" }),
      ]);
      if (rd.ok) setDemandas((await rd.json()) as Demanda[]);
      if (rk.ok) setColunas((await rk.json()).colunas as string[]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function salvarColunas(novas: string[]) {
    setColunas(novas);
    await fetch("/api/kanban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colunas: novas }),
    });
  }

  async function patchStatus(id: number, status: string) {
    await fetch("/api/demandas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
  }

  // ---- Cards ----
  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim()) {
      setMsg({ tipo: "err", texto: "Informe o título da demanda." });
      return;
    }
    const status = colunaNova || colunas[0] || "Aberta";
    const r = await fetch("/api/demandas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, status }),
    });
    if (r.ok) {
      setForm({ ...FORM_VAZIO });
      setFormAberto(false);
      setMsg({ tipo: "ok", texto: "Demanda criada." });
      carregar();
    } else {
      const d = await r.json().catch(() => ({}));
      setMsg({ tipo: "err", texto: d.erro || "Erro ao criar." });
    }
  }

  async function remover(id: number) {
    if (!confirm("Remover esta demanda?")) return;
    setDemandas((p) => p.filter((d) => d.id !== id));
    await fetch(`/api/demandas?id=${id}`, { method: "DELETE" });
  }

  function mover(id: number, status: string) {
    setDemandas((p) => p.map((d) => (d.id === id ? { ...d, status } : d)));
    patchStatus(id, status);
  }

  // ---- Colunas ----
  async function addColuna() {
    const nome = prompt("Nome da nova coluna:")?.trim();
    if (!nome) return;
    if (colunas.includes(nome)) return;
    salvarColunas([...colunas, nome]);
  }

  async function renomearColuna(idx: number) {
    const atual = colunas[idx];
    const novo = prompt("Renomear coluna:", atual)?.trim();
    if (!novo || novo === atual) return;
    // migra os cards desta coluna para o novo nome
    const afetadas = demandas.filter((d) => d.status === atual);
    setDemandas((p) => p.map((d) => (d.status === atual ? { ...d, status: novo } : d)));
    await Promise.all(afetadas.map((d) => patchStatus(d.id, novo)));
    salvarColunas(colunas.map((c, i) => (i === idx ? novo : c)));
  }

  async function excluirColuna(idx: number) {
    if (colunas.length <= 1) {
      alert("Mantenha ao menos uma coluna.");
      return;
    }
    const nome = colunas[idx];
    const cards = demandas.filter((d) => d.status === nome);
    const destino = colunas[idx === 0 ? 1 : 0];
    if (!confirm(`Excluir a coluna "${nome}"? ${cards.length} card(s) vão para "${destino}".`))
      return;
    setDemandas((p) => p.map((d) => (d.status === nome ? { ...d, status: destino } : d)));
    await Promise.all(cards.map((d) => patchStatus(d.id, destino)));
    salvarColunas(colunas.filter((_, i) => i !== idx));
  }

  function moverColuna(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= colunas.length) return;
    const novas = [...colunas];
    [novas[idx], novas[j]] = [novas[j], novas[idx]];
    salvarColunas(novas);
  }

  const cardsDe = (col: string) => demandas.filter((d) => d.status === col);

  return (
    <>
      <div className="kanban-toolbar">
        <div className="kanban-resumo">
          <b><CountUp value={demandas.length} /></b> demanda(s) ·{" "}
          {colunas.length} coluna(s)
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" style={{ flex: "none" }} onClick={addColuna}>
            ＋ Coluna
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: "none" }}
            onClick={() => {
              setColunaNova(colunas[0] || "");
              setFormAberto((v) => !v);
            }}
          >
            {formAberto ? "✕ Fechar" : "＋ Nova demanda"}
          </button>
        </div>
      </div>

      {msg && <div className={`msg ${msg.tipo}`}>{msg.texto}</div>}

      {formAberto && (
        <form className="form-card" style={{ maxWidth: "none", marginBottom: 18 }} onSubmit={criar}>
          <div className="grid2">
            <div className="field full">
              <label>Título <span className="req">*</span></label>
              <input value={form.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ex.: Poda de árvore na Rua X" />
            </div>
            <div className="field">
              <label>Coluna</label>
              <select value={colunaNova} onChange={(e) => setColunaNova(e.target.value)}>
                {colunas.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Prioridade</label>
              <select value={form.prioridade} onChange={(e) => set("prioridade", e.target.value)}>
                {PRIORIDADE.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Categoria</label>
              <input value={form.categoria} onChange={(e) => set("categoria", e.target.value)} placeholder="Infraestrutura, Saúde…" />
            </div>
            <div className="field">
              <label>Responsável</label>
              <select value={form.responsavel_id} onChange={(e) => set("responsavel_id", e.target.value)}>
                <option value="">- ninguém -</option>
                {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Eleitor vinculado</label>
              <select value={form.eleitor_id} onChange={(e) => set("eleitor_id", e.target.value)}>
                <option value="">- nenhum -</option>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Cidade</label>
              <input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
            </div>
            <div className="field">
              <label>Prazo</label>
              <input type="date" value={form.prazo} onChange={(e) => set("prazo", e.target.value)} />
            </div>
            <div className="field full">
              <label>Descrição</label>
              <textarea value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
            </div>
          </div>
          <div className="actions">
            <button type="submit" className="btn btn-primary">Salvar demanda</button>
            <button type="button" className="btn btn-ghost" onClick={() => setFormAberto(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {carregando ? (
        <div className="empty">Carregando…</div>
      ) : (
        <div className="kanban">
          {colunas.map((col, idx) => (
            <div
              key={col}
              className={`kanban-col${sobre === col ? " sobre" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setSobre(col); }}
              onDragLeave={() => setSobre((s) => (s === col ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setSobre(null);
                const id = Number(e.dataTransfer.getData("id"));
                if (id) mover(id, col);
              }}
            >
              <div className="kanban-col-head">
                <span className="kc-nome">{col}</span>
                <span className="kc-count">{cardsDe(col).length}</span>
                <span className="kc-menu">
                  <button type="button" onClick={() => moverColuna(idx, -1)} title="Mover para a esquerda" aria-label="Mover coluna para a esquerda" disabled={idx === 0}><Icon name="chevron-left" size={14} /></button>
                  <button type="button" onClick={() => moverColuna(idx, 1)} title="Mover para a direita" aria-label="Mover coluna para a direita" disabled={idx === colunas.length - 1}><Icon name="chevron-right" size={14} /></button>
                  <button type="button" onClick={() => renomearColuna(idx)} title="Renomear" aria-label="Renomear coluna"><Icon name="edit" size={13} /></button>
                  <button type="button" onClick={() => excluirColuna(idx)} title="Excluir coluna" aria-label="Excluir coluna" className="perigo"><Icon name="x" size={13} /></button>
                </span>
              </div>

              <div className="kanban-cards">
                {cardsDe(col).map((d) => (
                  <div
                    key={d.id}
                    className="kanban-card"
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("id", String(d.id)); setArrastando(d.id); }}
                    onDragEnd={() => setArrastando(null)}
                    style={arrastando === d.id ? { opacity: 0.5 } : undefined}
                  >
                    <div className="kc-titulo">{d.titulo}</div>
                    <div className="kc-tags">
                      <span className="kc-prio" style={{ color: corPrioridade(d.prioridade) }}><i className="kc-prio-dot" aria-hidden="true" /> {d.prioridade}</span>
                      {d.categoria && <span className="tag">{d.categoria}</span>}
                    </div>
                    {(d.responsavel_nome || d.eleitor_nome || d.cidade) && (
                      <div className="kc-meta">
                        {d.responsavel_nome && <span><Icon name="user" size={12} /> {d.responsavel_nome}</span>}
                        {d.eleitor_nome && <span><Icon name="star" size={12} /> {d.eleitor_nome}</span>}
                        {d.cidade && <span><Icon name="map-pin" size={12} /> {d.cidade}</span>}
                      </div>
                    )}
                    <div className="kc-rodape">
                      <span className="kc-prazo">{d.prazo_fmt || ""}</span>
                      <button className="kc-del" onClick={() => remover(d.id)} title="Remover">✕</button>
                    </div>
                  </div>
                ))}
                {cardsDe(col).length === 0 && (
                  <div className="kanban-vazio">arraste cards para cá</div>
                )}
              </div>
            </div>
          ))}

          <button className="kanban-add-col" onClick={addColuna} title="Nova coluna">
            ＋ coluna
          </button>
        </div>
      )}
    </>
  );
}
