"use client";

import { useEffect, useRef, useState } from "react";
import Icon, { IconName } from "./Icon";

type Notif = {
  id: number; tipo: string; icone: string | null; titulo: string;
  texto: string | null; comemora: boolean; lida: boolean; criado_em: string;
};

const ICONE: Record<string, IconName> = {
  apoiador: "star", contato: "user-plus", cidade: "map-pin", pauta: "inbox", marco: "trophy",
};

function quando(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return Math.floor(s / 60) + " min";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}

export default function Notificacoes() {
  const [itens, setItens] = useState<Notif[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [toasts, setToasts] = useState<Notif[]>([]);
  const [perm, setPerm] = useState<string>("default");
  const maxId = useRef<number | null>(null);

  useEffect(() => {
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
  }, []);

  function ativarNotif() {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then((p) => setPerm(p));
  }

  function pushSistema(n: Notif) {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(n.titulo, { body: n.texto || "", icon: "/icons/icon-192.png", tag: "cp-" + n.id, vibrate: n.comemora ? [120, 60, 120] : [90] } as NotificationOptions);
      }
    } catch { /* ignora */ }
  }

  async function puxar() {
    try {
      const r = await fetch("/api/notificacoes", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      const lista: Notif[] = d.itens || [];
      setItens(lista);
      setNaoLidas(d.naoLidas || 0);
      const topo = lista.length ? Math.max(...lista.map((i) => i.id)) : 0;
      if (maxId.current === null) {
        maxId.current = topo; // primeira carga: não dispara toast retroativo
      } else if (topo > maxId.current) {
        const novos = lista.filter((i) => i.id > (maxId.current as number)).reverse();
        maxId.current = topo;
        novos.forEach((n, k) => setTimeout(() => { mostrarToast(n); pushSistema(n); }, k * 500));
      }
    } catch { /* silencioso */ }
  }

  function mostrarToast(n: Notif) {
    setToasts((t) => [...t, n]);
    try { if (navigator.vibrate) navigator.vibrate(n.comemora ? [120, 60, 120, 60, 200] : [90]); } catch {}
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n.id)), 6000);
  }

  useEffect(() => {
    puxar();
    const t = setInterval(puxar, 20000);
    return () => clearInterval(t);
  }, []);

  async function abrir() {
    const novo = !aberto;
    setAberto(novo);
    if (novo && naoLidas > 0) {
      setNaoLidas(0);
      setItens((l) => l.map((i) => ({ ...i, lida: true })));
      try { await fetch("/api/notificacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "ler" }) }); } catch {}
    }
  }

  return (
    <>
      <div className="notif-wrap">
        <button type="button" className="tb-btn notif-bell" onClick={abrir} aria-label="Notificações" aria-expanded={aberto}>
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {naoLidas > 0 && <span className="notif-badge">{naoLidas > 9 ? "9+" : naoLidas}</span>}
        </button>

        {aberto && (
          <>
            <div className="notif-backdrop" onClick={() => setAberto(false)} />
            <div className="notif-painel" role="dialog">
              <div className="notif-cab"><b>Novidades</b><button type="button" onClick={() => setAberto(false)} aria-label="Fechar"><Icon name="x" size={16} /></button></div>
              {perm !== "granted" && (
                <button type="button" className="notif-ativar" onClick={ativarNotif}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
                  Ativar notificações {perm === "denied" ? "(bloqueado no navegador)" : "e permitir alertas"}
                </button>
              )}
              <div className="notif-lista">
                {itens.length === 0 ? (
                  <div className="notif-vazio">Sem novidades ainda. Conforme a base cresce, os marcos aparecem aqui.</div>
                ) : (
                  itens.map((n) => (
                    <div className={"notif-item" + (n.comemora ? " festa" : "")} key={n.id}>
                      <span className="ni-ic"><Icon name={ICONE[n.tipo] || "star"} size={16} /></span>
                      <div className="ni-txt"><b>{n.titulo}</b>{n.texto && <span>{n.texto}</span>}</div>
                      <span className="ni-quando">{quando(n.criado_em)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="toast-stack" aria-live="polite">
        {toasts.map((n) => (
          <div className={"toastn" + (n.comemora ? " festa" : "")} key={n.id}>
            {n.comemora && <span className="confete" aria-hidden="true">{Array.from({ length: 8 }).map((_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</span>}
            <span className="tn-ic"><Icon name={ICONE[n.tipo] || "star"} size={18} /></span>
            <div className="tn-txt"><b>{n.titulo}</b>{n.texto && <span>{n.texto}</span>}</div>
          </div>
        ))}
      </div>
    </>
  );
}
