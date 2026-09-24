"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon, { IconName } from "./Icon";
import { AREAS, abasVisiveis } from "./navItens";

type Resultado = {
  id: string;
  grupo: "Ações" | "Telas" | "Contatos";
  titulo: string;
  sub?: string;
  icon: IconName;
  href: string;
};

type Contato = {
  id: number;
  nome: string;
  cidade: string | null;
  whatsapp: string | null;
  categoria: string | null;
};

// Compara sem acento e sem caixa ("configuracoes" acha "Configurações").
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function fone(w: string | null) {
  const d = (w || "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length < 10) return w || "";
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

// Busca global (Ctrl K ou /): telas que o perfil pode abrir, atalhos de ação
// e contatos da base (no escopo da sessão).
export default function CommandPalette({
  aberto,
  onFechar,
  perfil,
}: {
  aberto: boolean;
  onFechar: () => void;
  perfil: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [buscando, setBuscando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const telas = useMemo(() => {
    const out: Resultado[] = [];
    for (const area of AREAS) {
      for (const item of area.itens) {
        for (const aba of abasVisiveis(item, perfil)) {
          out.push({
            id: "t:" + aba.href,
            grupo: "Telas",
            titulo: aba.label === item.label ? item.label : `${item.label} · ${aba.label}`,
            sub: area.chave === "inicio" ? undefined : area.titulo,
            icon: aba.icon,
            href: aba.href,
          });
        }
      }
    }
    return out;
  }, [perfil]);

  const acoes = useMemo(() => {
    const out: Resultado[] = [];
    const pode = (href: string) => telas.some((t) => t.href === href);
    if (pode("/pessoas") && perfil !== "LIDER")
      out.push({ id: "a:cadastro", grupo: "Ações", titulo: "Cadastrar contato", icon: "user-plus", href: "/cadastro" });
    if (pode("/disparos"))
      out.push({ id: "a:disparo", grupo: "Ações", titulo: "Novo disparo", icon: "send", href: "/disparos" });
    if (pode("/tarefas"))
      out.push({ id: "a:tarefa", grupo: "Ações", titulo: "Ver tarefas", icon: "tasks", href: "/tarefas" });
    return out;
  }, [telas, perfil]);

  // Abre limpo e com o cursor no campo.
  useEffect(() => {
    if (!aberto) return;
    setQ("");
    setSel(0);
    setContatos([]);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [aberto]);

  // Contatos: busca no servidor com pequena espera enquanto digita.
  useEffect(() => {
    if (!aberto) return;
    const termo = q.trim();
    if (termo.length < 2) {
      setContatos([]);
      return;
    }
    setBuscando(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/busca?q=${encodeURIComponent(termo)}`, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        const d = r.ok ? await r.json() : { contatos: [] };
        setContatos(d.contatos || []);
      } catch {
        /* abortado ou sem rede */
      } finally {
        setBuscando(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, aberto]);

  const resultados = useMemo(() => {
    const termo = norm(q.trim());
    const filtra = (r: Resultado) =>
      !termo || norm(r.titulo).includes(termo) || norm(r.sub || "").includes(termo);
    const cs: Resultado[] = contatos.map((c) => ({
      id: "c:" + c.id,
      grupo: "Contatos",
      titulo: c.nome,
      sub: [c.cidade, c.categoria, fone(c.whatsapp)].filter(Boolean).join(" · "),
      icon: "user",
      href: `/pessoas?q=${encodeURIComponent(c.nome)}&abrir=${c.id}`,
    }));
    const base = termo ? [...acoes.filter(filtra), ...telas.filter(filtra)] : [...acoes, ...telas];
    return [...base, ...cs];
  }, [q, telas, acoes, contatos]);

  useEffect(() => setSel(0), [q]);

  // Mantém o item selecionado visível ao navegar pelas setas.
  useEffect(() => {
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  function ir(r: Resultado | undefined) {
    if (!r) return;
    onFechar();
    router.push(r.href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(resultados.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      ir(resultados[sel]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onFechar();
    }
  }

  if (!aberto) return null;

  let grupoAnterior = "";
  return (
    <div className="cmdk-scrim" onMouseDown={onFechar}>
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cmdk-campo">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            id="cmdk-busca"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Buscar tela, ação ou contato (nome, cidade, número)…"
            aria-label="Buscar"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="cmdk-lista" ref={listaRef} role="listbox">
          {resultados.length === 0 && (
            <div className="cmdk-vazio">
              {buscando ? "Buscando…" : `Nada encontrado para "${q}".`}
            </div>
          )}
          {resultados.map((r, i) => {
            const cab = r.grupo !== grupoAnterior ? r.grupo : null;
            grupoAnterior = r.grupo;
            return (
              <div key={r.id}>
                {cab && <div className="cmdk-grupo">{cab}</div>}
                <button
                  type="button"
                  data-i={i}
                  role="option"
                  aria-selected={i === sel}
                  className={`cmdk-item${i === sel ? " sel" : ""}`}
                  onMouseMove={() => setSel(i)}
                  onClick={() => ir(r)}
                >
                  <Icon name={r.icon} size={16} />
                  <span className="cmdk-tit">{r.titulo}</span>
                  {r.sub && <span className="cmdk-sub">{r.sub}</span>}
                </button>
              </div>
            );
          })}
          {buscando && resultados.length > 0 && <div className="cmdk-vazio">Buscando contatos…</div>}
        </div>
        <div className="cmdk-rodape">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> abrir</span>
        </div>
      </div>
    </div>
  );
}
