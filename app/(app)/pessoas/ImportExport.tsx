"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "../../components/Icon";

export default function ImportExport() {
  const router = useRouter();
  const sp = useSearchParams();
  // Exporta respeitando os filtros atuais da tela (candidato, categoria, cidade e busca).
  const exportHref = (() => {
    const p = new URLSearchParams();
    for (const k of ["candidato", "categoria", "cidade", "q"]) {
      const v = sp.get(k);
      if (v) p.set(k, v);
    }
    const qs = p.toString();
    return "/api/pessoas/export" + (qs ? `?${qs}` : "");
  })();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);
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
    <div className="acoes-sub">
      <div className="menu-wrap" ref={menuRef}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setMenu((m) => !m)}
          aria-expanded={menu}
          aria-haspopup="menu"
          disabled={importando || sincFotos}
        >
          {importando ? (
            "Importando…"
          ) : sincFotos ? (
            "Buscando fotos…"
          ) : (
            <>
              <Icon name="file-text" size={16} /> Planilha <Icon name="chevron-down" size={14} />
            </>
          )}
        </button>
        {menu && (
          <div className="menu menu-dir" role="menu">
            <a href={exportHref} role="menuitem" onClick={() => setMenu(false)}>
              <Icon name="download" size={16} /> Exportar CSV (com os filtros atuais)
            </a>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                inputRef.current?.click();
              }}
            >
              <Icon name="upload" size={16} /> Importar CSV
            </button>
            <hr />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                sincronizarFotos();
              }}
            >
              <Icon name="refresh" size={16} /> Buscar fotos do WhatsApp
            </button>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={aoEscolher}
        hidden
      />
      {msg && <span className={`acoes-msg ${msg.t === "ok" ? "ok" : "err"}`}>{msg.x}</span>}
    </div>
  );
}
