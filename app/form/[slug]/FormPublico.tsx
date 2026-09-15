"use client";

import { useState } from "react";
import cidades from "@/data/sp-cidades.json";
import Icon from "../../components/Icon";

const VAZIO = {
  nome: "",
  whatsapp: "",
  cidade: "",
  e_sp: "",
  votaria: "",
  comunidade: "",
};

export default function FormPublico({
  slug,
  liderNome,
}: {
  slug: string;
  liderNome: string;
}) {
  const [f, setF] = useState(VAZIO);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const primeiro = (liderNome || "candidato").split(" ")[0];

  function set(k: string, v: string) {
    setF((s) => ({ ...s, [k]: v }));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!f.nome.trim()) return setErro("Por favor, informe seu nome.");
    setEnviando(true);
    try {
      const r = await fetch(`/api/form/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro || "Erro ao enviar");
      setOk(true);
    } catch (err: any) {
      setErro(err.message);
      setEnviando(false);
    }
  }

  // Grupo de opções (radio estilizado como botões).
  const Opcoes = ({ campo, opcoes }: { campo: keyof typeof VAZIO; opcoes: string[] }) => (
    <div className="form-opcoes">
      {opcoes.map((o) => (
        <button
          key={o}
          type="button"
          className={`form-opcao${f[campo] === o ? " ativo" : ""}`}
          onClick={() => set(campo, o)}
        >
          {o}
        </button>
      ))}
    </div>
  );

  if (ok) {
    return (
      <div className="form-publico-card" style={{ textAlign: "center" }}>
        <div style={{ color: "var(--green)", marginBottom: 10 }}>
          <Icon name="check" size={48} />
        </div>
        <h2 style={{ margin: "0 0 8px" }}>Cadastro recebido!</h2>
        <p style={{ color: "var(--muted)" }}>
          Obrigado, {f.nome.split(" ")[0]}. Vamos juntos com {primeiro}!
        </p>
        <button
          className="btn btn-ghost"
          style={{ marginTop: 18 }}
          onClick={() => { setF(VAZIO); setOk(false); setEnviando(false); }}
        >
          Fazer outro cadastro
        </button>
      </div>
    );
  }

  return (
    <form className="form-publico-card" onSubmit={enviar}>
      <div className="brand" style={{ fontSize: 24 }}>
        CAND<span style={{ color: "var(--brand)" }}> PRO</span>
      </div>
      <p className="form-publico-intro">
        Apoie <b>{liderNome}</b>. Preencha e faça parte dessa caminhada.
      </p>

      {erro && <div className="msg err">{erro}</div>}

      <div className="field">
        <label>Nome <span className="req">*</span></label>
        <input placeholder="Seu nome completo" value={f.nome} onChange={(e) => set("nome", e.target.value)} autoFocus />
      </div>

      <div className="field">
        <label>Telefone (WhatsApp)</label>
        <input type="tel" inputMode="tel" placeholder="(11) 98765-4321" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
      </div>

      <div className="field">
        <label>Cidade</label>
        <input list="cidades-form" placeholder="Sua cidade" value={f.cidade} onChange={(e) => set("cidade", e.target.value)} />
        <datalist id="cidades-form">
          {(cidades as { nome: string }[]).map((c) => <option key={c.nome} value={c.nome} />)}
        </datalist>
      </div>

      <div className="field">
        <label>Você é do estado de São Paulo?</label>
        <Opcoes campo="e_sp" opcoes={["Sim", "Não"]} />
      </div>

      <div className="field">
        <label>Você votaria no {liderNome}?</label>
        <Opcoes campo="votaria" opcoes={["Sim", "Talvez", "Não"]} />
      </div>

      <div className="field">
        <label>Deseja entrar na comunidade do {primeiro}?</label>
        <Opcoes campo="comunidade" opcoes={["Sim", "Não"]} />
      </div>

      <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 14 }} disabled={enviando}>
        {enviando ? "Enviando..." : "Quero fazer parte"}
      </button>
    </form>
  );
}
