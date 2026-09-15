"use client";

import { useEffect, useState } from "react";
import CountUp from "../../components/CountUp";
import TreinarAgente from "./TreinarAgente";

type Config = {
  ferramentas?: Record<string, boolean>;
  atendimento?: { saudacao?: string; horario?: string; notificar_whatsapp?: string };
};

type Dados = {
  id: number;
  candidato: string;
  provedor: string;
  ativo: number;
  persona: string | null;
  instancia: string | null;
  config?: Config | null;
  tem_ia: boolean;
  tem_meta_token: boolean;
  totalMensagens: number;
  recebidasHoje: number;
  contatos: number;
  quotaEfetiva: number;
  disparosHoje: number;
};

// Ferramentas que o candidato pode ligar/desligar (parte "aberta").
const FERRAMENTAS: { chave: string; nome: string; desc: string }[] = [
  { chave: "coletar_nome_cidade", nome: "Perguntar nome e cidade", desc: "A IA pergunta naturalmente quem é e de onde é o eleitor." },
  { chave: "cadastrar_eleitor", nome: "Cadastrar eleitor no mapa", desc: "Cria o cadastro geolocalizado automaticamente na conversa." },
  { chave: "registrar_demanda", nome: "Registrar demanda", desc: "Abre uma tarefa quando o eleitor pede algo (saúde, obra, etc.)." },
  { chave: "agendar_visita", nome: "Agendar visita / evento", desc: "Anota convites e pedidos de agenda para a equipe." },
  { chave: "enviar_material", nome: "Enviar material de campanha", desc: "Manda material quando o eleitor pede para divulgar." },
  { chave: "transferir_humano", nome: "Transferir para humano", desc: "Pausa a IA e avisa a equipe para assumir a conversa." },
  { chave: "avisar_equipe", nome: "Avisar a equipe", desc: "Notifica no WhatsApp abaixo quando algo importante acontece." },
];

export default function MeuAgenteCliente() {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [persona, setPersona] = useState("");
  const [ferr, setFerr] = useState<Record<string, boolean>>({});
  const [saudacao, setSaudacao] = useState("");
  const [horario, setHorario] = useState("");
  const [notificar, setNotificar] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  async function carregar() {
    const r = await fetch("/api/meu-agente", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) {
      setErro(j.erro || "Falha ao carregar.");
      return;
    }
    setD(j);
    setAtivo(!!j.ativo);
    setPersona(j.persona || "");
    const c: Config = j.config || {};
    // Sem config gravada ainda -> assume o padrão de fábrica (já é o comportamento em produção).
    setFerr(
      c.ferramentas && Object.keys(c.ferramentas).length
        ? c.ferramentas
        : { coletar_nome_cidade: true, cadastrar_eleitor: true }
    );
    setSaudacao(c.atendimento?.saudacao || "");
    setHorario(c.atendimento?.horario || "");
    setNotificar(c.atendimento?.notificar_whatsapp || "");
  }
  useEffect(() => {
    carregar();
  }, []);

  async function toggle() {
    const novo = !ativo;
    setAtivo(novo);
    await fetch("/api/meu-agente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: novo }),
    });
  }

  async function salvarPersona() {
    setSalvando(true);
    setMsg("");
    const r = await fetch("/api/meu-agente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        persona,
        config: {
          ferramentas: ferr,
          atendimento: {
            saudacao: saudacao.trim(),
            horario: horario.trim(),
            notificar_whatsapp: notificar.trim(),
          },
        },
      }),
    });
    setSalvando(false);
    setMsg(r.ok ? "Salvo!" : "Erro ao salvar");
    if (r.ok) setTimeout(() => setMsg(""), 1500);
  }

  // Toggle de ferramenta: grava na hora (plug-and-play, sem botão).
  async function alternarFerramenta(chave: string) {
    const novo = { ...ferr, [chave]: !ferr[chave] };
    setFerr(novo);
    await fetch("/api/meu-agente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { ferramentas: novo } }),
    });
  }

  if (erro)
    return (
      <div className="msg err" style={{ maxWidth: 560 }}>
        {erro}
      </div>
    );
  if (!d) return <div className="empty">Carregando…</div>;

  const ehMeta = d.provedor === "meta";
  const statusTxt = ehMeta
    ? d.tem_meta_token
      ? "API Oficial (Meta) · conectado"
      : "Meta: faltam credenciais"
    : d.instancia
    ? "Evolution · conectado"
    : "Sem WhatsApp";

  return (
    <div className="agentes-grid" style={{ maxWidth: 560 }}>
      <div className="agente-card">
        <div className="agente-head">
          <div className="agente-id">
            <span className={`conn-dot ${ehMeta ? (d.tem_meta_token ? "on" : "off") : d.instancia ? "on" : "off"}`} />
            <div>
              <div className="agente-nome">{d.candidato}</div>
              <div className="agente-sub">{statusTxt}</div>
            </div>
          </div>
          <button
            className={`switch ${ativo ? "on" : ""}`}
            onClick={toggle}
            title={ativo ? "Agente ligado (responde sozinho)" : "Agente desligado"}
          >
            <span className="dot" />
          </button>
        </div>

        <div className="agente-metrics">
          <div>
            <b><CountUp value={d.totalMensagens} /></b> mensagens
          </div>
          <div>
            <b><CountUp value={d.recebidasHoje} /></b> hoje
          </div>
          <div>
            <b><CountUp value={d.contatos} /></b> contatos
          </div>
          <div title="Disparos de campanha usados hoje / cota diária">
            <b><CountUp value={d.disparosHoje} /></b>
            <span style={{ color: "var(--muted)" }}> / {d.quotaEfetiva.toLocaleString("pt-BR")}</span> disparos hoje
          </div>
        </div>

        {ehMeta && (
          <div className="tag-oficial" style={{ marginTop: 4 }}>
            ✓ WhatsApp API Oficial
          </div>
        )}

        <div className="agente-form" style={{ marginTop: 14 }}>
          <div className="field">
            <label>Como seu assistente conversa (persona)</label>
            <textarea
              rows={7}
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="Descreva o tom e as instruções do seu assistente…"
            />
            <small style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
              É assim que a IA responde os eleitores no seu WhatsApp. Ajuste e salve.
            </small>
          </div>

          {/* Treine seu agente: entrevista guiada + áudio + chat de teste */}
          <TreinarAgente onPersona={(p) => setPersona(p)} />

          {/* Ferramentas — o que o assistente pode fazer sozinho */}
          <div className="bloco-agente">
            <div className="bloco-titulo">O que seu assistente faz</div>
            <div className="ferramentas">
              {FERRAMENTAS.map((f) => (
                <div className="ferramenta" key={f.chave}>
                  <div className="ferramenta-txt">
                    <b>{f.nome}</b>
                    <small>{f.desc}</small>
                  </div>
                  <button
                    className={`switch ${ferr[f.chave] ? "on" : ""}`}
                    onClick={() => alternarFerramenta(f.chave)}
                    aria-label={f.nome}
                  >
                    <span className="dot" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Atendimento */}
          <div className="bloco-agente">
            <div className="bloco-titulo">Atendimento</div>
            <div className="field">
              <label>Saudação inicial</label>
              <input
                value={saudacao}
                onChange={(e) => setSaudacao(e.target.value)}
                placeholder={`Ex.: Olá! Aqui é o assistente do ${(d.candidato || "seu gabinete").split(" ")[0]}. Como posso ajudar?`}
              />
            </div>
            <div className="field">
              <label>Horário de atendimento</label>
              <input
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                placeholder="Ex.: 8h às 20h, todos os dias"
              />
            </div>
            <div className="field">
              <label>WhatsApp da equipe (avisos)</label>
              <input
                value={notificar}
                onChange={(e) => setNotificar(e.target.value)}
                placeholder="Ex.: 11999998888"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="actions">
            {msg && (
              <span style={{ color: "var(--green)", alignSelf: "center" }}>{msg}</span>
            )}
            <button className="btn btn-primary" onClick={salvarPersona} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
