"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../../components/Icon";

type Conversa = {
  id: number;
  agente_id: number;
  contato: string;
  status: string; // fila | atribuido | resolvido
  atendente_id: number | null;
  atendente_nome: string | null;
  contato_nome: string | null;
  foto: string | null;
  ultimo: string | null;
  direcao: string;
  origem: string | null;
  agente_nome: string | null;
  quando: string;
  nao_lida: boolean;
};
type Msg = {
  id: number;
  direcao: string;
  texto: string | null;
  status: string | null;
  origem: string | null;
  quando: string;
  media?: string | null;
  media_tipo?: string | null;
};
type NumeroAgente = { id: number; candidato: string; telefone: string | null };
type Atendente = {
  id: number; nome: string; disponivel: boolean; online: boolean;
  agentes: number[];
  visto_seg?: number | null;
  em_atendimento?: number;
  resolvidas_hoje?: number;
};
type Contadores = { fila: number; minhas: number; todas: number };
type Eu = { uid: number; nome: string; perfil: string; disponivel: boolean; gestor: boolean };
type View = "minhas" | "fila" | "todas" | "resolvidas" | "equipe";

// "há 3 min" / "há 2 h" / "há 4 d" a partir de segundos desde a última atividade.
function haQuanto(seg?: number | null): string {
  if (seg == null || !isFinite(seg) || seg < 0) return "nunca";
  const s = Math.floor(seg);
  if (s < 90) return "agora há pouco";
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

function iniciais(s: string): string {
  const p = (s || "?").trim().split(/\s+/);
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
function Avatar({ foto, nome }: { foto: string | null; nome: string }) {
  return foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="wa-avatar" src={foto} alt={nome} referrerPolicy="no-referrer" />
  ) : (
    <span className="wa-avatar wa-avatar-ini">{iniciais(nome)}</span>
  );
}

const VIEWS_VALIDAS: View[] = ["minhas", "fila", "todas", "resolvidas", "equipe"];

export default function AtendimentoCliente({ viewInicial }: { viewInicial?: string }) {
  // Links do Início ("Abrir fila") chegam com ?view=fila.
  const [view, setView] = useState<View>(
    VIEWS_VALIDAS.includes(viewInicial as View) ? (viewInicial as View) : "todas"
  );
  const [busca, setBusca] = useState("");
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [sel, setSel] = useState<Conversa | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [cont, setCont] = useState<Contadores>({ fila: 0, minhas: 0, todas: 0 });
  const [atendentes, setAtendentes] = useState<Atendente[]>([]);
  const [eu, setEu] = useState<Eu | null>(null);
  const [transferindo, setTransferindo] = useState(false);
  const [atendenteFiltro, setAtendenteFiltro] = useState<number>(0);
  // Filtro por número (agente): a equipe opera vários e quase sempre quer
  // olhar um de cada vez.
  const [agentes, setAgentes] = useState<NumeroAgente[]>([]);
  const [agenteFiltro, setAgenteFiltro] = useState<number>(0);
  const [respostas, setRespostas] = useState<{ id: number; atalho: string; texto: string }[]>([]);
  const [gerRapidas, setGerRapidas] = useState(false); // painel de gerenciar (gestor)
  const [botAtivo, setBotAtivo] = useState(false);
  const [botTexto, setBotTexto] = useState("");
  const [botSalvo, setBotSalvo] = useState("");
  const [gravando, setGravando] = useState(false);
  const mediaRec = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const fimRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const convReq = useRef(0);
  const threadReq = useRef(0);

  const carregarLista = useCallback(async () => {
    const p = new URLSearchParams({ view });
    if (busca.trim()) p.set("q", busca.trim());
    if (atendenteFiltro > 0) p.set("atendente", String(atendenteFiltro));
    if (agenteFiltro > 0) p.set("agente", String(agenteFiltro));
    const req = ++convReq.current;
    try {
      const r = await fetch(`/api/atendimento?${p}`, { cache: "no-store" });
      if (req !== convReq.current) return;
      if (r.ok) {
        const d = await r.json();
        setConversas(d.conversas || []);
        setCont(d.contadores || { fila: 0, minhas: 0, todas: 0 });
        setAtendentes(d.atendentes || []);
        setAgentes(d.agentes || []);
        setEu(d.eu || null);
      }
    } catch {}
  }, [view, busca, atendenteFiltro, agenteFiltro]);

  const carregarThread = useCallback(async (c: Conversa, forcarFim = false) => {
    const p = new URLSearchParams({ contato: c.contato, agente: String(c.agente_id) });
    const req = ++threadReq.current;
    try {
      const r = await fetch(`/api/atendimento?${p}`, { cache: "no-store" });
      if (req !== threadReq.current) return;
      if (r.ok) {
        const d = await r.json();
        const el = msgsRef.current;
        const perto = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        setMsgs(d.mensagens || []);
        if (d.conversa) setSel((s) => (s ? { ...s, ...d.conversa } : s));
        if (forcarFim || perto) setTimeout(() => fimRef.current?.scrollIntoView(), 50);
      }
    } catch {}
  }, []);

  // Heartbeat de presença: marca "online" ao abrir e a cada 45s.
  useEffect(() => {
    const bater = () =>
      fetch("/api/atendimento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "presenca" }),
      }).catch(() => {});
    bater();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") bater();
    }, 45000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    carregarLista();
  }, [carregarLista]);

  // Atendente não tem "Todas": se cair nela, joga pra Fila.
  useEffect(() => {
    if (eu?.perfil === "ATENDENTE" && view === "todas") setView("fila");
  }, [eu, view]);

  // Mantém a conversa aberta acessível ao poller sem resetar o timer a cada
  // mensagem nova (senão o intervalo se recriava toda hora).
  const selRef = useRef<Conversa | null>(null);
  selRef.current = sel;

  // Alerta de nova conversa na fila: som + título da aba piscando, para o
  // atendente não precisar ficar dando F5 pra ver se chegou algo.
  const filaAntesRef = useRef<number | null>(null);
  const tituloBaseRef = useRef<string>("");
  const piscaRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acRef = useRef<AudioContext | null>(null);

  function bipeNovaConversa() {
    try {
      let ac = acRef.current;
      if (!ac) {
        ac = new (window.AudioContext || (window as any).webkitAudioContext)();
        acRef.current = ac;
      }
      if (ac.state === "suspended") ac.resume();
      const t = ac.currentTime;
      [880, 1175].forEach((f, i) => {
        const osc = ac!.createOscillator();
        const g = ac!.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.14, t + i * 0.18 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16);
        osc.connect(g);
        g.connect(ac!.destination);
        osc.start(t + i * 0.18);
        osc.stop(t + i * 0.18 + 0.18);
      });
    } catch {
      /* som é enfeite */
    }
  }

  function piscarTitulo(qtd: number) {
    if (typeof document === "undefined") return;
    if (!tituloBaseRef.current) tituloBaseRef.current = document.title;
    if (piscaRef.current) clearInterval(piscaRef.current);
    let on = false;
    piscaRef.current = setInterval(() => {
      on = !on;
      document.title = on ? `🔴 (${qtd}) Nova conversa!` : tituloBaseRef.current;
    }, 1000);
  }
  function pararPisca() {
    if (piscaRef.current) {
      clearInterval(piscaRef.current);
      piscaRef.current = null;
    }
    if (tituloBaseRef.current) document.title = tituloBaseRef.current;
  }

  // Notificação do navegador (desktop) — aparece mesmo com a aba em 2º plano.
  function notificar(titulo: string, corpo: string) {
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const n = new Notification(titulo, { body: corpo, tag: "atendimento" });
      n.onclick = () => { try { window.focus(); n.close(); } catch {} };
    } catch {/* notificação é enfeite */}
  }

  // Respostas rápidas (canned): carrega ao abrir.
  const carregarRespostas = useCallback(async () => {
    try {
      const r = await fetch("/api/respostas", { cache: "no-store" });
      if (r.ok) setRespostas((await r.json()) || []);
    } catch {}
  }, []);
  useEffect(() => { carregarRespostas(); }, [carregarRespostas]);

  // Config do bot de saudação (gestor).
  useEffect(() => {
    if (!eu?.gestor) return;
    fetch("/api/atendimento/bot", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setBotAtivo(!!d.ativo); setBotTexto(d.texto || ""); } })
      .catch(() => {});
  }, [eu?.gestor]);

  async function salvarBot(ativo: boolean, texto: string) {
    setBotAtivo(ativo); // otimista
    const r = await fetch("/api/atendimento/bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo, texto }),
    });
    if (r.ok) { setBotSalvo("Salvo ✓"); setTimeout(() => setBotSalvo(""), 2000); }
    else setBotSalvo("Erro ao salvar");
  }

  // Sugestões enquanto digita "/atalho" no campo de resposta.
  const barraQuery = texto.startsWith("/") ? texto.slice(1).toLowerCase().trim() : null;
  const sugestoes =
    barraQuery !== null
      ? respostas.filter((r) => r.atalho.includes(barraQuery)).slice(0, 6)
      : [];

  async function criarResposta(atalho: string, txt: string) {
    const r = await fetch("/api/respostas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ atalho, texto: txt }),
    });
    if (r.ok) await carregarRespostas();
    return r.ok;
  }
  async function excluirResposta(id: number) {
    const r = await fetch(`/api/respostas?id=${id}`, { method: "DELETE" });
    if (r.ok) await carregarRespostas();
  }

  // Pede permissão de notificação uma vez ao abrir a tela.
  useEffect(() => {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } catch {}
  }, []);

  // Detecta aumento na fila e dispara os alertas (só quando cresce, não na 1ª carga).
  useEffect(() => {
    const antes = filaAntesRef.current;
    if (antes !== null && cont.fila > antes) {
      bipeNovaConversa();
      notificar("Nova conversa na fila", `${cont.fila} conversa(s) aguardando atendimento.`);
      if (document.visibilityState !== "visible") piscarTitulo(cont.fila);
    }
    filaAntesRef.current = cont.fila;
  }, [cont.fila]);

  // Ao voltar o foco para a aba, para de piscar o título.
  useEffect(() => {
    const parar = () => { if (document.visibilityState === "visible") pararPisca(); };
    window.addEventListener("focus", parar);
    document.addEventListener("visibilitychange", parar);
    return () => {
      window.removeEventListener("focus", parar);
      document.removeEventListener("visibilitychange", parar);
      pararPisca();
    };
  }, []);

  // Tempo real: poll a cada 3s + atualização IMEDIATA ao voltar o foco/aba
  // (era isso que fazia parecer "travado" quando você voltava de outra aba).
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      carregarLista();
      if (selRef.current) carregarThread(selRef.current);
    };
    const id = setInterval(tick, 5000);
    const onFoco = () => tick();
    window.addEventListener("focus", onFoco);
    document.addEventListener("visibilitychange", onFoco);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFoco);
      document.removeEventListener("visibilitychange", onFoco);
    };
  }, [carregarLista, carregarThread]);

  function abrir(c: Conversa) {
    setSel(c);
    setErro("");
    setMsgs([]);
    carregarThread(c, true);
  }

  async function acao(acao: string, extra: Record<string, unknown> = {}) {
    if (!sel) return;
    const r = await fetch("/api/atendimento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, agente_id: sel.agente_id, contato: sel.contato, ...extra }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(d.erro || "Falha na ação."); return false; }
    await carregarLista();
    await carregarThread(sel);
    return true;
  }

  async function toggleDisponivel() {
    if (!eu) return;
    const novo = !eu.disponivel;
    setEu({ ...eu, disponivel: novo });
    await fetch("/api/atendimento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "presenca", disponivel: novo }),
    }).catch(() => {});
    carregarLista();
  }

  async function enviarImagem(file: File) {
    if (!sel || !file) return;
    if (!/^image\//.test(file.type)) { setErro("Selecione um arquivo de imagem."); return; }
    if (file.size > 5 * 1024 * 1024) { setErro("Imagem muito grande (máx 5MB)."); return; }
    setErro("");
    const dataUri: string = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
    setEnviando(true);
    try {
      const r = await fetch("/api/atendimento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "imagem", agente_id: sel.agente_id, contato: sel.contato, imagem: dataUri }),
      });
      const d = await r.json().catch(() => ({} as any));
      if (!r.ok) setErro(d.erro || "Falha ao enviar imagem.");
      else { await carregarThread(sel, true); carregarLista(); }
    } catch {
      setErro("Falha de conexão ao enviar imagem.");
    } finally {
      setEnviando(false);
      if (imgInputRef.current) imgInputRef.current.value = "";
    }
  }

  async function responder(e: React.FormEvent) {
    e.preventDefault();
    if (!sel || !texto.trim()) return;
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch("/api/atendimento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "responder", agente_id: sel.agente_id, contato: sel.contato, texto }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErro(d.erro || "Falha ao enviar.");
      else {
        setTexto("");
        await carregarThread(sel, true);
        carregarLista();
      }
    } finally {
      setEnviando(false);
    }
  }

  // ===== Gravação e envio de áudio =====
  async function enviarAudio(dataUri: string) {
    if (!sel) return;
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch("/api/atendimento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "audio", agente_id: sel.agente_id, contato: sel.contato, audio: dataUri }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErro(d.erro || "Falha ao enviar áudio.");
      else {
        await carregarThread(sel, true);
        carregarLista();
      }
    } finally {
      setEnviando(false);
    }
  }
  async function alternarGravacao() {
    if (gravando) {
      mediaRec.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Preferir formatos que a META aceita (ogg/opus, mp4). Chrome só grava
      // webm — nesse caso a Meta recusa (o Evolution aceita). Firefox faz ogg;
      // Safari faz mp4 → esses funcionam direto na Meta.
      const prefer = [
        "audio/ogg;codecs=opus",
        "audio/ogg",
        "audio/mp4",
        "audio/mpeg",
        "audio/webm;codecs=opus",
        "audio/webm",
      ];
      const mime = prefer.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const dataUri: string = await new Promise((res) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result as string);
          fr.readAsDataURL(blob);
        });
        setGravando(false);
        if (blob.size > 500) await enviarAudio(dataUri);
      };
      rec.start();
      mediaRec.current = rec;
      setGravando(true);
    } catch {
      setErro("Não foi possível acessar o microfone (permita o acesso no navegador).");
    }
  }

  const souDono = !!(sel && eu && sel.atendente_id === eu.uid);
  const podeAgir = !!(sel && (eu?.gestor || souDono || sel.status === "fila"));

  // Atendente NÃO vê "Todas" (conversas de outros atendem atrapalham). Só o
  // gestor (ADMIN/Coordenação/Marketing) enxerga a visão geral.
  const ehAtendente = eu?.perfil === "ATENDENTE";
  const VIEWS: { k: View; label: string; badge?: number }[] = [
    { k: "minhas", label: "Minhas", badge: cont.minhas },
    { k: "fila", label: "Fila", badge: cont.fila },
    ...(ehAtendente ? [] : [{ k: "todas" as View, label: "Todas", badge: cont.todas }]),
    { k: "resolvidas", label: "Resolvidas" },
    ...(ehAtendente ? [] : [{ k: "equipe" as View, label: "Equipe", badge: atendentes.filter((a) => a.online).length }]),
  ];

  return (
    <>

      <div className="at-wrap">
        {/* Visões (Minhas, Fila, Todas…) em chips no topo */}
        <div className="at-topo">
          <div className="chips at-views" role="tablist" aria-label="Visões do atendimento">
            {VIEWS.map((v) => (
              <button
                key={v.k}
                type="button"
                role="tab"
                aria-selected={view === v.k}
                className={`chip${view === v.k ? " ativo" : ""}`}
                onClick={() => setView(v.k)}
              >
                {v.label}
                {typeof v.badge === "number" && v.badge > 0 && <span className="cnt">{v.badge}</span>}
              </button>
            ))}
          </div>
          {eu && eu.perfil === "ATENDENTE" && (
            <button
              type="button"
              className={`chip at-presenca${eu.disponivel ? " on" : ""}`}
              onClick={toggleDisponivel}
              title="Ligar ou desligar o recebimento de novas conversas"
            >
              <span className={`at-dot ${eu.disponivel ? "on" : "off"}`} />
              {eu.disponivel ? "Disponível" : "Ausente"}
            </button>
          )}
        </div>

        {/* LISTA + THREAD (reusa o visual do inbox) */}
        <div className={`inbox${sel ? " thread-aberta" : ""}`}>
          <div className="inbox-list">
            {view === "equipe" ? (
              <div className="at-equipe">
                {/* Bot de 1ª resposta: liga/desliga + texto */}
                <div className="at-bot">
                  <div className="at-bot-topo">
                    <div>
                      <b><Icon name="bot" size={15} /> Bot de 1ª resposta</b>
                      <span>Manda uma acolhida automática quando o contato responde; depois entrega à equipe.</span>
                    </div>
                    <button
                      type="button"
                      className={`switch${botAtivo ? " on" : ""}`}
                      onClick={() => salvarBot(!botAtivo, botTexto)}
                      role="switch"
                      aria-checked={botAtivo}
                      aria-label={botAtivo ? "Bot ligado. Desligar" : "Bot desligado. Ligar"}
                    >
                      <span className="dot" />
                    </button>
                  </div>
                  <textarea
                    id="bot-texto"
                    value={botTexto}
                    onChange={(e) => setBotTexto(e.target.value)}
                    rows={2}
                    placeholder="Mensagem automática de acolhida…"
                  />
                  <div className="at-bot-rodape">
                    <button type="button" className="at-btn prim" onClick={() => salvarBot(botAtivo, botTexto)}>Salvar texto</button>
                    {botSalvo && <span className="muted">{botSalvo}</span>}
                  </div>
                </div>
                {atendentes.length === 0 ? (
                  <div className="empty empty-sm">Nenhum atendente cadastrado.</div>
                ) : (
                  atendentes.map((a) => {
                    const estado = a.online ? "on" : "off";
                    const rotulo = a.online ? "Online" : "Offline";
                    return (
                      <div
                        key={a.id}
                        className="at-eq-item clic"
                        role="button"
                        tabIndex={0}
                        title={`Ver conversas de ${a.nome}`}
                        onClick={() => { setAtendenteFiltro(a.id); setView("todas"); }}
                      >
                        <span className="at-eq-av">
                          {(a.nome || "?").trim().charAt(0).toUpperCase()}
                          <span className={`st-ring ${estado}`} />
                        </span>
                        <div className="at-eq-main">
                          <div className="at-eq-nome">{a.nome}</div>
                          <div className="at-eq-sub">
                            <span className={`st-txt ${estado}`}>{rotulo}</span>
                            {" · "}
                            {a.online ? "ativo agora" : `visto ${haQuanto(a.visto_seg)}`}
                          </div>
                        </div>
                        <div className="at-eq-nums">
                          <div className="at-eq-num now" title="Em atendimento agora">
                            <b>{a.em_atendimento ?? 0}</b><span>ativas</span>
                          </div>
                          <div className="at-eq-num done" title="Resolvidas hoje">
                            <b>{a.resolvidas_hoje ?? 0}</b><span>hoje</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
            <>
            <div className="inbox-filtros">
              <input id="at-busca" className="inbox-busca" placeholder="Buscar conversa…" value={busca} onChange={(e) => setBusca(e.target.value)} />
              {agentes.length > 1 && (
                <select
                  className="inbox-busca at-filtro-numero"
                  value={agenteFiltro}
                  onChange={(e) => setAgenteFiltro(Number(e.target.value))}
                  title="Ver só o atendimento deste número"
                >
                  <option value={0}>Todos os números</option>
                  {agentes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.candidato}
                      {a.telefone ? ` · ${a.telefone}` : ""}
                    </option>
                  ))}
                </select>
              )}
              {eu?.gestor && atendentes.length > 0 && (
                <select
                  className="inbox-busca at-filtro-atendente"
                  value={atendenteFiltro}
                  onChange={(e) => setAtendenteFiltro(Number(e.target.value))}
                  title="Filtrar por atendente"
                >
                  <option value={0}>Todos os atendentes</option>
                  {atendentes.map((a) => (
                    <option key={a.id} value={a.id}>{a.nome}</option>
                  ))}
                </select>
              )}
            </div>
            {conversas.length === 0 ? (
              <div className="empty empty-sm">Nenhuma conversa nesta lista.</div>
            ) : (
              conversas.map((c) => {
                const aberta = sel?.contato === c.contato && sel?.agente_id === c.agente_id;
                const naoLida = c.nao_lida && !aberta;
                return (
                <button key={c.contato + c.agente_id} className={`inbox-conv${aberta ? " ativo" : ""}${naoLida ? " nao-lida" : ""}`} onClick={() => abrir(c)}>
                  <Avatar foto={c.foto} nome={c.contato_nome || c.contato} />
                  <div className="inbox-conv-body">
                    <div className="inbox-conv-top">
                      <span className="inbox-conv-nome">{c.contato_nome || c.contato}</span>
                      <span className="inbox-conv-quando">
                        {(c.quando || "").slice(11)}
                        {naoLida && <span className="inbox-nao-lida-dot" title="Não lida" />}
                      </span>
                    </div>
                    <div className="inbox-conv-prev">
                      <span className="inbox-conv-txt">
                        {c.direcao === "out" ? "Você: " : ""}
                        {(c.ultimo || "").slice(0, 34)}
                      </span>
                      {c.status === "fila" ? (
                        <span className="at-badge fila">fila</span>
                      ) : c.status === "resolvido" ? (
                        <span className="at-badge resolv">ok</span>
                      ) : eu && c.atendente_id === eu.uid ? (
                        <span className="at-badge minha">minha</span>
                      ) : c.atendente_nome ? (
                        <span className="at-badge outro">{c.atendente_nome.split(" ")[0]}</span>
                      ) : null}
                    </div>
                    <div className="at-conv-sub">
                      <span className="at-conv-atendente">{c.agente_nome}</span>
                    </div>
                  </div>
                </button>
                );
              })
            )}
            </>
            )}
          </div>

          <div className="inbox-thread">
            {!sel ? (
              <div className="empty inbox-vazia"><Icon name="chat" size={28} /><span>Escolha uma conversa na lista.</span></div>
            ) : (
              <>
                <div className="inbox-head at-head">
                  <button type="button" className="inbox-voltar" onClick={() => setSel(null)} aria-label="Voltar para a lista">
                    <Icon name="chevron-left" size={22} />
                  </button>
                  <Avatar foto={sel.foto} nome={sel.contato_nome || sel.contato} />
                  <div className="inbox-head-info">
                    <b>{sel.contato_nome || sel.contato}</b>
                    <span>
                      {sel.contato} · {sel.agente_nome || "-"}
                      {sel.status === "fila" && " · na fila"}
                      {sel.status === "atribuido" && sel.atendente_nome && ` · ${souDono ? "você" : sel.atendente_nome}`}
                      {sel.status === "resolvido" && " · resolvida"}
                    </span>
                  </div>

                  {/* Ações de atribuição */}
                  <div className="at-acoes">
                    {sel.status === "resolvido" ? (
                      <button type="button" className="at-btn" onClick={() => acao("reabrir")}>Reabrir</button>
                    ) : (
                      <>
                        {!souDono && (
                          <button type="button" className="at-btn prim" onClick={() => acao("assumir")}>Assumir</button>
                        )}
                        {podeAgir && (
                          <button type="button" className="at-btn" onClick={() => setTransferindo((v) => !v)} aria-expanded={transferindo}>Transferir <Icon name="chevron-down" size={14} /></button>
                        )}
                        {podeAgir && (
                          <button type="button" className="at-btn ok" onClick={() => acao("resolver")}><Icon name="check" size={14} /> Resolver</button>
                        )}
                      </>
                    )}
                  </div>

                  {transferindo && podeAgir && (
                    <div className="at-transferir">
                      {(() => {
                        // Mostra colegas vinculados a este número primeiro; se não
                        // houver, mostra todos os atendentes (transferência livre
                        // entre a equipe). Nunca fica vazio.
                        const doNumero = atendentes.filter((a) => (a.agentes || []).includes(sel.agente_id));
                        const lista = doNumero.length > 0 ? doNumero : atendentes;
                        return lista
                          .filter((a) => a.id !== sel.atendente_id)
                          .map((a) => (
                            <button key={a.id} type="button" className="at-btn"
                              onClick={async () => { if (await acao("transferir", { para: a.id })) setTransferindo(false); }}>
                              <span className={`at-dot ${a.online && a.disponivel ? "on" : "off"}`} />
                              {a.nome.split(" ")[0]}
                            </button>
                          ));
                      })()}
                      <button type="button" className="at-btn" onClick={async () => { if (await acao("transferir", { para: null })) setTransferindo(false); }}>Devolver à fila</button>
                    </div>
                  )}
                </div>

                <div className="inbox-msgs wa-bg" ref={msgsRef}>
                  {msgs.map((m) => (
                    <div key={m.id} className={`bolha ${m.direcao === "in" ? "in" : "out"}`}>
                      {m.media && m.media_tipo === "audio" ? (
                        <audio className="bolha-audio" controls preload="none" src={m.media} />
                      ) : m.media && m.media_tipo === "imagem" ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <a href={m.media} target="_blank" rel="noreferrer">
                            <img className="bolha-img" src={m.media} alt="Imagem enviada na conversa" />
                          </a>
                          {m.texto && m.texto !== "🖼️ Imagem" && <div className="bolha-txt bolha-legenda">{m.texto}</div>}
                        </>
                      ) : (
                        <div className="bolha-txt">{m.texto}</div>
                      )}
                      <div className="bolha-hora">{(m.quando || "").slice(11)}{m.origem === "ia" && m.direcao === "out" ? " · IA" : ""}</div>
                    </div>
                  ))}
                  {msgs.length === 0 && <div className="wa-vazio">Sem mensagens ainda.</div>}
                  <div ref={fimRef} />
                </div>

                {erro && <div className="msg err at-erro">{erro}</div>}

                {/* Gerenciar respostas rápidas (gestor) */}
                {eu?.gestor && gerRapidas && (
                  <GerenciarRapidas
                    respostas={respostas}
                    onCriar={criarResposta}
                    onExcluir={excluirResposta}
                    onFechar={() => setGerRapidas(false)}
                  />
                )}

                {/* Sugestões de resposta rápida ao digitar "/atalho" */}
                {sugestoes.length > 0 && (
                  <div className="at-sugestoes">
                    {sugestoes.map((r) => (
                      <button key={r.id} type="button" onClick={() => setTexto(r.texto)}>
                        <b>/{r.atalho}</b>
                        <span>
                          {r.texto.slice(0, 60)}{r.texto.length > 60 ? "…" : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <form className="inbox-reply" onSubmit={responder}>
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter escolhe a 1ª sugestão (em vez de enviar o "/atalho").
                      if (sugestoes.length > 0 && e.key === "Enter") {
                        e.preventDefault();
                        setTexto(sugestoes[0].texto);
                      }
                    }}
                    id="at-resposta"
                    placeholder={gravando ? "Gravando áudio…" : "Escreva uma resposta… (digite / para respostas rápidas)"}
                    disabled={gravando}
                  />
                  <input
                    ref={imgInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarImagem(f); }}
                  />
                  <button
                    type="button"
                    onClick={() => imgInputRef.current?.click()}
                    disabled={enviando || gravando}
                    title="Enviar imagem"
                    aria-label="Enviar imagem"
                    className="reply-ic"
                  >
                    <Icon name="image" size={18} />
                  </button>
                  {eu?.gestor && (
                    <button
                      type="button"
                      onClick={() => setGerRapidas((v) => !v)}
                      title="Gerenciar respostas rápidas"
                      aria-label="Gerenciar respostas rápidas"
                      className="reply-ic"
                    >
                      <Icon name="zap" size={18} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={alternarGravacao}
                    disabled={enviando}
                    title={gravando ? "Parar e enviar" : "Gravar áudio"}
                    aria-label={gravando ? "Parar e enviar o áudio" : "Gravar áudio"}
                    className={`reply-ic${gravando ? " gravando" : ""}`}
                  >
                    <Icon name={gravando ? "square" : "mic"} size={18} />
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={enviando || gravando}>
                    {enviando ? "…" : "Enviar"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Painel de gerenciamento de respostas rápidas (gestor): lista + criar + excluir.
function GerenciarRapidas({
  respostas,
  onCriar,
  onExcluir,
  onFechar,
}: {
  respostas: { id: number; atalho: string; texto: string }[];
  onCriar: (atalho: string, texto: string) => Promise<boolean>;
  onExcluir: (id: number) => void;
  onFechar: () => void;
}) {
  const [atalho, setAtalho] = useState("");
  const [txt, setTxt] = useState("");
  const [erro, setErro] = useState("");
  return (
    <div className="at-rapidas">
      <div className="at-rapidas-topo">
        <b>Respostas rápidas</b>
        <button type="button" className="modal-x" onClick={onFechar} aria-label="Fechar respostas rápidas">
          <Icon name="x" size={16} />
        </button>
      </div>
      {respostas.length === 0 ? (
        <p className="muted">Nenhuma ainda. Crie a primeira abaixo.</p>
      ) : (
        <div className="at-rapidas-lista">
          {respostas.map((r) => (
            <div key={r.id} className="at-rapidas-item">
              <b>/{r.atalho}</b>
              <span>{r.texto}</span>
              <button type="button" className="btn-acao danger" onClick={() => onExcluir(r.id)}>Excluir</button>
            </div>
          ))}
        </div>
      )}
      <div className="at-rapidas-nova">
        <input id="rapida-atalho" value={atalho} onChange={(e) => setAtalho(e.target.value)} placeholder="atalho (ex.: saudacao)" />
        <input id="rapida-texto" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="texto da mensagem" />
        <button type="button" className="at-btn prim" onClick={async () => {
          if (!atalho.trim() || !txt.trim()) { setErro("Preencha atalho e texto."); return; }
          if (await onCriar(atalho, txt)) { setAtalho(""); setTxt(""); setErro(""); }
          else setErro("Não foi possível salvar.");
        }}>Adicionar</button>
      </div>
      {erro && <p className="at-rapidas-erro">{erro}</p>}
    </div>
  );
}
