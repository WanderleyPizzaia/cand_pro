"use client";

import { useCallback, useEffect, useState } from "react";
import CopyLink from "./CopyLink";

type Estado = {
  conectado: boolean;
  usuario: string | null;
  conta_id: string | null;
  ativo: boolean;
  conversas: number;
  repasse_token: string | null;
};

// Conta do Instagram do candidato: conecta pelo token, liga/desliga a IA no
// Direct e (admin) mostra como o n8n repassa os eventos da conta de teste.
export default function InstagramAgente({ agenteId }: { agenteId: number }) {
  const [d, setD] = useState<Estado | null>(null);
  const [token, setToken] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/instagram/conta?agente=${agenteId}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setD(j);
    else setMsg({ t: "err", x: j.erro || "Não deu para carregar." });
  }, [agenteId]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function acao(corpo: Record<string, unknown>, ok: string) {
    setOcupado(true);
    setMsg(null);
    try {
      const r = await fetch("/api/instagram/conta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agente_id: agenteId, ...corpo }),
      });
      const j = await r.json().catch(() => ({}));
      setMsg(r.ok ? { t: "ok", x: ok } : { t: "err", x: j.erro || "Algo deu errado." });
      if (r.ok) {
        setToken("");
        await carregar();
      }
    } finally {
      setOcupado(false);
    }
  }

  if (!d)
    return (
      <div className="bloco-agente">
        <div className="bloco-titulo">Instagram (Direct)</div>
        {msg ? <div className="msg err">{msg.x}</div> : <p className="hint">Carregando…</p>}
      </div>
    );

  return (
    <div className="bloco-agente ig-bloco">
      {!d.conectado ? (
        <>
          <div className="ferramenta-txt">
            <b>Instagram (Direct)</b>
            <small>
              Cole o token de acesso da conta profissional (começa com <code>IG</code>). Ele fica guardado no
              servidor e não aparece mais na tela. A conta entra desligada: a IA só responde depois que você ligar.
            </small>
          </div>
          <div className="ig-conectar">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="IGAA…"
              aria-label="Token de acesso do Instagram"
              autoComplete="off"
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={ocupado || token.trim().length < 20}
              onClick={() => acao({ acao: "conectar", token }, "Conta conectada.")}
            >
              {ocupado ? "Conectando…" : "Conectar"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="galeria-topo">
            <div className="ferramenta-txt">
              <b>
                Instagram {d.usuario ? `@${d.usuario}` : ""} <span className="muted">· conta {d.conta_id}</span>
              </b>
              <small>
                {d.ativo
                  ? "Ligado: a IA responde no Direct com a mesma persona, treino e galeria deste número."
                  : "Desligado: as mensagens do Direct só aparecem no Atendimento, sem resposta automática."}
                {d.conversas ? ` · ${d.conversas} conversa(s) recebida(s)` : ""}
              </small>
            </div>
            <button
              type="button"
              className={`switch ${d.ativo ? "on" : ""}`}
              disabled={ocupado}
              onClick={() => acao({ acao: "ligar", ativo: !d.ativo }, d.ativo ? "IA desligada no Direct." : "IA ligada no Direct.")}
              aria-label="IA responde no Direct do Instagram"
              aria-pressed={d.ativo}
            >
              <span className="dot" />
            </button>
          </div>

          {d.repasse_token && (
            <details className="ig-repasse">
              <summary>Teste pelo n8n (repasse só desta conta)</summary>
              <ol className="hint">
                <li>
                  No fluxo do Instagram no n8n, logo depois de <b>Responder 200 à Meta</b>, ponha um <b>IF</b>:{" "}
                  <code>{"{{ $json.body.entry[0].id }}"}</code> é igual a <code>{d.conta_id}</code>.
                </li>
                <li>
                  <b>Verdadeiro</b> → <b>HTTP Request</b> POST para o endereço abaixo, com o corpo em JSON{" "}
                  <code>{"{{ JSON.stringify($json.body) }}"}</code>. <b>Falso</b> → segue o fluxo de hoje.
                </li>
                <li>As outras contas continuam no n8n. Para desfazer, é só tirar o IF.</li>
              </ol>
              <CopyLink path={`/api/instagram/webhook?token=${encodeURIComponent(d.repasse_token)}`} />
            </details>
          )}

          <button
            type="button"
            className="btn-link perigo"
            disabled={ocupado}
            onClick={() => {
              if (confirm("Desconectar o Instagram deste número? A IA para de responder no Direct."))
                acao({ acao: "desconectar" }, "Instagram desconectado.");
            }}
          >
            Desconectar
          </button>
        </>
      )}
      {msg && <div className={`msg ${msg.t === "ok" ? "ok" : "err"}`}>{msg.x}</div>}
    </div>
  );
}
