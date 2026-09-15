"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "../../components/Icon";

type Linha = { candidato: string; status: string; novos?: number; encontrados?: number };

// Puxa a caixa de entrada de TODAS as instâncias Evolution (server-side, via API)
// e grava cada contato ligado ao agente (agente_id) — base cresce e fica
// organizada por candidato. Também tuna a instância (settings + webhook).
export default function SincronizarContatos() {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [resumo, setResumo] = useState("");

  async function sincronizarTodos() {
    if (!confirm("Sincronizar os contatos de TODOS os números Evolution? Puxa a caixa de entrada de cada um e salva na base (ligado ao candidato)."))
      return;
    setRodando(true);
    setResumo("");
    setLinhas([]);
    try {
      const r = await fetch("/api/agentes/sincronizar-contatos", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      const agentes: { id: number; candidato: string }[] = d.agentes || [];
      if (!agentes.length) {
        setResumo("Nenhum número Evolution para sincronizar.");
        return;
      }
      const acc: Linha[] = agentes.map((a) => ({ candidato: a.candidato, status: "na fila" }));
      setLinhas([...acc]);
      let totalNovos = 0;
      for (let i = 0; i < agentes.length; i++) {
        acc[i] = { ...acc[i], status: "sincronizando…" };
        setLinhas([...acc]);
        try {
          const rr = await fetch("/api/agentes/sincronizar-contatos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agente_id: agentes[i].id }),
          });
          const dd = await rr.json().catch(() => ({}));
          if (rr.ok) {
            totalNovos += dd.novos || 0;
            acc[i] = { candidato: agentes[i].candidato, status: "ok", novos: dd.novos, encontrados: dd.encontrados };
          } else {
            acc[i] = { ...acc[i], status: `erro: ${dd.erro || rr.status}` };
          }
        } catch (e: any) {
          acc[i] = { ...acc[i], status: `erro: ${e.message}` };
        }
        setLinhas([...acc]);
      }
      setResumo(`Concluído — ${totalNovos.toLocaleString("pt-BR")} novo(s) contato(s) na base.`);
      router.refresh();
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="link-card" style={{ marginBottom: 18 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 7 }}><Icon name="refresh" size={16} /> Sincronizar contatos (todos os números)</h3>
      <p>
        Puxa a caixa de entrada de cada número Evolution e salva na base já
        vinculada ao candidato. Idempotente — rodar de novo não duplica.
      </p>
      <button className="btn btn-primary btn-sm" onClick={sincronizarTodos} disabled={rodando}>
        {rodando ? "Sincronizando…" : "Sincronizar tudo"}
      </button>
      {resumo && <div className="msg ok" style={{ marginTop: 10 }}>{resumo}</div>}
      {linhas.length > 0 && (
        <ul className="sync-lista">
          {linhas.map((l, i) => (
            <li key={i}>
              <span className="sync-cand">{l.candidato}</span>
              <span className="sync-status">
                {l.status === "ok" ? (
                  <><Icon name="check" size={13} /> {(l.novos ?? 0).toLocaleString("pt-BR")} novos · {(l.encontrados ?? 0).toLocaleString("pt-BR")} na caixa</>
                ) : (
                  l.status
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
