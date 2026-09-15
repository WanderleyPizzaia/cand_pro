"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CountUp from "../../components/CountUp";

type Agente = {
  id: number;
  candidato: string;
  foto?: string | null;
  instancia: string | null;
  telefone: string | null;
  persona: string | null;
  ativo: number;
  tem_ia?: boolean;
  usuario_id?: number | null;
  provedor?: string;
  meta_phone_id?: string | null;
  meta_waba_id?: string | null;
  tem_meta_token?: boolean;
  totalMensagens: number;
  recebidasHoje: number;
  quota_diaria?: number | null;
  quotaEfetiva?: number;
  disparosHoje?: number;
};

// Traduz o estado bruto da Evolution para algo amigável.
function rotuloEstado(state: string | null): { txt: string; cls: string } {
  switch (state) {
    case "open":
      return { txt: "Conectado", cls: "on" };
    case "connecting":
      return { txt: "Conectando…", cls: "wait" };
    case "close":
      return { txt: "Desconectado", cls: "off" };
    case "sem-instancia":
      return { txt: "Sem WhatsApp", cls: "off" };
    default:
      return { txt: "Verificando…", cls: "wait" };
  }
}

export default function AgenteCard({ agente }: { agente: Agente }) {
  const router = useRouter();
  const [ativo, setAtivo] = useState(!!agente.ativo);
  const [state, setState] = useState<string | null>(null);
  const [ajustes, setAjustes] = useState(false);
  const [f, setF] = useState({
    instancia: agente.instancia || "",
    telefone: agente.telefone || "",
    persona: agente.persona || "",
  });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  // Chave de IA por agente (write-only: nunca volta do servidor).
  const [iaKey, setIaKey] = useState("");
  const [temIa, setTemIa] = useState(!!agente.tem_ia);
  // Provedor de WhatsApp: 'evolution' (não-oficial) ou 'meta' (Cloud API oficial).
  const [provedor, setProvedor] = useState(agente.provedor || "evolution");
  const [metaPhoneId, setMetaPhoneId] = useState(agente.meta_phone_id || "");
  const [metaWabaId, setMetaWabaId] = useState(agente.meta_waba_id || "");
  const [metaToken, setMetaToken] = useState(""); // write-only
  const [temMetaToken, setTemMetaToken] = useState(!!agente.tem_meta_token);
  // Cota diária de disparo (vazio = padrão do provedor).
  const [quota, setQuota] = useState(agente.quota_diaria != null ? String(agente.quota_diaria) : "");
  const ehMeta = provedor === "meta";
  // Dono (usuário-candidato): quem é o login do candidato deste número. Vincular
  // deixa o candidato conectar/gerenciar o próprio WhatsApp e reforça o isolamento.
  const [dono, setDono] = useState<string>(agente.usuario_id != null ? String(agente.usuario_id) : "");
  const [usuarios, setUsuarios] = useState<{ id: number; nome: string; perfil: string }[]>([]);
  useEffect(() => {
    if (!ajustes || usuarios.length) return;
    fetch("/api/usuarios")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.usuarios && setUsuarios(d.usuarios))
      .catch(() => {});
  }, [ajustes, usuarios.length]);
  // Teste de conexão Meta (validarNumeroMeta): feedback plug-and-play.
  const [testando, setTestando] = useState(false);
  const [testeMsg, setTesteMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);

  async function testarMeta() {
    setTestando(true);
    setTesteMsg(null);
    try {
      const r = await fetch("/api/agentes/validar-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: agente.id,
          meta_phone_id: metaPhoneId,
          ...(metaToken.trim() ? { meta_token: metaToken.trim() } : {}),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setTesteMsg({ t: "err", x: d.erro || "Falha na conexão." });
      else
        setTesteMsg({
          t: "ok",
          x: `Conectado ✓ ${d.numero ? "Número: " + d.numero : ""}`,
        });
    } catch (e: any) {
      setTesteMsg({ t: "err", x: e.message });
    } finally {
      setTestando(false);
    }
  }

  // ---- Manutenção: sincronizar / limpar / excluir instância ----
  const [dias, setDias] = useState(30);
  const [sincronizando, setSincronizando] = useState(false);
  const [manutMsg, setManutMsg] = useState("");

  // ---- QR / conexão ----
  const [qrAberto, setQrAberto] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [pairing, setPairing] = useState<string | null>(null);
  const [conectando, setConectando] = useState(false);
  const [conectadoOk, setConectadoOk] = useState(false);
  const [erroQr, setErroQr] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Estado de conexão em tempo real (a cada 15s, pausa com a aba oculta).
  // Só faz sentido no provedor Evolution (Meta não tem QR/conexão).
  const buscarStatus = useCallback(async () => {
    if (provedor === "meta") return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden")
      return;
    try {
      const r = await fetch(`/api/agentes/conectar?id=${agente.id}`, {
        cache: "no-store",
      });
      if (r.ok) setState((await r.json()).state ?? null);
    } catch {
      /* silencioso */
    }
  }, [agente.id, provedor]);

  useEffect(() => {
    buscarStatus();
    const id = setInterval(buscarStatus, 15000);
    return () => clearInterval(id);
  }, [buscarStatus]);

  function set(k: string, v: string) {
    setF((s) => ({ ...s, [k]: v }));
  }

  async function salvar() {
    setSalvando(true);
    setMsg("");
    // Segredos (ia_key/meta_token) só vão quando digitados (write-only).
    const body: any = {
      id: agente.id,
      ...f,
      ativo,
      provedor,
      meta_phone_id: metaPhoneId,
      meta_waba_id: metaWabaId,
      usuario_id: dono ? Number(dono) : 0, // 0 => desvincular
    };
    if (iaKey.trim()) body.ia_key = iaKey.trim();
    if (metaToken.trim()) body.meta_token = metaToken.trim();
    body.quota_diaria = quota.trim() ? Number(quota) : 0; // 0 => volta ao padrão do provedor
    const r = await fetch("/api/agentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSalvando(false);
    if (r.ok) {
      setMsg("Salvo!");
      if (iaKey.trim()) {
        setTemIa(true);
        setIaKey("");
      }
      if (metaToken.trim()) {
        setTemMetaToken(true);
        setMetaToken("");
      }
      router.refresh();
      setTimeout(() => setMsg(""), 1500);
    } else {
      setMsg("Erro ao salvar");
    }
  }

  async function toggleAtivo() {
    const novo = !ativo;
    // Guarda: ligar sem chave de IA própria faz a resposta falhar silenciosamente.
    if (novo && !temIa) {
      const ok = confirm(
        `${agente.candidato} está SEM chave de IA própria.\n\n` +
          `Sem ela o agente pode não conseguir responder (usa a chave global). ` +
          `Recomendado: abra "Ajustes" e cadastre a chave de IA deste candidato antes de ligar.\n\n` +
          `Ligar mesmo assim?`
      );
      if (!ok) return;
    }
    setAtivo(novo);
    await fetch("/api/agentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: agente.id, ...f, ativo: novo }),
    });
    router.refresh();
  }

  // Sincroniza o histórico de mensagens dos últimos N dias (idempotente).
  async function sincronizar() {
    setSincronizando(true);
    setManutMsg("Sincronizando…");
    try {
      const r = await fetch("/api/agentes/sincronizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agente.id, dias }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setManutMsg(d.erro || "Falha na sincronização.");
      else {
        setManutMsg(
          `${d.inseridas} nova(s) mensagem(ns) importada(s) (${dias} dias).`
        );
        router.refresh();
      }
    } catch (e: any) {
      setManutMsg(e.message);
    } finally {
      setSincronizando(false);
    }
  }

  // Apaga o histórico de mensagens deste agente no sistema (não toca no WhatsApp).
  async function limparMensagens() {
    if (
      !confirm(
        `Apagar TODAS as mensagens de ${agente.candidato} no sistema? Isto não afeta o WhatsApp do contato.`
      )
    )
      return;
    setManutMsg("Limpando…");
    const r = await fetch("/api/agentes/limpar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: agente.id }),
    });
    const d = await r.json().catch(() => ({}));
    setManutMsg(r.ok ? `${d.apagadas} mensagem(ns) apagada(s).` : d.erro || "Falha.");
    if (r.ok) router.refresh();
  }

  // Exclui a instância de WhatsApp na Evolution (desconecta de vez).
  async function excluirInstancia() {
    if (
      !confirm(
        `Excluir a instância de WhatsApp de ${agente.candidato}? O número será desconectado e o agente desligado.`
      )
    )
      return;
    setManutMsg("Excluindo instância…");
    const r = await fetch(`/api/agentes/conectar?id=${agente.id}`, {
      method: "DELETE",
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setManutMsg("Instância excluída.");
      setState("sem-instancia");
      router.refresh();
    } else {
      setManutMsg(d.erro || "Falha ao excluir.");
    }
  }

  // Abre o modal e pede o QR (cria a instância se ainda não existir).
  async function conectar() {
    setQrAberto(true);
    setQr(null);
    setPairing(null);
    setErroQr("");
    setConectadoOk(false);
    setConectando(true);
    try {
      const r = await fetch("/api/agentes/conectar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agente.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErroQr(d.erro || "Falha ao gerar o QR.");
      } else {
        setQr(d.qr || null);
        setPairing(d.pairingCode || null);
        iniciarPolling();
      }
    } catch (e: any) {
      setErroQr(e.message);
    } finally {
      setConectando(false);
    }
  }

  // Enquanto o modal está aberto, verifica a cada 3s se conectou.
  // Ao conectar: fecha o QR e JÁ BAIXA o histórico para a plataforma
  // (plug-and-play: conectou -> conversas aparecem sozinhas).
  function iniciarPolling() {
    pararPolling();
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/agentes/conectar?id=${agente.id}`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const st = (await r.json()).state ?? null;
        setState(st);
        if (st === "open") {
          pararPolling();
          setConectadoOk(true);
          setTimeout(async () => {
            fecharQr();
            setManutMsg("Conectado! Baixando as conversas…");
            await sincronizar(); // importa o histórico automaticamente
            router.refresh();
          }, 1200);
        }
      } catch {
        /* silencioso */
      }
    }, 3000);
  }

  function pararPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function fecharQr() {
    pararPolling();
    setQrAberto(false);
  }

  useEffect(() => () => pararPolling(), []);

  // No provedor Meta não há QR/estado: badge fixo pelas credenciais.
  const metaPronto = !!temMetaToken && !!metaPhoneId;
  const est = ehMeta
    ? metaPronto
      ? { txt: "Oficial (Meta)", cls: "on" }
      : { txt: "Meta: faltam credenciais", cls: "off" }
    : rotuloEstado(state);
  const conectado = ehMeta ? metaPronto : state === "open";

  return (
    <div className="agente-card">
      <div className="agente-head">
        <div className="agente-id">
          {/* Foto do WhatsApp do próprio número, com o status na bolinha (padrão WhatsApp) */}
          <span className="agente-foto-wrap">
            {agente.foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="agente-foto" src={agente.foto} alt={agente.candidato} />
            ) : (
              <span className="agente-foto agente-foto-ini">
                {agente.candidato
                  .split(/\s+/)
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
            )}
            <span className={`conn-dot conn-dot-foto ${est.cls}`} title={est.txt} />
          </span>
          <div>
            <div className="agente-nome">{agente.candidato}</div>
            <div className="agente-sub">{est.txt}</div>
          </div>
        </div>
        <button
          className={`switch ${ativo ? "on" : ""}`}
          onClick={toggleAtivo}
          title={ativo ? "Agente ligado" : "Agente desligado"}
        >
          <span className="dot" />
        </button>
      </div>

      <div className="agente-metrics">
        <div>
          <b><CountUp value={agente.totalMensagens} /></b> mensagens
        </div>
        <div>
          <b><CountUp value={agente.recebidasHoje} /></b> hoje
        </div>
        <div title="Disparos de campanha usados hoje / cota diária">
          <b><CountUp value={agente.disparosHoje ?? 0} /></b>
          <span style={{ color: "var(--muted)" }}> / {(agente.quotaEfetiva ?? 0).toLocaleString("pt-BR")}</span> disparos
        </div>
      </div>

      <div className="agente-acoes">
        {/* QR/conexão só no Evolution. Meta é oficial (sem QR). */}
        {!ehMeta && !conectado && (
          <button className="btn btn-primary btn-sm" onClick={conectar}>
            {state === "sem-instancia" ? "Conectar WhatsApp" : "Reconectar"}
          </button>
        )}
        {ehMeta && (
          <span className="tag-oficial" title="WhatsApp Cloud API oficial da Meta">
            ✓ API Oficial
          </span>
        )}
        {!temIa && (
          <span
            className="tag-alerta"
            title="Sem chave de IA própria: cadastre em Ajustes para o agente responder"
          >
            ⚠ Sem chave de IA
          </span>
        )}
        <button className="btn-link" onClick={() => setAjustes((v) => !v)}>
          {ajustes ? "Fechar ajustes ▲" : "Ajustes ▼"}
        </button>
        {!ehMeta && agente.instancia && (
          <button
            className="btn-link perigo"
            onClick={excluirInstancia}
            title="Excluir a instância de WhatsApp"
          >
            Excluir
          </button>
        )}
      </div>

      {ajustes && (
        <div className="agente-form">
          <div className="field">
            <label>Provedor de WhatsApp</label>
            <select value={provedor} onChange={(e) => setProvedor(e.target.value)}>
              <option value="evolution">Evolution (não-oficial)</option>
              <option value="meta">Oficial (Meta Cloud API)</option>
            </select>
          </div>

          <div className="field">
            <label>
              Usuário dono (candidato){" "}
              <span className="muted">- login que gerencia este número</span>
            </label>
            <select value={dono} onChange={(e) => setDono(e.target.value)}>
              <option value="">Sem dono (só ADMIN/coordenação)</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} ({u.perfil})
                </option>
              ))}
            </select>
          </div>

          {!ehMeta && (
            <div className="field">
              <label>Nome da instância (Evolution)</label>
              <input
                placeholder="ex: gabinete-principal"
                value={f.instancia}
                onChange={(e) => set("instancia", e.target.value)}
              />
            </div>
          )}

          {ehMeta && (
            <>
              <div className="field">
                <label>Phone Number ID (Meta)</label>
                <input
                  placeholder="ex: 1122879850918950"
                  value={metaPhoneId}
                  onChange={(e) => setMetaPhoneId(e.target.value)}
                />
              </div>
              <div className="field">
                <label>WhatsApp Business Account ID (WABA)</label>
                <input
                  placeholder="ex: 2722776404789442"
                  value={metaWabaId}
                  onChange={(e) => setMetaWabaId(e.target.value)}
                />
              </div>
              <div className="field">
                <label>
                  Token de acesso (Meta){" "}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: temMetaToken ? "var(--green)" : "var(--yellow)",
                    }}
                  >
                    {temMetaToken ? "✓ configurado" : "○ não configurado"}
                  </span>
                </label>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={temMetaToken ? "•••••••• (deixe vazio para manter)" : "cole o token permanente (System User)"}
                  value={metaToken}
                  onChange={(e) => setMetaToken(e.target.value)}
                />
                <small style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                  Token da Cloud API oficial. É salvo e nunca exibido de volta.
                </small>
              </div>
              <div className="field">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={testarMeta}
                  disabled={testando || !metaPhoneId.trim() || (!metaToken.trim() && !temMetaToken)}
                  title="Verifica as credenciais na Meta e mostra o número conectado"
                >
                  {testando ? "Testando…" : "Testar conexão"}
                </button>
                {testeMsg && (
                  <div
                    className={`msg ${testeMsg.t === "ok" ? "ok" : "err"}`}
                    style={{ marginTop: 8 }}
                  >
                    {testeMsg.x}
                  </div>
                )}
                <small style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                  Dica: se digitou um token novo, ele é usado no teste; senão, testa o
                  token já salvo.
                </small>
              </div>
            </>
          )}

          <div className="field">
            <label>Número de WhatsApp</label>
            <input
              placeholder="5511999998888"
              value={f.telefone}
              onChange={(e) => set("telefone", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Persona (instruções da IA)</label>
            <textarea
              rows={5}
              value={f.persona}
              onChange={(e) => set("persona", e.target.value)}
            />
          </div>
          <div className="field">
            <label>
              Chave de IA deste candidato{" "}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: temIa ? "var(--green)" : "var(--yellow)",
                }}
              >
                {temIa ? "✓ configurada" : "○ usando a global"}
              </span>
            </label>
            <input
              type="password"
              autoComplete="off"
              placeholder={temIa ? "•••••••• (deixe vazio para manter)" : "cole a chave de IA do candidato"}
              value={iaKey}
              onChange={(e) => setIaKey(e.target.value)}
            />
            <small style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
              Cada candidato tem a sua chave (custo individual). É salva e nunca
              exibida de volta.
            </small>
          </div>
          <div className="field">
            <label>
              Cota diária de disparo{" "}
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>
                (vazio = padrão {ehMeta ? "Meta" : "Evolution"})
              </span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              placeholder={ehMeta ? "ex: 20000 (tier do número)" : "ex: 3000 (teto de segurança)"}
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
            />
            <small style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
              Máximo de disparos por dia deste número. Meta = tier oficial; Evolution é
              não-oficial (maior risco de bloqueio), use com cautela.
            </small>
          </div>
          <div className="actions">
            {msg && (
              <span style={{ color: "var(--green)", alignSelf: "center" }}>
                {msg}
              </span>
            )}
            <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>

          {/* Manutenção da instância Evolution (não se aplica ao provedor Meta) */}
          {!ehMeta && (
          <div className="agente-manut">
            <div className="manut-titulo">Manutenção do WhatsApp</div>

            <div className="manut-linha">
              <label>Sincronizar últimas</label>
              <select
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
                disabled={sincronizando}
              >
                <option value={7}>7 dias</option>
                <option value={15}>15 dias</option>
                <option value={30}>30 dias</option>
                <option value={60}>60 dias</option>
                <option value={90}>90 dias</option>
              </select>
              <button
                className="btn btn-sm"
                onClick={sincronizar}
                disabled={sincronizando || !agente.instancia}
                title={
                  agente.instancia
                    ? "Importa o histórico sem duplicar"
                    : "Conecte um WhatsApp primeiro"
                }
              >
                {sincronizando ? "Sincronizando…" : "Sincronizar"}
              </button>
            </div>

            <div className="manut-acoes">
              <button className="btn-link" onClick={limparMensagens}>
                Limpar mensagens
              </button>
              <button
                className="btn-link perigo"
                onClick={excluirInstancia}
                disabled={!agente.instancia}
              >
                Excluir instância
              </button>
            </div>

            {manutMsg && <div className="manut-msg">{manutMsg}</div>}
          </div>
          )}
        </div>
      )}

      {qrAberto && (
        <div className="qr-overlay" onClick={fecharQr}>
          <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
            <button className="qr-fechar" onClick={fecharQr} aria-label="Fechar">
              ✕
            </button>
            {conectadoOk ? (
              <div className="demo-ok">
                <div className="demo-ok-ico">✓</div>
                <h3>Conectado!</h3>
                <p>Baixando as conversas para a plataforma…</p>
              </div>
            ) : (
              <>
                <h3>Conectar {agente.candidato}</h3>
                <p className="qr-instr">
                  Abra o WhatsApp no celular → <b>Aparelhos conectados</b> →{" "}
                  <b>Conectar um aparelho</b> e aponte para o código.
                </p>

                {conectando && <div className="qr-loading">Gerando código…</div>}

                {erroQr && <div className="msg err">{erroQr}</div>}

                {qr && (
                  <div className="qr-img-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt="QR Code de conexão" className="qr-img" />
                  </div>
                )}

                {pairing && (
                  <div className="qr-pairing">
                    Ou use o código: <b>{pairing}</b>
                  </div>
                )}

                <div className="qr-status">
                  <span className={`conn-dot ${est.cls}`} /> {est.txt}
                  <span className="qr-aguardando"> · aguardando leitura…</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
