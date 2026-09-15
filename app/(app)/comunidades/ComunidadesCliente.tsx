"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon, { IconName } from "../../components/Icon";

type Grupo = { nome: string; tipo: string; categoria: string; agentePosta?: boolean; total: number };

const ICONE: Record<string, IconName> = {
  "sociedade-civil": "users",
  "sociedade-publica": "matriz",
  parceiros: "user-plus",
  eleitores: "star",
};

export default function ComunidadesCliente() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [base, setBase] = useState(0);
  const [pode, setPode] = useState(false);
  const [novo, setNovo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    const r = await fetch("/api/grupos", { cache: "no-store" });
    if (r.ok) { const d = await r.json(); setGrupos(d.grupos || []); setBase(d.base || 0); setPode(!!d.podeEditar); }
  }
  useEffect(() => { carregar(); }, []);

  async function salvar(lista: Grupo[]) {
    setSalvando(true);
    try {
      await fetch("/api/grupos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grupos: lista }) });
      await carregar();
    } finally { setSalvando(false); }
  }
  function togglePosta(i: number) { const l = grupos.map((g, k) => k === i ? { ...g, agentePosta: !g.agentePosta } : g); setGrupos(l); salvar(l); }
  function remover(i: number) { if (!confirm("Remover este grupo?")) return; salvar(grupos.filter((_, k) => k !== i)); }
  function adicionar() { const nome = novo.trim(); if (!nome) return; salvar([...grupos, { nome, tipo: "custom", categoria: nome, agentePosta: false, total: 0 }]); setNovo(""); }

  return (
    <div className="comun">
      <div className="comun-grid">
        {grupos.map((g, i) => {
          const pct = base > 0 ? Math.round((g.total / base) * 100) : 0;
          return (
            <div className="comun-card" key={i}>
              <div className="cc-top">
                <span className="cc-ic"><Icon name={ICONE[g.tipo] || "users"} size={18} /></span>
                <div className="cc-nome"><b>{g.nome}</b><small>categoria: {g.categoria}</small></div>
                {pode && <button className="cc-x" onClick={() => remover(i)} title="Remover">✕</button>}
              </div>
              <div className="cc-num"><b>{g.total.toLocaleString("pt-BR")}</b> pessoas <span>· {pct}% da base</span></div>
              <div className="cc-bar"><i style={{ width: pct + "%" }} /></div>
              <div className="cc-acoes">
                <Link className="btn btn-primary" href={`/disparos?categoria=${encodeURIComponent(g.categoria)}`}>Planejar disparo</Link>
                <label className="cc-toggle" title="O agente posta novidades neste grupo (automação)">
                  <input type="checkbox" checked={!!g.agentePosta} onChange={() => togglePosta(i)} disabled={!pode} />
                  <span>Agente posta novidades</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {pode && (
        <div className="map-panel comun-add">
          <h3>Novo grupo</h3>
          <div className="comun-add-row">
            <input placeholder="Nome do grupo (ex.: Agro, Comércio, Igrejas)" value={novo} onChange={(e) => setNovo(e.target.value)} />
            <button className="btn btn-primary" disabled={salvando || !novo.trim()} onClick={adicionar}>Adicionar</button>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>
            Amplie a base conectando o WhatsApp dos parceiros por QR em <Link href="/agentes">Agentes</Link> e sincronizando os contatos. Os disparos respeitam quota e opt-out (LGPD).
          </p>
        </div>
      )}
    </div>
  );
}
