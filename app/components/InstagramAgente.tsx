"use client";

import { useCallback, useEffect, useState } from "react";
import CopyLink from "./CopyLink";

type Estado = {
  conectado: boolean;
  usuario: string | null;
  conta_id: string | null;
  ativo: boolean;
  conversas: number;
  token_renovado: string | null;
  token_expira: string | null;
  token_erro: string | null;
  repasse_token: string | null;
  verify_token: string | null;
  direto: { segredo_ok: boolean; repasse_ok: boolean } | null;
};

function Copiar({ valor }: { valor: string }) {
  const [ok, setOk] = useState(false);
  return (
    <span className="ig-copiar">
      <code>{valor}</code>
      <button
        type="button"
        className="btn-link"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(valor);
          } catch {}
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        }}
      >
        {ok ? "Copiado" : "Copiar"}
      </button>
    </span>
  );
}

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
              Cole o token de acesso de longa duração (60 dias, começa com <code>IG</code>) gerado no app da Meta.
              Ele fica guardado no servidor, não aparece mais na tela e é renovado sozinho. A conta entra
              desligada: a IA só responde depois que você ligar.
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

          {d.token_erro ? (
            <div className="msg err">
              Não consegui renovar o token: {d.token_erro}. Gere um novo no app da Meta, desconecte e conecte de novo.
            </div>
          ) : (
            <small className="hint">
              Token renovado sozinho a cada 7 dias{d.token_renovado ? ` · última renovação ${d.token_renovado}` : ""}
              {d.token_expira ? ` · vale até ${d.token_expira}` : ""}. A renovação roda junto do agendador (cron-job.org).
            </small>
          )}

          {d.verify_token && d.direto && (
            <details className="ig-repasse">
              <summary>Sem n8n: webhook do app apontando para o sistema</summary>
              <ol className="hint">
                <li>
                  Em <b>Configurações</b>: a <b>Chave secreta do app do Instagram</b>{" "}
                  {d.direto.segredo_ok ? <span className="txt-ok">(ok)</span> : <span className="txt-erro">(falta)</span>} e o
                  endereço do n8n para <b>repassar</b> as contas que ainda não estão aqui{" "}
                  {d.direto.repasse_ok ? <span className="txt-ok">(ok)</span> : <span className="txt-erro">(falta)</span>}.
                  Sem o repasse, as outras contas do app param de ser respondidas.
                </li>
                <li>
                  No app da Meta → Instagram → <b>Webhooks</b>, assine o campo <b>messages</b> com esta URL de retorno:
                  <CopyLink path="/api/instagram/webhook" />
                  e este token de verificação: <Copiar valor={d.verify_token} />
                </li>
                <li>
                  Comentários desta conta deixam de ir ao n8n (ainda não são respondidos aqui). Para voltar atrás,
                  ponha de novo a URL do n8n no app da Meta.
                </li>
              </ol>
            </details>
          )}

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
