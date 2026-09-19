"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CopyLink from "../../components/CopyLink";

const PERFIS = [
  { v: "ADMIN", r: "Administrador" },
  { v: "MARKETING", r: "Marketing" },
  { v: "COORDENACAO", r: "Coordenação" },
  { v: "CANDIDATO", r: "Candidato" },
  { v: "ATENDENTE", r: "Atendente" },
  { v: "LIDER", r: "Líder" },
];
const rotulo = (v: string) => PERFIS.find((p) => p.v === v)?.r ?? v;

type Usuario = {
  id: number;
  nome: string;
  email: string;
  perfil: string;
  foto: string | null;
  ativo: number;
  criado_em: string;
  agentes?: number[];
  candidato_escopo?: string | null;
  cadastros?: number;
  online?: boolean;
};
type AgenteOpt = { id: number; candidato: string; telefone?: string | null };

const NOVO = { nome: "", email: "", senha: "", perfil: "LIDER", foto: "", agentes: [] as number[], candidato_escopo: "" };

// Lê um arquivo de imagem, redimensiona (máx 400px) e comprime para JPEG -
// retorna uma data URL pronta para gravar no banco (mesmo padrão de Cadastro).
function redimensionarFoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 400;
        let { width, height } = img;
        if (width > height && width > max) {
          height = Math.round((height * max) / width);
          width = max;
        } else if (height > max) {
          width = Math.round((width * max) / height);
          height = max;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Avatar({ u, size = 36 }: { u: Usuario; size?: number }) {
  const st: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    objectFit: "cover",
    flex: "none",
    background: "var(--panel-2, #e9eef3)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: size * 0.38,
    fontWeight: 700,
    color: "var(--muted)",
  };
  return u.foto ? (
    <img src={u.foto} alt={u.nome} style={st} />
  ) : (
    <span style={st}>{iniciais(u.nome)}</span>
  );
}

// Seleção dos números (agentes) que um atendente pode operar.
function NumerosPicker({
  agentes,
  sel,
  onChange,
}: {
  agentes: AgenteOpt[];
  sel: number[];
  onChange: (ids: number[]) => void;
}) {
  function toggle(id: number) {
    onChange(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  }
  return (
    <div className="field" style={{ gridColumn: "1 / -1" }}>
      <label>Números que este atendente atende</label>
      {agentes.length === 0 ? (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          Nenhum número cadastrado. Cadastre um agente em WhatsApp → Agentes.
        </span>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {agentes.map((a) => {
            const on = sel.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(a.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border, #e3e6ec)",
                  background: on ? "var(--brand, #1f4fd6)" : "var(--card, #fff)",
                  color: on ? "#fff" : "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {on ? "✓ " : ""}
                {a.candidato}
                {a.telefone ? ` · ${a.telefone}` : ""}
              </button>
            );
          })}
        </div>
      )}
      <span style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
        O atendente só vê e recebe conversas dos números marcados.
      </span>
    </div>
  );
}

export default function UsuariosCliente({ meuId, admin = true }: { meuId: number; admin?: boolean }) {
  const [lista, setLista] = useState<Usuario[]>([]);
  const [agentesDisp, setAgentesDisp] = useState<AgenteOpt[]>([]);
  const [novo, setNovo] = useState({ ...NOVO });
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState({ nome: "", email: "", perfil: "", agentes: [] as number[], candidato_escopo: "" });
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState("TODOS");
  const [ordem, setOrdem] = useState<"nome" | "cadastros" | "recentes">("nome");

  // input de arquivo escondido reaproveitado para trocar a foto de um usuário existente
  const fotoInputRef = useRef<HTMLInputElement | null>(null);
  const alvoFoto = useRef<number | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/usuarios", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setLista((d.usuarios ?? d) as Usuario[]);
      if (Array.isArray(d.agentes)) setAgentesDisp(d.agentes as AgenteOpt[]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function patch(corpo: any) {
    const r = await fetch("/api/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setMsg({ t: "err", x: d.erro || "Erro" });
    else await carregar();
    return r.ok;
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const r = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(novo),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg({ t: "err", x: d.erro || "Erro ao criar." });
      return;
    }
    setMsg({ t: "ok", x: "Usuário criado!" });
    setNovo({ ...NOVO });
    carregar();
  }

  async function onFotoNovo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const foto = await redimensionarFoto(file);
      setNovo((s) => ({ ...s, foto }));
    } catch {
      setMsg({ t: "err", x: "Não foi possível ler a imagem." });
    }
  }

  // Abre o seletor de arquivo para trocar a foto de um usuário já existente.
  function pedirTrocaFoto(id: number) {
    alvoFoto.current = id;
    fotoInputRef.current?.click();
  }

  async function onFotoExistente(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const id = alvoFoto.current;
    e.target.value = ""; // permite re-selecionar o mesmo arquivo depois
    if (!file || !id) return;
    try {
      const foto = await redimensionarFoto(file);
      const ok = await patch({ id, foto });
      if (ok) setMsg({ t: "ok", x: "Foto atualizada." });
    } catch {
      setMsg({ t: "err", x: "Não foi possível ler a imagem." });
    }
  }

  async function removerFoto(u: Usuario) {
    const ok = await patch({ id: u.id, foto: "" });
    if (ok) setMsg({ t: "ok", x: "Foto removida." });
  }

  function abrirEdicao(u: Usuario) {
    setEditId(u.id);
    setEdit({ nome: u.nome, email: u.email, perfil: u.perfil, agentes: u.agentes ?? [], candidato_escopo: u.candidato_escopo ?? "" });
    setMsg(null);
  }

  async function salvarEdicao(id: number) {
    // Só envia o vínculo quando o perfil é Atendente (senão limparia à toa).
    const corpo: any = { id, nome: edit.nome, email: edit.email, perfil: edit.perfil, candidato_escopo: edit.candidato_escopo };
    if (edit.perfil === "ATENDENTE") corpo.agentes = edit.agentes;
    const ok = await patch(corpo);
    if (ok) {
      setEditId(null);
      setMsg({ t: "ok", x: "Usuário atualizado." });
    }
  }

  async function redefinirSenha(u: Usuario) {
    const nova = window.prompt(`Nova senha para "${u.nome}" (mínimo 6 caracteres):`);
    if (nova == null) return;
    if (nova.length < 6) {
      setMsg({ t: "err", x: "A senha deve ter ao menos 6 caracteres." });
      return;
    }
    const ok = await patch({ id: u.id, senha: nova });
    if (ok) setMsg({ t: "ok", x: `Senha de ${u.nome} redefinida.` });
  }

  async function excluir(u: Usuario) {
    if (!window.confirm(`Excluir o usuário "${u.nome}"? Esta ação não pode ser desfeita.`))
      return;
    const r = await fetch(`/api/usuarios?id=${u.id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setMsg({ t: "err", x: d.erro || "Erro ao excluir." });
    else {
      setMsg({ t: "ok", x: "Usuário excluído." });
      carregar();
    }
  }

  const setN = (k: string, v: string) => setNovo((s) => ({ ...s, [k]: v }));
  const setE = (k: string, v: string) => setEdit((s) => ({ ...s, [k]: v }));

  // ===== Busca, filtro e ordenação da listagem =====
  const termo = busca.trim().toLowerCase();
  const visiveis = lista
    .filter((u) => (filtroPerfil === "TODOS" ? true : u.perfil === filtroPerfil))
    .filter(
      (u) =>
        !termo ||
        u.nome.toLowerCase().includes(termo) ||
        u.email.toLowerCase().includes(termo) ||
        (u.candidato_escopo ?? "").toLowerCase().includes(termo)
    )
    .sort((a, b) => {
      if (ordem === "cadastros") return (b.cadastros ?? 0) - (a.cadastros ?? 0);
      if (ordem === "recentes") return b.id - a.id;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });

  // Exporta o que está VISÍVEL (respeita busca e filtro) em CSV para Excel.
  function exportarCSV() {
    const cel = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      ["nome", "email", "perfil", "status", "gabinete", "cadastros", "criado_em"].join(","),
      ...visiveis.map((u) =>
        [
          u.nome,
          u.email,
          rotulo(u.perfil),
          u.ativo ? "Ativo" : "Inativo",
          u.candidato_escopo ?? "",
          u.cadastros ?? 0,
          u.criado_em,
        ]
          .map(cel)
          .join(",")
      ),
    ].join("\n");
    // BOM para o Excel reconhecer os acentos.
    const url = URL.createObjectURL(
      new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `usuarios-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Nomes de candidatos (agentes) para o dropdown de escopo de gabinete.
  const candidatosEscopo = Array.from(
    new Set(agentesDisp.map((a) => a.candidato).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  return (
    <>
      {msg && <div className={`msg ${msg.t}`}>{msg.x}</div>}

      {/* input escondido - troca de foto de usuários existentes */}
      <input
        ref={fotoInputRef}
        type="file"
        accept="image/*"
        onChange={onFotoExistente}
        style={{ display: "none" }}
      />

      {/* Criar usuário (só ADMIN) */}
      {admin && (
      <form className="form-card" style={{ marginBottom: 24 }} onSubmit={criar}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              overflow: "hidden",
              flex: "none",
              background: "var(--panel-2, #e9eef3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muted)",
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            {novo.foto ? (
              <img
                src={novo.foto}
                alt="Prévia"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              iniciais(novo.nome || "?")
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <label className="btn btn-ghost" style={{ flex: "none", cursor: "pointer" }}>
              {novo.foto ? "Trocar foto" : "Subir foto"}
              <input
                type="file"
                accept="image/*"
                onChange={onFotoNovo}
                style={{ display: "none" }}
              />
            </label>
            {novo.foto && (
              <button
                type="button"
                className="btn-acao"
                onClick={() => setN("foto", "")}
              >
                Remover
              </button>
            )}
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label>Nome</label>
            <input value={novo.nome} onChange={(e) => setN("nome", e.target.value)} />
          </div>
          <div className="field">
            <label>E-mail / usuário</label>
            <input value={novo.email} onChange={(e) => setN("email", e.target.value)} />
          </div>
          <div className="field">
            <label>Senha</label>
            <input
              type="text"
              value={novo.senha}
              onChange={(e) => setN("senha", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Perfil</label>
            <select value={novo.perfil} onChange={(e) => setN("perfil", e.target.value)}>
              {PERFIS.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.r}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>
              Gabinete (isolamento){" "}
              <span className="muted">- vê só os dados deste candidato</span>
            </label>
            <select value={novo.candidato_escopo} onChange={(e) => setN("candidato_escopo", e.target.value)}>
              <option value="">Nenhum (acesso global)</option>
              {candidatosEscopo.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          {novo.perfil === "ATENDENTE" && (
            <NumerosPicker
              agentes={agentesDisp}
              sel={novo.agentes}
              onChange={(ids) => setNovo((s) => ({ ...s, agentes: ids }))}
            />
          )}
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-primary">
            Criar usuário
          </button>
        </div>
      </form>
      )}

      {/* Busca, filtro, ordenação e exportação */}
      <div className="filtro-barra">
        <input
          placeholder="Buscar por nome, e-mail ou gabinete…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ flex: "1 1 260px", minWidth: 0 }}
        />
        <select
          value={filtroPerfil}
          onChange={(e) => setFiltroPerfil(e.target.value)}
          style={{ flex: "none" }}
        >
          <option value="TODOS">Todos os perfis</option>
          {PERFIS.map((p) => (
            <option key={p.v} value={p.v}>
              {p.r}
            </option>
          ))}
        </select>
        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as "nome" | "cadastros" | "recentes")}
          style={{ flex: "none" }}
        >
          <option value="nome">Ordenar por nome</option>
          <option value="cadastros">Mais cadastros</option>
          <option value="recentes">Mais recentes</option>
        </select>
        <button type="button" className="btn btn-ghost" onClick={exportarCSV}>
          Exportar CSV
        </button>
        <span className="filtro-barra-conta">
          {visiveis.length} de {lista.length} usuário(s)
        </span>
      </div>

      {/* Tabela (no celular cada linha vira um cartão — ver .table-cartoes) */}
      <div className="table-wrap table-cartoes">
        <table>
          <thead>
            <tr>
              <th style={{ width: 48 }}></th>
              <th>Nome</th>
              <th>Usuário / E-mail</th>
              <th>Perfil</th>
              <th>Status</th>
              <th>Cadastros</th>
              <th>Link de captação</th>
              <th>Criado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={9} style={{ color: "var(--muted)", padding: 18 }}>
                  Nenhum usuário encontrado com esse filtro.
                </td>
              </tr>
            )}
            {visiveis.map((u) => {
              const souEu = u.id === meuId;
              const editando = editId === u.id;
              return (
                <tr key={u.id}>
                  <td>
                    {admin ? (
                      <button
                        type="button"
                        onClick={() => pedirTrocaFoto(u.id)}
                        title="Trocar foto"
                        style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}
                      >
                        <Avatar u={u} />
                      </button>
                    ) : (
                      <Avatar u={u} />
                    )}
                  </td>
                  <td data-rotulo="Nome" style={{ fontWeight: 600 }}>
                    {editando ? (
                      <input value={edit.nome} onChange={(e) => setE("nome", e.target.value)} />
                    ) : (
                      <>
                        {u.nome}
                        {souEu && (
                          <span className="tag" style={{ marginLeft: 6 }}>
                            você
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td data-rotulo="E-mail">
                    {editando ? (
                      <input value={edit.email} onChange={(e) => setE("email", e.target.value)} />
                    ) : (
                      u.email
                    )}
                  </td>
                  <td data-rotulo="Perfil">
                    {editando ? (
                      <>
                        <select value={edit.perfil} onChange={(e) => setE("perfil", e.target.value)}>
                          {PERFIS.map((p) => (
                            <option key={p.v} value={p.v}>
                              {p.r}
                            </option>
                          ))}
                        </select>
                        <select
                          value={edit.candidato_escopo}
                          onChange={(e) => setE("candidato_escopo", e.target.value)}
                          title="Gabinete (isolamento): vê só os dados deste candidato"
                          style={{ marginTop: 8, minWidth: 240 }}
                        >
                          <option value="">Gabinete: nenhum (global)</option>
                          {candidatosEscopo.map((c) => (
                            <option key={c} value={c}>Gabinete: {c}</option>
                          ))}
                        </select>
                        {edit.perfil === "ATENDENTE" && (
                          <div style={{ marginTop: 8, minWidth: 240 }}>
                            <NumerosPicker
                              agentes={agentesDisp}
                              sel={edit.agentes}
                              onChange={(ids) => setEdit((s) => ({ ...s, agentes: ids }))}
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="tag">
                        {rotulo(u.perfil)}
                        {u.perfil === "ATENDENTE" && u.agentes && u.agentes.length > 0 && (
                          <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                            {" "}· {u.agentes.length} nº
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td data-rotulo="Status" style={{ color: u.ativo ? "var(--green)" : "var(--muted)" }}>
                    {u.ativo ? "Ativo" : "Inativo"}
                    {u.online && (
                      <span title="Online agora" style={{ marginLeft: 6, color: "var(--green)" }}>
                        ●
                      </span>
                    )}
                  </td>
                  <td
                    data-rotulo="Cadastros"
                    style={{ fontWeight: 600 }}
                    title="Contatos cadastrados por este usuário"
                  >
                    {u.cadastros ?? 0}
                  </td>
                  <td data-rotulo="Link">
                    <CopyLink path={`/form/${u.email}`} compact />
                  </td>
                  <td data-rotulo="Criado em" style={{ color: "var(--muted)", fontSize: 12.5 }}>{u.criado_em}</td>
                  <td>
                    <div className="acoes">
                      {editando ? (
                        <>
                          <button className="btn-acao ok" onClick={() => salvarEdicao(u.id)}>
                            Salvar
                          </button>
                          <button className="btn-acao" onClick={() => setEditId(null)}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          {admin && (
                            <>
                              <button className="btn-acao" onClick={() => abrirEdicao(u)}>
                                Editar
                              </button>
                              <button className="btn-acao" onClick={() => pedirTrocaFoto(u.id)}>
                                {u.foto ? "Trocar foto" : "Subir foto"}
                              </button>
                              {u.foto && (
                                <button className="btn-acao" onClick={() => removerFoto(u)}>
                                  Remover foto
                                </button>
                              )}
                              <button
                                className="btn-acao"
                                onClick={() => patch({ id: u.id, ativo: u.ativo ? 0 : 1 })}
                                disabled={souEu}
                                title={souEu ? "Você não pode desativar a si mesmo" : ""}
                              >
                                {u.ativo ? "Desativar" : "Ativar"}
                              </button>
                            </>
                          )}
                          <button className="btn-acao" onClick={() => redefinirSenha(u)}>
                            Redefinir senha
                          </button>
                          {admin && (
                            <button
                              className="btn-acao danger"
                              onClick={() => excluir(u)}
                              disabled={souEu}
                              title={souEu ? "Você não pode excluir a si mesmo" : ""}
                            >
                              Excluir
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
