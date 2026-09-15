"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "../../components/Icon";

export default function ImportExport() {
  const router = useRouter();
  const sp = useSearchParams();
  // Exporta respeitando o filtro atual da tela (candidato selecionado + busca).
  const exportHref = (() => {
    const p = new URLSearchParams();
    const cand = sp.get("candidato");
    const q = sp.get("q");
    if (cand) p.set("candidato", cand);
    if (q) p.set("q", q);
    const qs = p.toString();
    return "/api/pessoas/export" + (qs ? `?${qs}` : "");
  })();
  const inputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);
  const [importando, setImportando] = useState(false);
  const [sincFotos, setSincFotos] = useState(false);

  async function sincronizarFotos() {
    setSincFotos(true);
    setMsg(null);
    let offset = 0;
    let totalAtualizadas = 0;
    let totalErros = 0;
    try {
      while (true) {
        const r = await fetch("/api/pessoas/sync-fotos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset }),
        });
        const d = await r.json();
        if (!r.ok) { setMsg({ t: "err", x: d.erro || "Erro ao buscar fotos." }); break; }
        totalAtualizadas += d.atualizadas;
        totalErros += d.erros;
        if (d.pendentes === 0 || d.processadas === 0) break;
        offset = d.proximoOffset;
        setMsg({ t: "ok", x: `Buscando fotos… ${totalAtualizadas} atualizadas` });
      }
      setMsg({ t: "ok", x: `${totalAtualizadas} foto(s) sincronizada(s).${totalErros ? ` ${totalErros} sem foto.` : ""}` });
      router.refresh();
    } catch {
      setMsg({ t: "err", x: "Falha ao sincronizar fotos." });
    } finally {
      setSincFotos(false);
    }
  }

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reimportar o mesmo arquivo
    if (!file) return;

    setImportando(true);
    setMsg(null);
    try {
      const texto = await file.text();
      // Vincula ao número selecionado na aba (candidato = id do agente), se houver.
      const cand = sp.get("candidato");
      const url = cand ? `/api/pessoas/import?candidato=${encodeURIComponent(cand)}` : "/api/pessoas/import";
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: texto,
      });
      const d = await r.json();
      if (!r.ok) {
        setMsg({ t: "err", x: d.erro || "Erro ao importar." });
      } else {
        const extra = d.ignorados ? ` · ${d.ignorados} ignorado(s)` : "";
        const erro = d.erros?.length ? ` · ${d.erros.length} com erro` : "";
        setMsg({
          t: "ok",
          x: `${d.inseridos} cadastro(s) importado(s)${extra}${erro}.`,
        });
        router.refresh();
      }
    } catch {
      setMsg({ t: "err", x: "Não consegui ler o arquivo." });
    } finally {
      setImportando(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <a href={exportHref} className="btn btn-ghost" style={{ flex: "none" }}>
        <Icon name="download" size={16} /> Exportar CSV
      </a>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ flex: "none" }}
        onClick={() => inputRef.current?.click()}
        disabled={importando}
      >
        {importando ? "Importando…" : <><Icon name="upload" size={16} /> Importar CSV</>}
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ flex: "none" }}
        onClick={sincronizarFotos}
        disabled={sincFotos}
        title="Busca foto de perfil do WhatsApp para cada contato"
      >
        {sincFotos ? "Buscando fotos…" : <><Icon name="download" size={16} /> Sync fotos</>}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={aoEscolher}
        style={{ display: "none" }}
      />
      {msg && (
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: msg.t === "ok" ? "var(--green)" : "var(--red)",
          }}
        >
          {msg.x}
        </span>
      )}
    </div>
  );
}
