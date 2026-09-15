"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Agente = { id: number; candidato: string };

type Conversa = {
  contato: string;
  contato_nome: string | null;
  foto: string | null;
  agente_id: number | null;
  agente_nome: string | null;
  ultimo: string | null;
  direcao: string;
  status: string | null;
  origem?: string | null;
  quando: string;
};
type Msg = {
  id: number;
  direcao: string;
  texto: string | null;
  status: string | null;
  quando: string;
  agente_id: number | null;
  media?: string | null;
  media_tipo?: string | null;
};

function iniciais(s: string): string {
  const p = (s || "?").trim().split(/\s+/);
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

// Ticks do WhatsApp: ✓ enviada, ✓✓ entregue (cinza), ✓✓ lida (azul).
function Ticks({ status }: { status: string | null }) {
  if (status === "read")
    return <span className="ticks lida">✓✓</span>;
  if (status === "delivered")
    return <span className="ticks">✓✓</span>;
  return <span className="ticks">✓</span>;
}

function Avatar({ foto, nome }: { foto: string | null; nome: string }) {
  return foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="wa-avatar" src={foto} alt={nome} referrerPolicy="no-referrer" />
  ) : (
    <span className="wa-avatar wa-avatar-ini">{iniciais(nome)}</span>
  );
}

export default function InboxCliente({
  perfil,
  agenteIdFixo,
  agentes = [],
  contatoInicial = null,
  agenteInicial = null,
}: {
  perfil: string;
  agenteIdFixo?: number | null;
  agentes?: Agente[];
  contatoInicial?: string | null;
  agenteInicial?: number | null;
}) {
  const [agenteId, setAgenteId] = useState<number | null>(
    agenteIdFixo ?? agenteInicial ?? null
  );
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [sel, setSel] = useState<Conversa | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [pausado, setPausado] = useState(false);
  const [atribuido, setAtribuido] = useState<{ usuario_id: number; usuario_nome: string } | null>(null);
  const [atendentes, setAtendentes] = useState<{ id: number; nome: string }[]>([]);
  const [abrirAtrib, setAbrirAtrib] = useState(false);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<"todas" | "ia" | "nao_lidas" | "minhas">("todas");
  const fimRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  // Contadores de requisição: descartam respostas obsoletas (o poller de 4s ou
  // uma troca de agente podem deixar um fetch antigo respondendo depois do novo).
  const convReq = useRef(0);
  const threadReq = useRef(0);
  // Flags "em andamento": o poller de 4s NUNCA atropela uma carga em voo (senao
  // ela e invalidada pela guarda de req e a troca de agente nao chega a aplicar).
  const convBusy = useRef(false);
  const threadBusy = useRef(false);
  const [carregandoLista, setCarregandoLista] = useState(false);

  const carregarConversas = useCallback(async () => {
    const params = new URLSearchParams();
    if (agenteId) params.set("agente", String(agenteId));
    if (busca.trim()) params.set("q", busca.trim());
    if (aba !== "todas") params.set("aba", aba);
    const req = ++convReq.current;
    convBusy.current = true;
    setCarregandoLista(true);
    try {
      const r = await fetch(`/api/inbox?${params}`, { cache: "no-store" });
      if (req !== convReq.current) return; // resposta obsoleta: ignora
      if (r.ok) setConversas(await r.json());
    } finally {
      convBusy.current = false;
      if (req === convReq.current) setCarregandoLista(false);
    }
  }, [agenteId, busca, aba]);

  const carregarThread = useCallback(
    async (contato: string, forcarFim = false) => {
      const params = new URLSearchParams({ contato });
      if (agenteId) params.set("agente", String(agenteId));
      const req = ++threadReq.current;
      threadBusy.current = true;
      try {
        const r = await fetch(`/api/inbox?${params}`, { cache: "no-store" });
        if (req !== threadReq.current) return; // resposta obsoleta: ignora
        if (r.ok) {
          // Mede a posição ANTES de re-renderizar: só fixa no fim se o usuário já
          // estava perto do fim (senão ele está lendo mensagens antigas — não mexer).
          const el = msgsRef.current;
          const pertoDoFim =
            !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          setMsgs(await r.json());
          if (forcarFim || pertoDoFim) {
            setTimeout(() => fimRef.current?.scrollIntoView(), 50);
          }
        }
      } finally {
        threadBusy.current = false;
      }
    },
    [agenteId]
  );

  // Troca de agente: limpa a conversa aberta e recarrega a lista.
  useEffect(() => {
    setSel(null);
    setMsgs([]);
    setConversas([]); // feedback imediato: some a lista do agente anterior
    threadReq.current++; // descarta qualquer thread do agente anterior em voo
    carregarConversas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenteId]);

  // Busca/aba: só recarrega a lista (mantém a conversa aberta). Busca com debounce.
  useEffect(() => {
    const t = setTimeout(() => carregarConversas(), busca ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, aba]);

  // Tempo real: ~4s, pausa com aba oculta (espelho vivo do WhatsApp)
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!convBusy.current) carregarConversas();
      if (sel && !threadBusy.current) carregarThread(sel.contato);
    }, 4000);
    return () => clearInterval(id);
  }, [carregarConversas, carregarThread, sel]);

  function abrir(c: Conversa) {
    setSel(c);
    setErro("");
    carregarThread(c.contato, true); // ao abrir, sempre desce pro fim
  }

  // Deep-link vindo do Cadastro (Conversa ›): abre a conversa do contato uma vez.
  const abriuInicial = useRef(false);
  useEffect(() => {
    if (abriuInicial.current || !contatoInicial) return;
    abriuInicial.current = true;
    const existente = conversas.find((c) => c.contato === contatoInicial);
    abrir(
      existente ?? {
        contato: contatoInicial,
        contato_nome: null,
        foto: null,
        agente_id: agenteInicial,
        agente_nome: null,
        ultimo: null,
        direcao: "in",
        status: null,
        quando: "",
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversas, contatoInicial, agenteInicial]);

  // Estado de pausa da IA para o contato selecionado (equipe assumiu o atendimento).
  useEffect(() => {
    if (!sel || !sel.agente_id) return setPausado(false);
    let ativo = true;
    fetch(`/api/inbox/pausa?agente_id=${sel.agente_id}&contato=${encodeURIComponent(sel.contato)}`)
      .then((r) => r.json())
      .then((d) => ativo && setPausado(!!d.pausado))
      .catch(() => {});
    return () => { ativo = false; };
  }, [sel]);

  async function togglePausa() {
    if (!sel || !sel.agente_id) return;
    const r = await fetch("/api/inbox/pausa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agente_id: sel.agente_id, contato: sel.contato, acao: "alternar" }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setPausado(!!d.pausado);
  }

  // Atribuição da conversa a uma atendente (transferir atendimento).
  useEffect(() => {
    setAbrirAtrib(false);
    if (!sel || !sel.agente_id) { setAtribuido(null); return; }
    let ativo = true;
    fetch(`/api/inbox/atribuir?agente_id=${sel.agente_id}&contato=${encodeURIComponent(sel.contato)}`)
      .then((r) => r.json())
      .then((d) => { if (!ativo) return; setAtribuido(d.atual || null); setAtendentes(d.atendentes || []); })
      .catch(() => {});
    return () => { ativo = false; };
  }, [sel]);

  async function atribuir(usuarioId: number) {
    if (!sel || !sel.agente_id) return;
    const r = await fetch("/api/inbox/atribuir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agente_id: sel.agente_id, contato: sel.contato, usuario_id: usuarioId }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setAtribuido(d.atual || null);
      setAbrirAtrib(false);
      if (usuarioId) setPausado(true); // transferir p/ humano pausa a IA
    }
  }

  async function responder(e: React.FormEvent) {
    e.preventDefault();
    if (!sel || !texto.trim()) return;
    if (!sel.agente_id) {
      setErro("Esta conversa não tem agente associado.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contato: sel.contato,
          agente_id: sel.agente_id,
          texto,
        }),
      });
      const d = await r.json();
      if (!r.ok) setErro(d.erro || "Falha ao enviar.");
      else {
        setTexto("");
        if (typeof d.iaPausada === "boolean") setPausado(d.iaPausada);
        await carregarThread(sel.contato, true); // ver a msg recém-enviada
        carregarConversas();
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      {/* Seletor de número: gestor vê todos; candidato vê só os seus (já escopados). */}
      {agentes.length > 1 && (
        <div className="map-tabs" style={{ marginBottom: 16 }}>
          <button
            className={`map-tab${agenteId === null ? " ativo" : ""}`}
            onClick={() => setAgenteId(null)}
          >
            Todos
          </button>
          {agentes.map((a) => (
            <button
              key={a.id}
              className={`map-tab${agenteId === a.id ? " ativo" : ""}`}
              onClick={() => setAgenteId(a.id)}
            >
              {a.candidato}
            </button>
          ))}
        </div>
      )}

      <div className={`inbox${sel ? " thread-aberta" : ""}`}>
        {/* Lista de conversas */}
        <div className="inbox-list">
          {/* Busca + filtros (padrão WhatsApp) */}
          <div className="inbox-filtros">
            <input
              className="inbox-busca"
              placeholder="Buscar conversa…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <div className="inbox-abas">
              {(
                [
                  ["todas", "Todas"],
                  ["ia", "IA"],
                  ["nao_lidas", "Não lidas"],
                  ["minhas", "Minhas"],
                ] as const
              ).map(([k, r]) => (
                <button
                  key={k}
                  className={`inbox-aba${aba === k ? " ativo" : ""}`}
                  onClick={() => setAba(k)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {conversas.length === 0 ? (
            <div className="empty" style={{ padding: 24, fontSize: 13 }}>
              {carregandoLista ? "Carregando conversas…" : "Nenhuma conversa ainda."}
            </div>
          ) : (
            conversas.map((c) => (
              <button
                key={c.contato}
                className={`inbox-conv${sel?.contato === c.contato ? " ativo" : ""}`}
                onClick={() => abrir(c)}
              >
                <Avatar foto={c.foto} nome={c.contato_nome || c.contato} />
                <div className="inbox-conv-body">
                  <div className="inbox-conv-top">
                    <span className="inbox-conv-nome">
                      {c.contato_nome || c.contato}
                    </span>
                    <span className="inbox-conv-quando">{c.quando}</span>
                  </div>
                  <div className="inbox-conv-prev">
                    <span className="inbox-conv-txt">
                      {c.direcao === "out" ? "Você: " : ""}
                      {(c.ultimo || "").slice(0, 38)}
                    </span>
                    {c.direcao === "in" ? (
                      <span className="conv-tag nova">nova</span>
                    ) : c.origem === "ia" ? (
                      <span className="conv-tag ia">IA</span>
                    ) : c.origem === "humano" ? (
                      <span className="conv-tag minha">minha</span>
                    ) : c.origem === "campanha" ? (
                      <span className="conv-tag campanha">campanha</span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Thread */}
        <div className="inbox-thread">
          {!sel ? (
            <div className="empty" style={{ margin: "auto" }}>
              Selecione uma conversa.
            </div>
          ) : (
            <>
              <div className="inbox-head">
                <button
                  type="button"
                  className="inbox-voltar"
                  onClick={() => setSel(null)}
                  aria-label="Voltar para as conversas"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <Avatar foto={sel.foto} nome={sel.contato_nome || sel.contato} />
                <div className="inbox-head-info">
                  <b>{sel.contato_nome || sel.contato}</b>
                  <span>{sel.contato} · {sel.agente_nome || "-"}</span>
                </div>
                {sel.agente_id ? (
                  <button
                    type="button"
                    className={`ia-toggle ${pausado ? "off" : "on"}`}
                    onClick={togglePausa}
                    title={
                      pausado
                        ? "Você assumiu o atendimento e a IA está pausada. Toque para devolver o atendimento à IA."
                        : "A IA está respondendo no automático. Toque para assumir você (pausa a IA neste contato)."
                    }
                  >
                    {pausado ? (
                      <svg className="ia-toggle-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 14 4 9 9 4" />
                        <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                      </svg>
                    ) : (
                      <span className="ia-toggle-dot" />
                    )}
                    {pausado ? "Devolver à IA" : "IA no automático"}
                  </button>
                ) : null}
                {sel.agente_id ? (
                  <div className="atrib-wrap">
                    <button
                      type="button"
                      className={`atrib-btn ${atribuido ? "on" : ""}`}
                      onClick={() => setAbrirAtrib((v) => !v)}
                      title="Atribuir/transferir esta conversa para uma atendente"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <line x1="19" y1="8" x2="19" y2="14" />
                        <line x1="22" y1="11" x2="16" y2="11" />
                      </svg>
                      {atribuido ? atribuido.usuario_nome.split(" ")[0] : "Atribuir"}
                    </button>
                    {abrirAtrib ? (
                      <div className="atrib-menu">
                        <div className="atrib-menu-tit">Transferir atendimento para</div>
                        {atendentes.length === 0 ? (
                          <div className="atrib-vazio">Nenhuma atendente cadastrada.</div>
                        ) : (
                          atendentes.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              className={`atrib-item ${atribuido?.usuario_id === a.id ? "sel" : ""}`}
                              onClick={() => atribuir(a.id)}
                            >
                              {a.nome}
                              {atribuido?.usuario_id === a.id ? " ✓" : ""}
                            </button>
                          ))
                        )}
                        {atribuido ? (
                          <button type="button" className="atrib-item remover" onClick={() => atribuir(0)}>
                            Remover atribuição
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="inbox-msgs wa-bg" ref={msgsRef}>
                {msgs.map((m) => (
                  <div key={m.id} className={`bolha ${m.direcao === "in" ? "in" : "out"}`}>
                    {m.media && m.media_tipo === "audio" ? (
                      <audio controls preload="none" src={m.media} style={{ maxWidth: 240, display: "block" }} />
                    ) : m.media && m.media_tipo === "imagem" ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <a href={m.media} target="_blank" rel="noreferrer">
                          <img src={m.media} alt="imagem" style={{ maxWidth: 240, borderRadius: 8, display: "block" }} />
                        </a>
                        {m.texto && m.texto !== "🖼️ Imagem" && <div className="bolha-txt" style={{ marginTop: 4 }}>{m.texto}</div>}
                      </>
                    ) : (
                      <div className="bolha-txt">{m.texto}</div>
                    )}
                    <div className="bolha-hora">
                      {m.quando}
                      {m.direcao === "out" && <Ticks status={m.status} />}
                    </div>
                  </div>
                ))}
                {msgs.length === 0 && (
                  <div className="wa-vazio">Sem mensagens nesta conversa ainda.</div>
                )}
                <div ref={fimRef} />
              </div>

              {erro && (
                <div className="msg err" style={{ margin: "0 12px" }}>
                  {erro}
                </div>
              )}

              <form className="inbox-reply" onSubmit={responder}>
                <input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Escreva uma resposta…"
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: "none" }}
                  disabled={enviando}
                >
                  {enviando ? "…" : "Enviar"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}
