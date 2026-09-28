"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "../../components/Icon";
import { decodificarArquivo, detectarDelimitador, mapearCabecalho, parseCSV } from "@/lib/csv";

// Linhas por pedido: cabe folgado no limite de tempo e de tamanho da Vercel.
const PARTE = 1000;
const fmt = (n: number) => n.toLocaleString("pt-BR");

export default function ImportExport() {
  const router = useRouter();
  const sp = useSearchParams();
  // Exporta respeitando os filtros atuais da tela (candidato, categoria, cidade, etiqueta e busca).
  const exportHref = (() => {
    const p = new URLSearchParams();
    for (const k of ["candidato", "categoria", "cidade", "etiqueta", "q"]) {
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
  const [progresso, setProgresso] = useState("");
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

  // Aviso ao sair no meio da importação (o que já foi continua gravado).
  useEffect(() => {
    if (!importando) return;
    const segurar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", segurar);
    return () => window.removeEventListener("beforeunload", segurar);
  }, [importando]);

  // Lê o arquivo aqui, manda em partes e soma o resultado. Número que já
  // existe no candidato é pulado no servidor: reimportar a mesma planilha
  // completa só o que faltou.
  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reimportar o mesmo arquivo
    if (!file) return;

    setImportando(true);
    setMsg(null);
    try {
      const texto = decodificarArquivo(await file.arrayBuffer());
      const linhas = parseCSV(texto, detectarDelimitador(texto));
      if (linhas.length < 2) {
        setMsg({ t: "err", x: "CSV sem dados (precisa de cabeçalho + linhas)." });
        return;
      }
      const [cabecalho, ...dados] = linhas;
      if (!mapearCabecalho(cabecalho).includes("nome")) {
        setMsg({ t: "err", x: 'O CSV precisa de uma coluna "nome".' });
        return;
      }
      // Vincula ao número selecionado na aba (candidato = id do agente), se houver.
      const cand = sp.get("candidato");
      const url = cand ? `/api/pessoas/import?candidato=${encodeURIComponent(cand)}` : "/api/pessoas/import";
      const soma = { inseridos: 0, duplicados: 0, ignorados: 0, falhas: 0 };
      const linhasErro: number[] = [];

      for (let i = 0; i < dados.length; i += PARTE) {
        setProgresso(`Importando ${fmt(Math.min(i + PARTE, dados.length))} de ${fmt(dados.length)}…`);
        const corpo = JSON.stringify({ cabecalho, linhas: dados.slice(i, i + PARTE), inicio: i });
        let r: Response | null = null;
        let d: any = null;
        // Uma nova tentativa por parte: sem risco de duplicar, o servidor pula o que já entrou.
        for (let tentativa = 0; tentativa < 2; tentativa++) {
          r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo }).catch(() => null);
          d = r ? await r.json().catch(() => null) : null;
          if (r?.ok && d) break;
        }
        if (!r?.ok || !d) {
          setMsg({
            t: "err",
            x:
              `Parou na linha ${fmt(i + 2)}: ${d?.erro || "falha de conexão"}. ${fmt(soma.inseridos)} importado(s) até aqui. ` +
              "Importe o mesmo arquivo de novo: quem já entrou é pulado.",
          });
          router.refresh();
          return;
        }
        soma.inseridos += d.inseridos || 0;
        soma.duplicados += d.duplicados || 0;
        soma.ignorados += d.ignorados || 0;
        soma.falhas += d.falhas || 0;
        for (const er of d.erros || []) linhasErro.push(er.linha);
      }

      const partes = [`${fmt(soma.inseridos)} de ${fmt(dados.length)} importado(s)`];
      if (soma.duplicados) partes.push(`${fmt(soma.duplicados)} já existiam (pulados)`);
      if (soma.ignorados) partes.push(`${fmt(soma.ignorados)} sem nome`);
      if (soma.falhas)
        partes.push(
          `${fmt(soma.falhas)} com erro (linha${soma.falhas > 1 ? "s" : ""} ${linhasErro.slice(0, 5).join(", ")}${soma.falhas > 5 ? "…" : ""})`
        );
      setMsg({ t: soma.falhas ? "err" : "ok", x: partes.join(" · ") + "." });
      router.refresh();
    } catch {
      setMsg({ t: "err", x: "Não consegui ler o arquivo." });
    } finally {
      setImportando(false);
      setProgresso("");
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
            progresso || "Importando…"
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
