"use client";

import { useEffect, useState } from "react";
import Icon from "../../components/Icon";

// CRUD das opções de "Função / Cargo" do cadastro (guardadas no config).
// "Outro" é fixo (garante o campo livre "qual") e não é editável/removível.
export default function EditorCargos() {
  const [funcoes, setFuncoes] = useState<string[]>([]);
  const [nova, setNova] = useState("");
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/funcoes", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setFuncoes((d.funcoes || []).filter((f: string) => f !== "Outro")))
      .catch(() => {});
  }, []);

  function editar(i: number, v: string) {
    setFuncoes((fs) => fs.map((f, k) => (k === i ? v : f)));
  }
  function remover(i: number) {
    setFuncoes((fs) => fs.filter((_, k) => k !== i));
  }
  function mover(i: number, dir: -1 | 1) {
    setFuncoes((fs) => {
      const j = i + dir;
      if (j < 0 || j >= fs.length) return fs;
      const c = [...fs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  }
  function adicionar() {
    const v = nova.trim();
    if (!v) return;
    if (funcoes.some((f) => f.toLowerCase() === v.toLowerCase())) {
      setMsg({ t: "err", x: "Esse cargo já existe." });
      return;
    }
    setFuncoes((fs) => [...fs, v]);
    setNova("");
    setMsg(null);
  }

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    try {
      // "Outro" é reanexado no backend automaticamente.
      const r = await fetch("/api/funcoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funcoes }),
      });
      const d = await r.json();
      if (!r.ok) setMsg({ t: "err", x: d.erro || "Erro ao salvar." });
      else {
        setFuncoes((d.funcoes || []).filter((f: string) => f !== "Outro"));
        setMsg({ t: "ok", x: "Cargos salvos! Já aparecem no cadastro." });
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="form-card" style={{ maxWidth: 560 }}>
      {msg && <div className={`msg ${msg.t}`}>{msg.x}</div>}

      <div className="field">
        <label>Adicionar cargo</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), adicionar())}
            placeholder="Ex.: Radialista, Advogado, Comerciante"
          />
          <button type="button" className="btn btn-sm" onClick={adicionar}><Icon name="plus" size={14} /> Add</button>
        </div>
      </div>

      <div className="cargos-lista">
        {funcoes.map((f, i) => (
          <div className="cargo-row" key={i}>
            <input value={f} onChange={(e) => editar(i, e.target.value)} />
            <button type="button" title="Subir" onClick={() => mover(i, -1)} disabled={i === 0}>↑</button>
            <button type="button" title="Descer" onClick={() => mover(i, 1)} disabled={i === funcoes.length - 1}>↓</button>
            <button type="button" title="Remover" className="cargo-del" onClick={() => remover(i)}><Icon name="x" size={14} /></button>
          </div>
        ))}
        <div className="cargo-row cargo-fixo">
          <input value="Outro (campo livre)" disabled />
          <span className="muted" style={{ fontSize: 12 }}>fixo</span>
        </div>
      </div>

      <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando} style={{ marginTop: 14 }}>
        {salvando ? "Salvando…" : "Salvar cargos"}
      </button>
    </div>
  );
}
