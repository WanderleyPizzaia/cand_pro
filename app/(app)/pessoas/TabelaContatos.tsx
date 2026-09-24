"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "../../components/Icon";

export type LinhaContato = {
  id: number;
  nome: string | null; // null = sem nome real (só o número)
  categoria: string | null;
  funcao: string | null;
  partido: string | null;
  cidade: string | null;
  regiao: string | null;
  bairro: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram: string | null;
  observacao: string | null;
  foto: string | null;
  candidato: string | null;
  agenteId: number | null;
  autor: string | null;
  criadoEm: string;
};

type Lista = { id: number; nome: string; agente_nome?: string | null; membros?: number };

export function formatFone(w: string | null) {
  const d = (w || "").replace(/\D/g, "");
  const n = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return w || "";
}

function iniciais(nome: string | null) {
  const p = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

// O banco devolve "2026-09-24 17:02:29.1-03": vira ISO válido ("…T…-03:00").
function lerData(iso: string): Date {
  const s = String(iso).trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  return new Date(s);
}

function dataRelativa(iso: string) {
  const t = lerData(iso).getTime();
  if (Number.isNaN(t)) return "";
  const dias = Math.floor((Date.now() - t) / 86400000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  if (dias < 14) return "há 1 semana";
  if (dias < 60) return `há ${Math.floor(dias / 7)} semanas`;
  return new Date(t).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function dataCompleta(iso: string) {
  const t = lerData(iso);
  if (Number.isNaN(t.getTime())) return "";
  // Fuso fixo: o servidor (UTC) e o navegador precisam escrever a mesma hora.
  return t.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
}

function Avatar({ c, grande }: { c: LinhaContato; grande?: boolean }) {
  const [erro, setErro] = useState(false);
  return (
    <span className={`av${grande ? " av-lg" : ""}`}>
      {c.foto && !erro ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.foto} alt="" referrerPolicy="no-referrer" onError={() => setErro(true)} />
      ) : (
        iniciais(c.nome)
      )}
    </span>
  );
}

function conversaHref(c: LinhaContato) {
  const n = (c.whatsapp || "").replace(/\D/g, "");
  if (!n) return null;
  return `/inbox?contato=${n}${c.agenteId ? `&agente=${c.agenteId}` : ""}`;
}

// CSV dos selecionados, gerado no navegador (mesmas colunas do export).
function baixarCSV(linhas: LinhaContato[]) {
  const cols: [string, (c: LinhaContato) => string | null][] = [
    ["nome", (c) => c.nome],
    ["categoria", (c) => c.categoria],
    ["funcao", (c) => c.funcao],
    ["partido", (c) => c.partido],
    ["cidade", (c) => c.cidade],
    ["regiao", (c) => c.regiao],
    ["bairro", (c) => c.bairro],
    ["whatsapp", (c) => c.whatsapp],
    ["email", (c) => c.email],
    ["instagram", (c) => c.instagram],
    ["observacao", (c) => c.observacao],
    ["candidato", (c) => c.candidato],
  ];
  const cel = (v: string | null) => {
    const s = v ?? "";
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv =
    "﻿" +
    [cols.map(([h]) => h).join(";"), ...linhas.map((c) => cols.map(([, f]) => cel(f(c))).join(";"))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `contatos-selecionados-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TabelaContatos({
  linhas,
  mostrarCandidato,
  podeListas,
  abrirId,
}: {
  linhas: LinhaContato[];
  mostrarCandidato: boolean;
  podeListas: boolean;
  abrirId: number | null;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [abertoId, setAbertoId] = useState<number | null>(abrirId);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [excluir, setExcluir] = useState<LinhaContato | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);
  const [aviso, setAviso] = useState<{ t: "ok" | "err"; x: string } | null>(null);

  // Se a página mudar (filtro, busca), a seleção antiga não vale mais.
  const idsDaPagina = useMemo(() => linhas.map((l) => l.id).join(","), [linhas]);
  useEffect(() => {
    setSel(new Set());
    setMenuId(null);
  }, [idsDaPagina]);
  useEffect(() => setAbertoId(abrirId), [abrirId]);

  const aberto = linhas.find((l) => l.id === abertoId) || null;
  const todos = linhas.length > 0 && sel.size === linhas.length;
  const selecionados = linhas.filter((l) => sel.has(l.id));

  function alternar(id: number) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // Esc fecha o que estiver aberto (menu, painel).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menuId) setMenuId(null);
      else if (abertoId && !excluir && !listaAberta) setAbertoId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuId, abertoId, excluir, listaAberta]);

  useEffect(() => {
    if (!menuId) return;
    const fora = () => setMenuId(null);
    const t = setTimeout(() => document.addEventListener("click", fora), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", fora);
    };
  }, [menuId]);

  async function confirmarExclusao() {
    if (!excluir) return;
    setExcluindo(true);
    const r = await fetch(`/api/pessoas?id=${excluir.id}`, { method: "DELETE" });
    setExcluindo(false);
    if (r.ok) {
      setAviso({ t: "ok", x: `${excluir.nome || "Contato"} foi excluído.` });
      if (abertoId === excluir.id) setAbertoId(null);
      setExcluir(null);
      router.refresh();
    } else {
      const d = await r.json().catch(() => ({}));
      setAviso({ t: "err", x: d.erro || "Não foi possível excluir." });
      setExcluir(null);
    }
  }

  return (
    <>
      {aviso && (
        <div className={`msg ${aviso.t}`} role="status">
          {aviso.x}
          <button type="button" className="msg-x" onClick={() => setAviso(null)} aria-label="Fechar aviso">
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {sel.size > 0 && (
        <div className="ct-bulk" role="region" aria-label="Ações com os selecionados">
          <b>
            {sel.size} {sel.size === 1 ? "selecionado" : "selecionados"}
          </b>
          {podeListas && (
            <button type="button" className="btn-link" onClick={() => setListaAberta(true)}>
              <Icon name="list" size={15} /> Adicionar à lista
            </button>
          )}
          <button type="button" className="btn-link" onClick={() => baixarCSV(selecionados)}>
            <Icon name="download" size={15} /> Exportar CSV
          </button>
          <button type="button" className="btn-link ct-bulk-limpar" onClick={() => setSel(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}

      <div className="table-wrap ct-tabela-wrap">
        <table className="ct-tabela">
          <thead>
            <tr>
              <th className="ct-col-sel">
                <input
                  type="checkbox"
                  aria-label="Selecionar todos desta página"
                  checked={todos}
                  ref={(el) => {
                    if (el) el.indeterminate = sel.size > 0 && !todos;
                  }}
                  onChange={() => setSel(todos ? new Set() : new Set(linhas.map((l) => l.id)))}
                />
              </th>
              <th>Nome</th>
              <th className="ct-col-cat">Categoria</th>
              <th className="ct-col-cid">Cidade</th>
              <th className="ct-col-fone">WhatsApp</th>
              {mostrarCandidato && <th className="ct-col-cand">Candidato</th>}
              <th className="ct-col-data">Cadastro</th>
              <th className="ct-col-acoes">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((c) => {
              const conversa = conversaHref(c);
              return (
                <tr
                  key={c.id}
                  className={`${sel.has(c.id) ? "sel" : ""}${abertoId === c.id ? " aberto" : ""}`}
                  onClick={(e) => {
                    const alvo = e.target as HTMLElement;
                    if (alvo.closest("input,button,a,.menu")) return;
                    setAbertoId(c.id);
                  }}
                >
                  <td className="ct-col-sel">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${c.nome || "contato sem nome"}`}
                      checked={sel.has(c.id)}
                      onChange={() => alternar(c.id)}
                    />
                  </td>
                  <td className="ct-col-nome">
                    <button type="button" className="ct-quem" onClick={() => setAbertoId(c.id)}>
                      <Avatar c={c} />
                      <span className="ct-quem-txt">
                        <span className={`ct-nome${c.nome ? "" : " sem"}`}>{c.nome || "Sem nome"}</span>
                        <span className="ct-sub">
                          {[c.funcao, c.cidade].filter(Boolean).join(" · ") || formatFone(c.whatsapp)}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="ct-col-cat">{c.categoria && <span className="selo">{c.categoria}</span>}</td>
                  <td className="ct-col-cid">{c.cidade || <span className="muted">–</span>}</td>
                  <td className="ct-col-fone mono">{formatFone(c.whatsapp) || <span className="muted">–</span>}</td>
                  {mostrarCandidato && (
                    <td className="ct-col-cand">
                      {c.candidato || (c.autor ? <span className="muted">por {c.autor}</span> : <span className="muted">–</span>)}
                    </td>
                  )}
                  <td className="ct-col-data muted" title={dataCompleta(c.criadoEm)}>
                    {dataRelativa(c.criadoEm)}
                  </td>
                  <td className="ct-col-acoes">
                    <div className="ct-acoes">
                      {conversa && (
                        <Link href={conversa} className="btn btn-sm btn-ghost btn-icon" title="Abrir conversa no WhatsApp" aria-label="Abrir conversa no WhatsApp">
                          <Icon name="whatsapp" size={16} />
                        </Link>
                      )}
                      <div className="menu-wrap">
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost btn-icon"
                          aria-label="Mais ações"
                          aria-haspopup="menu"
                          aria-expanded={menuId === c.id}
                          onClick={() => setMenuId(menuId === c.id ? null : c.id)}
                        >
                          <Icon name="more" size={16} />
                        </button>
                        {menuId === c.id && (
                          <div className="menu menu-dir" role="menu">
                            <button type="button" role="menuitem" onClick={() => { setMenuId(null); setAbertoId(c.id); }}>
                              <Icon name="user" size={16} /> Ver detalhes
                            </button>
                            <Link href={`/cadastro?id=${c.id}`} role="menuitem">
                              <Icon name="edit" size={16} /> Editar
                            </Link>
                            <hr />
                            <button type="button" role="menuitem" className="perigo" onClick={() => { setMenuId(null); setExcluir(c); }}>
                              <Icon name="trash" size={16} /> Excluir
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {aberto && (
        <PainelContato
          c={aberto}
          mostrarCandidato={mostrarCandidato}
          onFechar={() => setAbertoId(null)}
          onExcluir={() => setExcluir(aberto)}
        />
      )}

      {excluir && (
        <div className="modal-scrim" onClick={() => !excluindo && setExcluir(null)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="excluir-tit" onClick={(e) => e.stopPropagation()}>
            <h3 id="excluir-tit">Excluir {excluir.nome || "este contato"}?</h3>
            <p>
              O cadastro sai da base, do mapa e de todas as listas. Isso não pode ser desfeito.
            </p>
            <div className="modal-acoes">
              <button type="button" className="btn btn-ghost" onClick={() => setExcluir(null)} disabled={excluindo}>
                Cancelar
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmarExclusao} disabled={excluindo}>
                <Icon name="trash" size={16} /> {excluindo ? "Excluindo…" : "Excluir contato"}
              </button>
            </div>
          </div>
        </div>
      )}

      {listaAberta && (
        <ModalLista
          ids={[...sel]}
          onFechar={() => setListaAberta(false)}
          onFeito={(x) => {
            setListaAberta(false);
            setSel(new Set());
            setAviso({ t: "ok", x });
          }}
        />
      )}
    </>
  );
}

function PainelContato({
  c,
  mostrarCandidato,
  onFechar,
  onExcluir,
}: {
  c: LinhaContato;
  mostrarCandidato: boolean;
  onFechar: () => void;
  onExcluir: () => void;
}) {
  const conversa = conversaHref(c);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [c.id]);

  const linha = (rot: string, v: React.ReactNode) =>
    v ? (
      <>
        <dt>{rot}</dt>
        <dd>{v}</dd>
      </>
    ) : null;

  return (
    <div className="ct-painel-scrim" onClick={onFechar}>
      <aside
        className="ct-painel"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes de ${c.nome || "contato"}`}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-x" onClick={onFechar} aria-label="Fechar detalhes">
          <Icon name="x" size={18} />
        </button>
        <div className="ct-painel-topo">
          <Avatar c={c} grande />
          <div>
            <h2 className={c.nome ? "" : "sem"}>{c.nome || "Sem nome"}</h2>
            <p>{[c.funcao, c.cidade].filter(Boolean).join(" · ") || "Sem cargo ou cidade"}</p>
            {c.categoria && <span className="selo">{c.categoria}</span>}
          </div>
        </div>

        <div className="ct-painel-acoes">
          {conversa && (
            <Link href={conversa} className="btn btn-primary">
              <Icon name="whatsapp" size={16} /> Abrir conversa
            </Link>
          )}
          <Link href={`/cadastro?id=${c.id}`} className="btn btn-ghost">
            <Icon name="edit" size={16} /> Editar
          </Link>
          <div className="menu-wrap">
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Mais ações"
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
            >
              <Icon name="more" size={16} />
            </button>
            {menu && (
              <div className="menu menu-dir" role="menu">
                <button type="button" role="menuitem" className="perigo" onClick={() => { setMenu(false); onExcluir(); }}>
                  <Icon name="trash" size={16} /> Excluir contato
                </button>
              </div>
            )}
          </div>
        </div>

        <dl className="ct-dados">
          {linha("WhatsApp", c.whatsapp ? <span className="mono">{formatFone(c.whatsapp)}</span> : null)}
          {linha("E-mail", c.email)}
          {linha("Instagram", c.instagram)}
          {linha("Partido", c.partido)}
          {linha("Cidade", c.cidade)}
          {linha("Bairro", c.bairro)}
          {linha("Região", c.regiao)}
          {mostrarCandidato && linha("Candidato", c.candidato)}
          {linha("Cadastrado", `${dataCompleta(c.criadoEm)}${c.autor ? ` · por ${c.autor}` : ""}`)}
        </dl>

        {c.observacao && (
          <div className="ct-obs">
            <span className="rotulo">Observação</span>
            <p>{c.observacao}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function ModalLista({
  ids,
  onFechar,
  onFeito,
}: {
  ids: number[];
  onFechar: () => void;
  onFeito: (msg: string) => void;
}) {
  const [listas, setListas] = useState<Lista[] | null>(null);
  const [escolhida, setEscolhida] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/listas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setListas(Array.isArray(d) ? d : []))
      .catch(() => setListas([]));
  }, []);

  async function salvar() {
    if (!escolhida) return setErro("Escolha uma lista.");
    setSalvando(true);
    setErro("");
    const r = await fetch("/api/listas/membros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lista_id: Number(escolhida), pessoa_ids: ids }),
    });
    const d = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) return setErro(d.erro || "Não foi possível adicionar.");
    const nome = listas?.find((l) => String(l.id) === escolhida)?.nome || "a lista";
    const ja = d.ignorados ? ` ${d.ignorados} já estavam nela ou estão fora do seu escopo.` : "";
    onFeito(`${d.adicionados} ${d.adicionados === 1 ? "contato adicionado" : "contatos adicionados"} a "${nome}".${ja}`);
  }

  return (
    <div className="modal-scrim" onClick={() => !salvando && onFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="lista-tit" onClick={(e) => e.stopPropagation()}>
        <h3 id="lista-tit">Adicionar {ids.length} {ids.length === 1 ? "contato" : "contatos"} a uma lista</h3>
        <p>As listas são usadas nos disparos. Quem já estiver na lista não é duplicado.</p>
        {listas === null ? (
          <p className="muted">Carregando listas…</p>
        ) : listas.length === 0 ? (
          <p className="muted">
            Nenhuma lista criada ainda. <Link href="/listas">Criar uma lista</Link>
          </p>
        ) : (
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="lista-sel">Lista</label>
            <select id="lista-sel" value={escolhida} onChange={(e) => setEscolhida(e.target.value)}>
              <option value="">Escolha…</option>
              {listas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                  {l.agente_nome ? ` · ${l.agente_nome}` : ""}
                  {typeof l.membros === "number" ? ` (${l.membros})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {erro && <div className="msg err" style={{ marginTop: 12 }}>{erro}</div>}
        <div className="modal-acoes">
          <button type="button" className="btn btn-ghost" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando || !listas?.length}>
            {salvando ? "Adicionando…" : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}
