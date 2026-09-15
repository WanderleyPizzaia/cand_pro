"use client";

import { useState } from "react";
import { TEMAS, TIPOS } from "@/lib/pautas";
import { CIDADES_SP } from "@/lib/cidades";

export default function PautaPublica({ slug, gabinete }: { slug: string; gabinete: string }) {
  const [f, setF] = useState({ nome: "", contato: "", cidade: "", bairro: "", tema: "", tipo: "solicitacao", titulo: "", descricao: "" });
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [proto, setProto] = useState("");
  const [erro, setErro] = useState("");
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.descricao.trim()) {
      setErro("Descreva a sua pauta.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch(`/api/pauta/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setProto(d.protocolo || ""); setOk(true); }
      else setErro(d.erro || "Não foi possível enviar. Tente de novo.");
    } catch {
      setErro("Falha de conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (ok) {
    return (
      <div className="form-publico-card" style={{ textAlign: "center" }}>
        <h2 style={{ margin: "0 0 6px" }}>Pauta recebida!</h2>
        {proto && (
          <div style={{ margin: "0 auto 12px", display: "inline-block", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 14px", fontWeight: 800, letterSpacing: ".02em" }}>
            Protocolo: {proto}
          </div>
        )}
        <p style={{ color: "var(--muted)" }}>
          Obrigado. O gabinete de {gabinete} recebeu a sua mensagem e vai analisar. Guarde o seu protocolo. A sua voz ajuda a orientar o trabalho pela sua comunidade.
        </p>
      </div>
    );
  }

  return (
    <div className="form-publico-card">
      <h2 style={{ margin: "0 0 4px" }}>Fale com o gabinete</h2>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        {gabinete}. Registre uma denúncia, uma solicitação ou uma sugestão para a sua comunidade. O que precisa mudar no seu bairro?
      </p>
      <form onSubmit={enviar} className="fp-form">
        <div className="fp-grid2">
          <div className="field">
            <label>Tema</label>
            <select value={f.tema} onChange={(e) => set("tema", e.target.value)}>
              <option value="">Selecione</option>
              {TEMAS.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Tipo</label>
            <select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
              {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Resumo (opcional)</label>
          <input value={f.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ex.: Falta de saneamento na rua tal" />
        </div>
        <div className="field">
          <label>Descreva a sua pauta</label>
          <textarea rows={4} value={f.descricao} onChange={(e) => set("descricao", e.target.value)} placeholder="Conte o que está acontecendo e o que você precisa." />
        </div>
        <div className="fp-grid2">
          <div className="field">
            <label>Cidade</label>
            <input list="cidades-sp" value={f.cidade} onChange={(e) => set("cidade", e.target.value)} placeholder="Sua cidade" autoComplete="off" />
            <datalist id="cidades-sp">
              {CIDADES_SP.map((c) => <option key={c.nome} value={c.nome} />)}
            </datalist>
          </div>
          <div className="field">
            <label>Bairro</label>
            <input value={f.bairro} onChange={(e) => set("bairro", e.target.value)} placeholder="Seu bairro" />
          </div>
        </div>
        <div className="fp-grid2">
          <div className="field">
            <label>Seu nome (opcional)</label>
            <input value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Como quer ser chamado" />
          </div>
          <div className="field">
            <label>WhatsApp ou e-mail (opcional)</label>
            <input value={f.contato} onChange={(e) => set("contato", e.target.value)} placeholder="Para o gabinete te dar retorno" />
          </div>
        </div>
        {erro && <div className="msg err">{erro}</div>}
        <button type="submit" className="btn btn-primary" disabled={enviando} style={{ width: "100%" }}>
          {enviando ? "Enviando…" : "Enviar minha pauta"}
        </button>
        <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>
          Ao enviar, você concorda que o gabinete use estes dados para dar retorno e organizar as demandas da sua região (LGPD).
        </p>
      </form>
    </div>
  );
}
