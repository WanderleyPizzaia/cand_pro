"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

export default function AtendimentoCliente() {
  const [view, setView] = useState<View>("todas");
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
    const req = ++convReq.current;
    try {
      const r = await fetch(`/api/atendimento?${p}`, { cache: "no-store" });
      if (req !== convReq.current) return;
      if (r.ok) {
        const d = await r.json();
        setConversas(d.conversas || []);
        setCont(d.contadores || { fila: 0, minhas: 0, todas: 0 });
        setAtendentes(d.atendentes || []);
        setEu(d.eu || null);
      }
    } catch {}
  }, [view, busca, atendenteFiltro]);

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
      <style>{`
        .at-wrap{display:flex;gap:14px}
        .at-rail{flex:none;width:186px;display:flex;flex-direction:column;gap:6px}
        .at-view{display:flex;align-items:center;justify-content:space-between;gap:8px;
          padding:10px 12px;border-radius:10px;border:1px solid var(--border,#e3e6ec);
          background:var(--card,#fff);cursor:pointer;font-size:13.5px;font-weight:600;color:inherit;text-align:left}
        .at-view.ativo{background:var(--brand,#1f4fd6);color:#fff;border-color:transparent}
        .at-view .cnt{font-size:11px;font-weight:700;background:rgba(0,0,0,.08);border-radius:20px;padding:1px 8px}
        .at-view.ativo .cnt{background:rgba(255,255,255,.25)}
        .at-presenca{margin-top:8px;display:flex;align-items:center;gap:8px;padding:10px 12px;
          border-radius:10px;border:1px solid var(--border,#e3e6ec);background:var(--card,#fff);
          cursor:pointer;font-size:12.5px;font-weight:600}
        .at-dot{width:9px;height:9px;border-radius:50%;flex:none}
        .at-dot.on{background:#2c9c4b} .at-dot.off{background:#9aa1ad}
        .at-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;
          padding:2px 7px;border-radius:20px}
        .at-badge.fila{background:#fdeede;color:#b5651a}
        .at-badge.minha{background:#e3f0ff;color:#1f5fbf}
        .at-badge.outro{background:#efeaf7;color:#6a4bb0}
        .at-badge.resolv{background:#e6f4ec;color:#2c7a4b}
        .at-acoes{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
        .at-btn{font-size:12px;font-weight:600;padding:5px 11px;border-radius:8px;
          border:1px solid var(--border,#e3e6ec);background:var(--card,#fff);cursor:pointer;color:inherit}
        .at-btn.prim{background:var(--brand,#1f4fd6);color:#fff;border-color:transparent}
        .at-btn.ok{background:#2c7a4b;color:#fff;border-color:transparent}
        .at-btn:disabled{opacity:.5;cursor:not-allowed}
        .at-conv-sub{display:flex;align-items:center;gap:6px;margin-top:2px}
        .at-conv-atendente{font-size:11px;color:var(--muted,#6b7280)}
        .at-equipe{padding:10px 12px;display:flex;flex-direction:column;gap:8px}
        .at-eq-item{display:flex;align-items:center;gap:11px;padding:11px 13px;border:1px solid var(--border,#e3e6ec);
          border-radius:14px;background:var(--card,#fff)}
        .at-eq-av{position:relative;width:38px;height:38px;border-radius:50%;flex:none;display:flex;
          align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;background:var(--brand,#1f4fd6)}
        .at-eq-av .st-ring{position:absolute;right:-1px;bottom:-1px;width:12px;height:12px;border-radius:50%;
          border:2px solid var(--card,#fff)}
        .st-ring.on{background:#2c9c4b} .st-ring.busy{background:#e6a417} .st-ring.off{background:#b6bcc6}
        .at-eq-main{flex:1;min-width:0}
        .at-eq-nome{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .at-eq-sub{font-size:11.5px;color:var(--muted,#6b7280);margin-top:2px;white-space:nowrap;
          overflow:hidden;text-overflow:ellipsis}
        .st-txt{font-weight:700}
        .st-txt.on{color:#2c9c4b} .st-txt.busy{color:#b5651a} .st-txt.off{color:#9aa1ad}
        .at-eq-nums{display:flex;gap:16px;flex:none;text-align:center}
        .at-eq-num b{display:block;font-size:16px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
        .at-eq-num span{font-size:9.5px;color:var(--muted,#6b7280);font-weight:700;text-transform:uppercase;letter-spacing:.03em}
        .at-eq-num.now b{color:#1f5fbf} .at-eq-num.done b{color:#2c7a4b}
        .at-eq-item.clic{cursor:pointer;transition:border-color .15s,box-shadow .15s,transform .05s}
        .at-eq-item.clic:hover{border-color:var(--brand,#1f4fd6);box-shadow:0 2px 10px rgba(31,79,214,.10)}
        .at-eq-item.clic:active{transform:scale(.995)}
        .at-filtro-atendente{margin-top:8px}
        .inbox-nao-lida-dot{display:inline-block;width:9px;height:9px;border-radius:50%;
          background:#2c9c4b;margin-left:6px;vertical-align:middle}
        .inbox-conv.nao-lida .inbox-conv-nome{font-weight:800}
        .inbox-conv.nao-lida .inbox-conv-txt{color:var(--text,#1a1a1a);font-weight:600}
        @media (max-width:860px){.at-rail{width:100%;flex-direction:row;overflow-x:auto}
          .at-wrap{flex-direction:column}
          .at-btn{min-height:40px;padding-top:8px;padding-bottom:8px}
          .at-view{min-height:40px}}
      `}</style>

      <div className="at-wrap">
        {/* RAIL de views */}
        <div className="at-rail">
          {VIEWS.map((v) => (
            <button key={v.k} className={`at-view${view === v.k ? " ativo" : ""}`} onClick={() => setView(v.k)}>
              <span>{v.label}</span>
              {typeof v.badge === "number" && v.badge > 0 && <span className="cnt">{v.badge}</span>}
            </button>
          ))}
          {eu && eu.perfil === "ATENDENTE" && (
            <button className="at-presenca" onClick={toggleDisponivel} title="Ligar/desligar recebimento de novas conversas">
              <span className={`at-dot ${eu.disponivel ? "on" : "off"}`} />
              {eu.disponivel ? "Disponível" : "Ausente"}
            </button>
          )}
        </div>

        {/* LISTA + THREAD (reusa o visual do inbox) */}
        <div className={`inbox${sel ? " thread-aberta" : ""}`} style={{ flex: 1 }}>
          <div className="inbox-list">
            {view === "equipe" ? (
              <div className="at-equipe">
                {/* Bot de 1ª resposta: liga/desliga + texto */}
                <div style={{ border: "1px solid var(--border,#e3e6ec)", borderRadius: 12, background: "var(--card,#fff)", padding: 12, marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>🤖 Bot de 1ª resposta</div>
                      <div style={{ fontSize: 11.5, color: "var(--muted,#6b7280)" }}>
                        Manda uma acolhida automática quando o contato responde; depois entrega à equipe.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => salvarBot(!botAtivo, botTexto)}
                      style={{
                        flex: "none", cursor: "pointer", border: "none", borderRadius: 20,
                        padding: "6px 14px", fontWeight: 700, fontSize: 12.5, color: "#fff",
                        background: botAtivo ? "#2c9c4b" : "#9aa1ad",
                      }}
                    >
                      {botAtivo ? "Ligado" : "Desligado"}
                    </button>
                  </div>
                  <textarea
                    value={botTexto}
                    onChange={(e) => setBotTexto(e.target.value)}
                    rows={2}
                    placeholder="Mensagem automática de acolhida…"
                    style={{ width: "100%", marginTop: 8, resize: "vertical" }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                    <button type="button" className="at-btn prim" onClick={() => salvarBot(botAtivo, botTexto)}>Salvar texto</button>
                    {botSalvo && <span style={{ fontSize: 12, color: "var(--muted,#6b7280)" }}>{botSalvo}</span>}
                  </div>
                </div>
                {atendentes.length === 0 ? (
                  <div className="empty" style={{ padding: 24, fontSize: 13 }}>Nenhum atendente cadastrado.</div>
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
              <input className="inbox-busca" placeholder="Buscar conversa…" value={busca} onChange={(e) => setBusca(e.target.value)} />
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
              <div className="empty" style={{ padding: 24, fontSize: 13 }}>Nenhuma conversa nesta lista.</div>
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
              <div className="empty" style={{ margin: "auto" }}>Selecione uma conversa.</div>
            ) : (
              <>
                <div className="inbox-head" style={{ flexWrap: "wrap", rowGap: 8 }}>
                  <button type="button" className="inbox-voltar" onClick={() => setSel(null)} aria-label="Voltar">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
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
                  <div className="at-acoes" style={{ marginLeft: "auto" }}>
                    {sel.status === "resolvido" ? (
                      <button className="at-btn" onClick={() => acao("reabrir")}>Reabrir</button>
                    ) : (
                      <>
                        {!souDono && (
                          <button className="at-btn prim" onClick={() => acao("assumir")}>Assumir</button>
                        )}
                        {podeAgir && (
                          <button className="at-btn" onClick={() => setTransferindo((v) => !v)}>Transferir ▾</button>
                        )}
                        {podeAgir && (
                          <button className="at-btn ok" onClick={() => acao("resolver")}>Resolver</button>
                        )}
                      </>
                    )}
                  </div>

                  {transferindo && podeAgir && (
                    <div style={{ flexBasis: "100%", display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(() => {
                        // Mostra colegas vinculados a este número primeiro; se não
                        // houver, mostra todos os atendentes (transferência livre
                        // entre a equipe). Nunca fica vazio.
                        const doNumero = atendentes.filter((a) => (a.agentes || []).includes(sel.agente_id));
                        const lista = doNumero.length > 0 ? doNumero : atendentes;
                        return lista
                          .filter((a) => a.id !== sel.atendente_id)
                          .map((a) => (
                            <button key={a.id} className="at-btn"
                              onClick={async () => { if (await acao("transferir", { para: a.id })) setTransferindo(false); }}>
                              <span className={`at-dot ${a.online && a.disponivel ? "on" : "off"}`} style={{ display: "inline-block", marginRight: 5 }} />
                              {a.nome.split(" ")[0]}
                            </button>
                          ));
                      })()}
                      <button className="at-btn" onClick={async () => { if (await acao("transferir", { para: null })) setTransferindo(false); }}>↩ Devolver à fila</button>
                    </div>
                  )}
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
                      <div className="bolha-hora">{(m.quando || "").slice(11)}{m.origem === "ia" && m.direcao === "out" ? " · IA" : ""}</div>
                    </div>
                  ))}
                  {msgs.length === 0 && <div className="wa-vazio">Sem mensagens ainda.</div>}
                  <div ref={fimRef} />
                </div>

                {erro && <div className="msg err" style={{ margin: "0 12px" }}>{erro}</div>}

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
                  <div style={{
                    margin: "0 12px", border: "1px solid var(--border,#e3e6ec)", borderRadius: 10,
                    background: "var(--card,#fff)", boxShadow: "var(--shadow)", overflow: "hidden",
                  }}>
                    {sugestoes.map((r) => (
                      <button key={r.id} type="button"
                        onClick={() => setTexto(r.texto)}
                        style={{
                          display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
                          border: "none", borderBottom: "1px solid var(--border,#eee)",
                          background: "transparent", cursor: "pointer", color: "inherit",
                        }}>
                        <b style={{ color: "var(--brand,#1f4fd6)" }}>/{r.atalho}</b>
                        <span style={{ color: "var(--muted,#6b7280)", fontSize: 12.5, marginLeft: 8 }}>
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
                    placeholder={gravando ? "Gravando áudio…" : "Escreva uma resposta… (digite / para respostas rápidas)"}
                    disabled={gravando}
                  />
                  <input
                    ref={imgInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarImagem(f); }}
                  />
                  <button
                    type="button"
                    onClick={() => imgInputRef.current?.click()}
                    disabled={enviando || gravando}
                    title="Enviar imagem"
                    style={{
                      flex: "none", width: 42, borderRadius: 8, cursor: "pointer",
                      border: "1px solid var(--border,#e3e6ec)", background: "var(--card,#fff)",
                      color: "inherit", fontSize: 18,
                    }}
                  >
                    🖼️
                  </button>
                  {eu?.gestor && (
                    <button
                      type="button"
                      onClick={() => setGerRapidas((v) => !v)}
                      title="Gerenciar respostas rápidas"
                      style={{
                        flex: "none", width: 42, borderRadius: 8, cursor: "pointer",
                        border: "1px solid var(--border,#e3e6ec)", background: "var(--card,#fff)",
                        color: "inherit", fontSize: 16,
                      }}
                    >
                      ⚡
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={alternarGravacao}
                    disabled={enviando}
                    title={gravando ? "Parar e enviar" : "Gravar áudio"}
                    style={{
                      flex: "none", width: 42, borderRadius: 8, cursor: "pointer",
                      border: "1px solid var(--border,#e3e6ec)",
                      background: gravando ? "#c8262b" : "var(--card,#fff)",
                      color: gravando ? "#fff" : "inherit", fontSize: 18,
                    }}
                  >
                    {gravando ? "■" : "🎤"}
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: "none" }} disabled={enviando || gravando}>
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
    <div style={{ margin: "0 12px 8px", border: "1px solid var(--border,#e3e6ec)", borderRadius: 10, background: "var(--card,#fff)", boxShadow: "var(--shadow)", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <b>Respostas rápidas</b>
        <button type="button" onClick={onFechar} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: "var(--muted,#6b7280)" }}>×</button>
      </div>
      {respostas.length === 0 ? (
        <div style={{ color: "var(--muted,#6b7280)", fontSize: 12.5, marginBottom: 8 }}>Nenhuma ainda. Crie a primeira abaixo.</div>
      ) : (
        <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: 8 }}>
          {respostas.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border,#eee)" }}>
              <b style={{ color: "var(--brand,#1f4fd6)", flex: "none" }}>/{r.atalho}</b>
              <span style={{ flex: 1, color: "var(--muted,#6b7280)", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.texto}</span>
              <button type="button" onClick={() => onExcluir(r.id)} style={{ flex: "none", border: "1px solid var(--border,#e3e6ec)", background: "transparent", color: "var(--red,#c8262b)", borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontSize: 12 }}>excluir</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input value={atalho} onChange={(e) => setAtalho(e.target.value)} placeholder="atalho (ex.: saudacao)" style={{ flex: "0 0 150px" }} />
        <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="texto da mensagem" style={{ flex: 1, minWidth: 160 }} />
        <button type="button" className="at-btn prim" onClick={async () => {
          if (!atalho.trim() || !txt.trim()) { setErro("Preencha atalho e texto."); return; }
          if (await onCriar(atalho, txt)) { setAtalho(""); setTxt(""); setErro(""); }
          else setErro("Não foi possível salvar.");
        }}>Adicionar</button>
      </div>
      {erro && <div style={{ color: "var(--red,#c8262b)", fontSize: 12.5, marginTop: 6 }}>{erro}</div>}
    </div>
  );
}
