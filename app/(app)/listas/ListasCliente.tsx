"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../../components/Icon";

type Agente = { id: number; candidato: string };
type Lista = {
  id: number;
  nome: string;
  descricao: string | null;
  agente_id: number;
  agente_nome: string | null;
  criado_em: string;
  membros: number;
  com_whatsapp: number;
};
type Resumo = {
  total: number;
  novos: number;
  reaproveitados: number;
  jaNaLista: number;
  semTelefone: number;
  erros: string[];
};

export default function ListasCliente({ agentes }: { agentes: Agente[] }) {
  const [listas, setListas] = useState<Lista[]>([]);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [agenteId, setAgenteId] = useState<number | "">(agentes[0]?.id ?? "");
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);
  const [importando, setImportando] = useState<number | null>(null);
  const [resumo, setResumo] = useState<{ lista: string; r: Resumo } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const alvoImport = useRef<number | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/listas", { cache: "no-store" });
    if (r.ok) setListas(await r.json());
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const r = await fetch("/api/listas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, descricao, agente_id: agenteId }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg({ t: "err", x: d.erro || "Erro ao criar lista." });
    setNome("");
    setDescricao("");
    setMsg({ t: "ok", x: "Lista criada! Agora importe um CSV." });
    carregar();
  }

  function pedirImport(listaId: number) {
    alvoImport.current = listaId;
    setResumo(null);
    fileRef.current?.click();
  }

  async function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const listaId = alvoImport.current;
    e.target.value = "";
    if (!file || !listaId) return;
    setImportando(listaId);
    setMsg(null);
    try {
      const texto = await file.text();
      const r = await fetch(`/api/listas/importar?lista=${listaId}`, {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: texto,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ t: "err", x: d.erro || "Falha na importação." });
      else {
        const l = listas.find((x) => x.id === listaId);
        setResumo({ lista: l?.nome || "lista", r: d as Resumo });
        await carregar();
      }
    } finally {
      setImportando(null);
    }
  }

  async function excluir(l: Lista) {
    if (!window.confirm(`Excluir a lista "${l.nome}"? Os contatos permanecem na base.`)) return;
    const r = await fetch(`/api/listas?id=${l.id}`, { method: "DELETE" });
    if (r.ok) {
      setMsg({ t: "ok", x: "Lista excluída." });
      carregar();
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={onArquivo}
      />

      {/* Criar lista */}
      <form className="form-card" style={{ marginBottom: 16 }} onSubmit={criar}>
        <div className="lista-form-grid" style={{ display: "grid", gap: 12 }}>
          <div className="field">
            <label>Nome da lista</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: QR São Carlos" />
          </div>
          <div className="field">
            <label>Número (candidato)</label>
            <select value={agenteId} onChange={(e) => setAgenteId(Number(e.target.value))}>
              {agentes.length === 0 && <option value="">Nenhum número</option>}
              {agentes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.candidato}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Descrição (opcional)</label>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex.: leads coletados no QR code do evento" />
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-primary">Criar lista</button>
        </div>
      </form>

      {msg && <div className={`msg ${msg.t === "ok" ? "ok" : "err"}`} style={{ marginBottom: 12 }}>{msg.x}</div>}

      {/* Resumo da última importação */}
      {resumo && (
        <div className="form-card resumo-import">
          <b>Importação em "{resumo.lista}"</b>
          <div className="resumo-import-linha">
            <span className="txt-ok com-icone"><Icon name="check" size={14} /> <b>{resumo.r.novos}</b> novos</span>
            <span className="com-icone"><Icon name="refresh" size={14} /> <b>{resumo.r.reaproveitados}</b> já existiam na base (reaproveitados)</span>
            <span className="com-icone"><Icon name="list" size={14} /> <b>{resumo.r.jaNaLista}</b> já estavam na lista</span>
            <span className="txt-atencao com-icone"><Icon name="alert" size={14} /> <b>{resumo.r.semTelefone}</b> sem telefone válido</span>
            <span style={{ color: "var(--muted)" }}>{resumo.r.total} linhas lidas</span>
          </div>
          {resumo.r.erros.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--muted)" }}>
              {resumo.r.erros.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Tabela de listas */}
      <div className="table-wrap mob-cards">
        <table>
          <thead>
            <tr>
              <th>Lista</th>
              <th>Número</th>
              <th>Contatos</th>
              <th>Com WhatsApp</th>
              <th>Criada</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {listas.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: "var(--muted)", padding: 20 }}>
                  Nenhuma lista ainda. Crie uma acima e importe um CSV.
                </td>
              </tr>
            ) : (
              listas.map((l) => (
                <tr key={l.id}>
                  <td data-label="Lista">
                    <b>{l.nome}</b>
                    {l.descricao && (
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{l.descricao}</div>
                    )}
                  </td>
                  <td data-label="Número">{l.agente_nome}</td>
                  <td data-label="Contatos" style={{ fontVariantNumeric: "tabular-nums" }}>{l.membros}</td>
                  <td data-label="Com WhatsApp" style={{ fontVariantNumeric: "tabular-nums", color: "var(--green)" }}>
                    {l.com_whatsapp}
                  </td>
                  <td data-label="Criada" style={{ color: "var(--muted)", fontSize: 12.5 }}>{l.criado_em}</td>
                  <td className="acoes-cell">
                    <div className="acoes" style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn-acao"
                        onClick={() => pedirImport(l.id)}
                        disabled={importando === l.id}
                      >
                        {importando === l.id ? "Importando…" : "Importar CSV"}
                      </button>
                      <button className="btn-acao" onClick={() => excluir(l)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--muted)" }}>
        O CSV precisa de uma coluna de telefone (<code>whatsapp</code>, <code>telefone</code> ou{" "}
        <code>celular</code>). Opcionais: <code>nome</code>, <code>cidade</code>,{" "}
        <code>categoria</code>, <code>bairro</code>, <code>email</code>.
      </p>
    </>
  );
}
