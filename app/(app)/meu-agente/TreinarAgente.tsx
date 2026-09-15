"use client";

import { useEffect, useRef, useState } from "react";

// Treino do agente: entrevista guiada (passo a passo por IA, texto ou áudio),
// chat de teste com o próprio agente (com correção que vira aprendizado) e a
// base de conhecimento. Alimenta a persona; o candidato treina quando quiser.

const PERGUNTAS = [
  "Quem é você? Conte sua história em poucas linhas: nome, trajetória e o que te trouxe à política.",
  "Quais são as suas 3 principais bandeiras?",
  "Como você quer que a IA fale com o eleitor? (tom: próximo, firme, formal, bem-humorado...)",
  "Quais os temas mais perguntados na sua região e como você responde cada um?",
  "O que a IA NUNCA deve dizer ou prometer no seu nome?",
  "Como é o seu atendimento: horários e quando pedir para falar com a equipe?",
  "Uma frase ou lema que te representa.",
];

const MicIcon = ({ on = false }: { on?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

type Item = { id: number; tipo: string; titulo: string | null; conteudo: string; criado_em: string };
type Msg = { role: "user" | "assistant"; content: string };
type Dest = "entrevista" | "chat";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

export default function TreinarAgente({ onPersona }: { onPersona?: (p: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<"entrevista" | "chat">("entrevista");
  const [msg, setMsg] = useState("");

  // Entrevista
  const [passo, setPasso] = useState(0);
  const [respostas, setRespostas] = useState<string[]>(() => PERGUNTAS.map(() => ""));
  const [treinando, setTreinando] = useState(false);

  // Chat de teste
  const [chat, setChat] = useState<Msg[]>([]);
  const [entrada, setEntrada] = useState("");
  const [pensando, setPensando] = useState(false);
  const [corrigindo, setCorrigindo] = useState<number | null>(null);
  const [correcao, setCorrecao] = useState("");

  // Áudio
  const [gravando, setGravando] = useState<Dest | null>(null);
  const [transcrevendo, setTranscrevendo] = useState<Dest | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Base de conhecimento
  const [itens, setItens] = useState<Item[]>([]);

  async function carregarItens() {
    try {
      const r = await fetch("/api/treino");
      const j = await r.json();
      if (r.ok && Array.isArray(j.itens)) setItens(j.itens);
    } catch {
      /* silencioso */
    }
  }
  useEffect(() => {
    if (aberto) carregarItens();
  }, [aberto]);

  function aplicarTexto(dest: Dest, texto: string) {
    if (dest === "entrevista") {
      setRespostas((rs) => rs.map((v, i) => (i === passo ? (v ? v + " " : "") + texto : v)));
    } else {
      setEntrada((v) => (v ? v + " " : "") + texto);
    }
  }

  async function iniciarGravacao(dest: Dest) {
    setMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setTranscrevendo(dest);
        try {
          const dataUrl = await blobToDataUrl(blob);
          const r = await fetch("/api/treino", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ acao: "transcrever", audioBase64: dataUrl, mimetype: blob.type }),
          });
          const j = await r.json();
          if (r.ok && j.texto) aplicarTexto(dest, j.texto);
          else setMsg(j.erro || "Falha ao transcrever o áudio.");
        } catch {
          setMsg("Falha ao transcrever o áudio.");
        } finally {
          setTranscrevendo(null);
        }
      };
      mr.start();
      mrRef.current = mr;
      setGravando(dest);
    } catch {
      setMsg("Não consegui acessar o microfone. Verifique a permissão do navegador.");
    }
  }
  function pararGravacao() {
    try {
      mrRef.current?.stop();
    } catch {
      /* ignora */
    }
    setGravando(null);
  }

  async function treinar() {
    const payload = PERGUNTAS.map((pergunta, i) => ({ pergunta, resposta: respostas[i] })).filter(
      (x) => x.resposta.trim()
    );
    if (!payload.length) {
      setMsg("Responda ao menos uma pergunta antes de treinar.");
      return;
    }
    setTreinando(true);
    setMsg("");
    try {
      const r = await fetch("/api/treino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "consolidar", respostas: payload }),
      });
      const j = await r.json();
      if (r.ok) {
        setMsg("Agente treinado! A persona foi atualizada.");
        setRespostas(PERGUNTAS.map(() => ""));
        setPasso(0);
        if (j.persona && onPersona) onPersona(j.persona);
        carregarItens();
      } else setMsg(j.erro || "Falha ao treinar.");
    } catch {
      setMsg("Falha ao treinar.");
    } finally {
      setTreinando(false);
    }
  }

  async function enviarChat() {
    const txt = entrada.trim();
    if (!txt || pensando) return;
    const novo: Msg[] = [...chat, { role: "user", content: txt }];
    setChat(novo);
    setEntrada("");
    setPensando(true);
    try {
      const r = await fetch("/api/treino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "conversar", historico: novo }),
      });
      const j = await r.json();
      if (r.ok && j.texto) setChat((c) => [...c, { role: "assistant", content: j.texto }]);
      else setChat((c) => [...c, { role: "assistant", content: "(" + (j.erro || "falha ao responder") + ")" }]);
    } catch {
      setChat((c) => [...c, { role: "assistant", content: "(falha de rede)" }]);
    } finally {
      setPensando(false);
    }
  }

  async function salvarCorrecao(idx: number) {
    const resposta = correcao.trim();
    if (!resposta) return;
    // A "pergunta" é a última mensagem do eleitor antes da resposta corrigida.
    const anterior = [...chat].slice(0, idx).reverse().find((m) => m.role === "user");
    try {
      const r = await fetch("/api/treino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "corrigir", pergunta: anterior?.content || "", resposta }),
      });
      const j = await r.json();
      if (r.ok) {
        setMsg("Correção salva. O agente vai seguir isso.");
        setChat((c) => c.map((m, i) => (i === idx ? { ...m, content: resposta } : m)));
        if (j.persona && onPersona) onPersona(j.persona);
        carregarItens();
      } else setMsg(j.erro || "Falha ao salvar correção.");
    } finally {
      setCorrigindo(null);
      setCorrecao("");
    }
  }

  async function excluir(id: number) {
    try {
      const r = await fetch("/api/treino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "excluir", id }),
      });
      const j = await r.json();
      if (r.ok) {
        setItens((its) => its.filter((x) => x.id !== id));
        if (j.persona && onPersona) onPersona(j.persona);
      }
    } catch {
      /* ignora */
    }
  }

  const rotuloTipo: Record<string, string> = {
    perfil: "Perfil",
    entrevista: "Entrevista",
    correcao: "Correção",
  };

  return (
    <div className="bloco-agente treino">
      <div className="bloco-titulo" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Treine seu agente</span>
        <button className="btn-link" onClick={() => setAberto((v) => !v)}>
          {aberto ? "Fechar" : "Abrir"}
        </button>
      </div>
      <small style={{ color: "var(--muted)", fontSize: 12, display: "block", marginTop: -4, marginBottom: 8 }}>
        Passo a passo por IA. Responda por texto ou áudio, ou converse com o seu agente para corrigir. Ele melhora a cada treino.
      </small>

      {aberto && (
        <>
          <div className="treino-tabs">
            <button className={`treino-tab ${modo === "entrevista" ? "on" : ""}`} onClick={() => setModo("entrevista")}>
              Entrevista guiada
            </button>
            <button className={`treino-tab ${modo === "chat" ? "on" : ""}`} onClick={() => setModo("chat")}>
              Conversar e corrigir
            </button>
          </div>

          {msg && <div className="treino-msg">{msg}</div>}

          {modo === "entrevista" ? (
            <div className="treino-entrevista">
              <div className="treino-passo">
                Pergunta {passo + 1} de {PERGUNTAS.length}
              </div>
              <p className="treino-pergunta">{PERGUNTAS[passo]}</p>
              <textarea
                rows={4}
                value={respostas[passo]}
                onChange={(e) => setRespostas((rs) => rs.map((v, i) => (i === passo ? e.target.value : v)))}
                placeholder="Escreva a sua resposta, ou grave um áudio…"
              />
              <div className="treino-linha">
                <button
                  className={`btn treino-mic ${gravando === "entrevista" ? "gravando" : ""}`}
                  onClick={() => (gravando === "entrevista" ? pararGravacao() : iniciarGravacao("entrevista"))}
                  disabled={transcrevendo === "entrevista"}
                  type="button"
                >
                  <MicIcon on={gravando === "entrevista"} />
                  {transcrevendo === "entrevista"
                    ? "Transcrevendo…"
                    : gravando === "entrevista"
                    ? "Parar"
                    : "Gravar áudio"}
                </button>
                <div className="treino-nav">
                  <button className="btn-link" onClick={() => setPasso((p) => Math.max(0, p - 1))} disabled={passo === 0}>
                    Anterior
                  </button>
                  {passo < PERGUNTAS.length - 1 ? (
                    <button className="btn" onClick={() => setPasso((p) => Math.min(PERGUNTAS.length - 1, p + 1))}>
                      Próxima
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={treinar} disabled={treinando}>
                      {treinando ? "Treinando…" : "Treinar agora"}
                    </button>
                  )}
                </div>
              </div>
              <div className="treino-dots">
                {PERGUNTAS.map((_, i) => (
                  <span
                    key={i}
                    className={`treino-dot ${i === passo ? "on" : ""} ${respostas[i].trim() ? "feito" : ""}`}
                    onClick={() => setPasso(i)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="treino-chat">
              <div className="treino-msgs">
                {chat.length === 0 && (
                  <div className="treino-vazio">Mande uma mensagem como se fosse um eleitor. Se a resposta não ficar boa, clique em “Corrigir”.</div>
                )}
                {chat.map((m, i) => (
                  <div key={i} className={`treino-bolha ${m.role}`}>
                    <div>{m.content}</div>
                    {m.role === "assistant" && !m.content.startsWith("(") && (
                      <button className="treino-corrigir" onClick={() => { setCorrigindo(i); setCorrecao(m.content); }}>
                        Corrigir
                      </button>
                    )}
                    {corrigindo === i && (
                      <div className="treino-corr-box">
                        <textarea
                          rows={2}
                          value={correcao}
                          onChange={(e) => setCorrecao(e.target.value)}
                          placeholder="Como o agente deveria ter respondido?"
                        />
                        <div className="treino-nav">
                          <button className="btn-link" onClick={() => setCorrigindo(null)}>Cancelar</button>
                          <button className="btn btn-primary" onClick={() => salvarCorrecao(i)}>Salvar aprendizado</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {pensando && <div className="treino-bolha assistant"><i>digitando…</i></div>}
              </div>
              <div className="treino-linha">
                <button
                  className={`btn treino-mic ${gravando === "chat" ? "gravando" : ""}`}
                  onClick={() => (gravando === "chat" ? pararGravacao() : iniciarGravacao("chat"))}
                  disabled={transcrevendo === "chat"}
                  type="button"
                >
                  <MicIcon on={gravando === "chat"} />
                  {transcrevendo === "chat" ? "…" : gravando === "chat" ? "Parar" : "Áudio"}
                </button>
                <input
                  value={entrada}
                  onChange={(e) => setEntrada(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && enviarChat()}
                  placeholder="Escreva como um eleitor…"
                />
                <button className="btn btn-primary" onClick={enviarChat} disabled={pensando}>
                  Enviar
                </button>
              </div>
            </div>
          )}

          {itens.length > 0 && (
            <div className="treino-base">
              <div className="treino-base-tit">O que o agente já aprendeu</div>
              {itens.map((it) => (
                <div key={it.id} className="treino-item">
                  <span className={`treino-badge ${it.tipo}`}>{rotuloTipo[it.tipo] || it.tipo}</span>
                  <div className="treino-item-txt">
                    {it.titulo && <b>{it.titulo}</b>}
                    <span>{it.conteudo}</span>
                  </div>
                  <button className="treino-x" title="Remover" onClick={() => excluir(it.id)}>×</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
