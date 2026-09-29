"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon";
import CountUp from "../../components/CountUp";
import CopyLink from "../../components/CopyLink";

type AgenteOpt = {
  id: number;
  candidato: string;
  telefone: string | null;
  provedor: string;
  pronto: boolean;
  quota: number;
  disparosHoje: number;
};

// (11) 95502-7666 a partir de 5511955027666
function fmtTel(t: string | null): string {
  const d = (t || "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length < 10) return t || "";
  const ddd = d.slice(0, 2);
  const num = d.slice(2);
  const meio = num.length > 8 ? num.slice(0, 5) : num.slice(0, 4);
  const fim = num.length > 8 ? num.slice(5) : num.slice(4);
  return `(${ddd}) ${meio}-${fim}`;
}
type Campanha = {
  id: number;
  titulo: string | null;
  status: string;
  total: number;
  enviados: number;
  falhas: number;
  criado_fmt: string;
  agendado_fmt: string | null;
  agente_nome: string | null;
  responsavel: string | null;
  out_real: number;
  entregues: number;
  aguardando: number;
  lidos: number;
  responderam: number;
  motivo: string | null;
  agendado: boolean;
};
type Resumo = { agendadas: number; enviados_total: number; campanhas_hoje: number };
// token só vem para o admin (monta a URL do cron-job.org).
type Agendador = { ultima: string | null; parado: boolean; token: string | null };

const SELO: Record<string, string> = {
  agendada: "atencao", pausada: "atencao", enviando: "ouro", enfileirada: "ouro",
  erro: "erro", expirada: "erro", cancelada: "",
};

function haQuanto(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "há menos de 1 min";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

export default function DisparosCliente({
  agentes,
  cidades,
  categorias,
}: {
  agentes: AgenteOpt[];
  cidades: string[];
  categorias: string[];
}) {
  const [agenteId, setAgenteId] = useState<string>(
    agentes.find((a) => a.pronto && a.provedor !== "meta")?.id?.toString() ?? ""
  );
  const [cidade, setCidade] = useState("");
  const [categoria, setCategoria] = useState("");
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [quantidade, setQuantidade] = useState<number>(100);
  const [quando, setQuando] = useState<"agora" | "agendar">("agora");
  const [agendadoPara, setAgendadoPara] = useState("");
  const [previa, setPrevia] = useState<number | null>(null);
  // Alvo do disparo: um GRUPO da base (cidade/categoria) ou um CONTATO específico.
  const [modo, setModo] = useState<"grupo" | "contato">("grupo");
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<
    { id: number; nome: string; whatsapp: string; cidade: string }[]
  >([]);
  const [contatoSel, setContatoSel] = useState<{ id: number; nome: string; whatsapp: string } | null>(null);
  const [buscando, setBuscando] = useState(false);
  // Sub-modo do envio pontual: contato já na BASE ou um número NOVO digitado.
  const [contatoModo, setContatoModo] = useState<"base" | "novo">("base");
  const [numeroNovo, setNumeroNovo] = useState("");
  const [nomeNovo, setNomeNovo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);

  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [agendador, setAgendador] = useState<Agendador | null>(null);

  const agente = agentes.find((a) => String(a.id) === agenteId);
  const ehMeta = agente?.provedor === "meta";
  const saldo = agente ? Math.max(0, agente.quota - agente.disparosHoje) : 0;
  // Agendado usa a cota do dia do envio (inteira), não o que sobrou hoje.
  const teto = quando === "agendar" ? agente?.quota ?? 0 : saldo;
  // Número novo válido? (normaliza p/ 55 + DDD + número → 12/13 dígitos)
  const digitos = numeroNovo.replace(/\D/g, "");
  const numeroNovoOk =
    digitos.length >= 12 || digitos.length === 10 || digitos.length === 11;
  const contatoPronto = contatoModo === "novo" ? numeroNovoOk : !!contatoSel;
  const alvo =
    modo === "contato" ? (contatoPronto ? 1 : 0) : Math.min(quantidade || 0, teto, previa ?? Infinity);

  // Busca de contato específico (por nome/número), com debounce.
  useEffect(() => {
    if (modo !== "contato" || contatoModo !== "base" || busca.trim().length < 2) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    let ativo = true;
    setBuscando(true);
    const t = setTimeout(() => {
      fetch("/api/campanhas/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ busca: busca.trim() }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!ativo) return;
          setResultados(d.contatos || []);
          setBuscando(false);
        })
        .catch(() => ativo && setBuscando(false));
    }, 300);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [busca, modo, contatoModo]);

  // Prévia de destinatários do grupo (cidade/categoria).
  useEffect(() => {
    let ativo = true;
    fetch("/api/campanhas/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cidade, categoria }),
    })
      .then((r) => r.json())
      .then((d) => ativo && setPrevia(d.total ?? 0))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [cidade, categoria]);

  // Monitoramento ao vivo.
  const carregar = useCallback(async () => {
    const r = await fetch("/api/disparos/monitor", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setCampanhas(d.campanhas || []);
      setResumo(d.resumo || null);
      setAgendador(d.agendador || null);
    }
  }, []);

  async function cancelar(c: Campanha) {
    if (!confirm(`Cancelar o disparo agendado${c.titulo ? ` "${c.titulo}"` : ""}? Quem ainda não recebeu não recebe mais.`)) return;
    const r = await fetch(`/api/campanhas?id=${c.id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? { t: "ok", x: "Disparo cancelado." } : { t: "err", x: d.erro || "Não deu para cancelar." });
    carregar();
  }
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 8000);
    return () => clearInterval(t);
  }, [carregar]);

  async function disparar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!agenteId) return setMsg({ t: "err", x: "Escolha o candidato/número." });
    if (ehMeta)
      return setMsg({ t: "err", x: "Número oficial (Meta) exige template aprovado. Use um número Evolution para texto livre." });
    if (!mensagem.trim()) return setMsg({ t: "err", x: "Escreva a mensagem." });
    if (modo === "contato") {
      if (contatoModo === "base" && !contatoSel)
        return setMsg({ t: "err", x: "Busque e selecione um contato da base." });
      if (contatoModo === "novo" && !numeroNovoOk)
        return setMsg({ t: "err", x: "Digite um número válido: +55 DDD NÚMERO." });
    }
    if (quando === "agendar" && !agendadoPara)
      return setMsg({ t: "err", x: "Defina a data/hora do agendamento." });
    const alvoTxt =
      modo === "contato"
        ? contatoModo === "novo"
          ? nomeNovo.trim() || `+${numeroNovo.replace(/\D/g, "")}`
          : contatoSel?.nome
        : `~${alvo} contato(s)`;
    const acao = quando === "agendar" ? `agendar para ${agendadoPara}` : `disparar agora`;
    if (!confirm(`Confirmar: ${acao} para ${alvoTxt} por ${agente?.candidato}?`)) return;

    setEnviando(true);
    try {
      const body: any =
        modo === "contato"
          ? contatoModo === "novo"
            ? { titulo, agente_id: agenteId, mensagem, numero: numeroNovo, contato_nome: nomeNovo, quantidade: 1 }
            : { titulo, agente_id: agenteId, mensagem, pessoa_id: contatoSel!.id, quantidade: 1 }
          : { titulo, agente_id: agenteId, cidade, categoria, mensagem, quantidade: quantidade || undefined };
      if (quando === "agendar") body.agendado_para = new Date(agendadoPara).toISOString();
      const r = await fetch("/api/campanhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) setMsg({ t: "err", x: d.erro || "Erro ao disparar." });
      else if (d.agendada)
        setMsg({ t: "ok", x: `Agendado para ${new Date(d.agendado_para).toLocaleString("pt-BR")} · ${d.total} contato(s).` });
      else if (d.modo === "n8n" || d.enfileirada)
        setMsg({ t: "ok", x: `Enfileirado para ${d.total} contato(s) — enviando com cadência. Acompanhe abaixo.` });
      else
        setMsg({ t: "ok", x: `Disparado: ${d.enviados} ok · ${d.falhas} falha(s) de ${d.total}.` });
      if (r.ok) {
        setTitulo("");
        setMensagem("");
        setContatoSel(null);
        setBusca("");
        setResultados([]);
        setNumeroNovo("");
        setNomeNovo("");
        carregar();
      }
    } finally {
      setEnviando(false);
    }
  }

  function taxa(n: number, base: number) {
    if (!base) return "—";
    return Math.round((n / base) * 100) + "%";
  }

  return (
    <div className="disp-grid">
      {/* ===== Planejamento ===== */}
      <form className="form-card disp-form" onSubmit={disparar}>
        <div className="disp-form-h"><Icon name="send" size={16} /> Novo disparo</div>
        {msg && <div className={`msg ${msg.t}`}>{msg.x}</div>}

        <fieldset className="passo">
        <legend><span className="passo-n">1</span> Quem envia</legend>
        <div className="field">
          <label htmlFor="disp-numero">Número do candidato</label>
          <select id="disp-numero" value={agenteId} onChange={(e) => setAgenteId(e.target.value)}>
            <option value="">Escolha o número…</option>
            {agentes.map((a) => (
              <option key={a.id} value={a.id} disabled={!a.pronto}>
                {a.candidato}
                {a.telefone ? " · " + fmtTel(a.telefone) : ""}
                {a.provedor === "meta" ? " · oficial" : ""}
                {a.pronto ? "" : " (não conectado)"}
              </option>
            ))}
          </select>
          {agente && (
            <small className={`hint${saldo > 0 ? "" : " erro"}`}>
              Cota de hoje: {agente.disparosHoje.toLocaleString("pt-BR")} de {agente.quota.toLocaleString("pt-BR")} usados · <b>{saldo.toLocaleString("pt-BR")}</b> restantes
            </small>
          )}
        </div>
        </fieldset>

        <fieldset className="passo">
        <legend><span className="passo-n">2</span> Para quem</legend>
        <div className="field">
          <div className="disp-quando" role="radiogroup" aria-label="Enviar para">
            <button type="button" role="radio" aria-checked={modo === "grupo"} className={`disp-tab${modo === "grupo" ? " ativo" : ""}`} onClick={() => setModo("grupo")}>Um grupo da base</button>
            <button type="button" role="radio" aria-checked={modo === "contato"} className={`disp-tab${modo === "contato" ? " ativo" : ""}`} onClick={() => setModo("contato")}>Uma pessoa</button>
          </div>
        </div>

        {modo === "grupo" ? (
          <>
            <div className="grid2">
              <div className="field">
                <label htmlFor="disp-cidade">Cidade</label>
                <select id="disp-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)}>
                  <option value="">Todas</option>
                  {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="disp-categoria">Categoria</label>
                <select id="disp-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  <option value="">Todas</option>
                  {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="disp-qtd">
                Quantidade <span className="muted">· alvo {alvo.toLocaleString("pt-BR")} · {previa ?? "…"} no grupo</span>
              </label>
              <input
                type="range"
                min={1}
                max={Math.max(1, Math.min(teto || 1, previa ?? 1))}
                value={Math.min(quantidade, Math.max(1, Math.min(teto || 1, previa ?? 1)))}
                onChange={(e) => setQuantidade(Number(e.target.value))}
              />
              <input
                id="disp-qtd"
                type="number"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(Number(e.target.value))}
              />
            </div>
          </>
        ) : (
          <div className="field">
            <div className="disp-quando">
              <button type="button" className={`disp-tab${contatoModo === "base" ? " ativo" : ""}`} onClick={() => setContatoModo("base")}>Buscar na base</button>
              <button type="button" className={`disp-tab${contatoModo === "novo" ? " ativo" : ""}`} onClick={() => setContatoModo("novo")}>Número novo</button>
            </div>

            {contatoModo === "base" ? (
              <>
                <label>Contato (nome ou número, já cadastrado)</label>
                {contatoSel ? (
                  <div className="disp-chip">
                    <span><b>{contatoSel.nome}</b> · {contatoSel.whatsapp}</span>
                    <button type="button" onClick={() => { setContatoSel(null); setBusca(""); }} aria-label="Trocar contato"><Icon name="x" size={14} /></button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (resultados[0]) { setContatoSel(resultados[0]); setResultados([]); } } }}
                      placeholder="Ex.: Maria, ou 5511…"
                    />
                    {buscando && <div className="disp-hint">Buscando…</div>}
                    {!buscando && busca.trim().length >= 2 && resultados.length === 0 && (
                      <div className="disp-hint">Nenhum contato. Tente o modo <b>Número novo</b>.</div>
                    )}
                    {resultados.length > 0 && (
                      <div className="disp-result">
                        {resultados.map((c) => (
                          <button type="button" key={c.id} className="disp-result-item" onClick={() => { setContatoSel(c); setResultados([]); }}>
                            <b>{c.nome || "(sem nome)"}</b>
                            <span className="muted">{c.whatsapp}{c.cidade ? ` · ${c.cidade}` : ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <label>Número (WhatsApp)</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={numeroNovo}
                  onChange={(e) => setNumeroNovo(e.target.value)}
                  placeholder="+55 11 98765-4321"
                  aria-invalid={!!numeroNovo && !numeroNovoOk}
                  className={numeroNovo && !numeroNovoOk ? "invalido" : undefined}
                />
                <input
                  type="text"
                  value={nomeNovo}
                  onChange={(e) => setNomeNovo(e.target.value)}
                  placeholder="Nome (opcional)"
                />
                <small className="hint">
                  Formato <b>+55 DDD número</b>. O contato é salvo na base (Cadastros) e o envio fica rastreado.
                </small>
              </>
            )}
          </div>
        )}

        </fieldset>

        <fieldset className="passo">
        <legend><span className="passo-n">3</span> Mensagem</legend>
        <div className="field">
          <label htmlFor="disp-msg" className="sr-only">Mensagem</label>
          <textarea
            id="disp-msg"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Olá {primeiro_nome}! ..."
            rows={5}
          />
          <small className="hint">
            Personalize com <code>{"{primeiro_nome}"}</code>, <code>{"{nome}"}</code> e <code>{"{cidade}"}</code>.
          </small>
        </div>
        </fieldset>

        <fieldset className="passo">
        <legend><span className="passo-n">4</span> Quando</legend>
        <div className="field">
          <div className="disp-quando" role="radiogroup" aria-label="Quando enviar">
            <button type="button" role="radio" aria-checked={quando === "agora"} className={`disp-tab${quando === "agora" ? " ativo" : ""}`} onClick={() => setQuando("agora")}>Enviar agora</button>
            <button type="button" role="radio" aria-checked={quando === "agendar"} className={`disp-tab${quando === "agendar" ? " ativo" : ""}`} onClick={() => setQuando("agendar")}>Agendar</button>
          </div>
          {quando === "agendar" && (
            <input type="datetime-local" aria-label="Data e hora do envio" value={agendadoPara} onChange={(e) => setAgendadoPara(e.target.value)} />
          )}
          {quando === "agendar" && agendador?.parado && (
            <div className="msg warn">
              O agendador não está rodando (última verificação: {haQuanto(agendador.ultima)}). Sem ele, o disparo
              agendado não sai.{" "}
              {agendador.token ? "Configure o cron-job.org no quadro \"Agendador automático\", abaixo." : "Peça ao administrador para ligar o agendador (cron-job.org)."}
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="disp-titulo">Nome interno <span className="muted">(opcional, para achar depois)</span></label>
          <input id="disp-titulo" type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Convite comício Campinas" />
        </div>
        </fieldset>

        <button type="submit" className="btn btn-primary" disabled={enviando}>
          {enviando ? "Processando…" : quando === "agendar" ? "Agendar disparo" : "Disparar agora"}
        </button>
      </form>

      {/* ===== Monitoramento ===== */}
      <div className="disp-mon">
        <div className="disp-cards">
          <div className="disp-card"><b><CountUp value={resumo?.campanhas_hoje ?? 0} /></b><span>campanhas hoje</span></div>
          <div className="disp-card"><b><CountUp value={resumo?.enviados_total ?? 0} /></b><span>enviados (total)</span></div>
          <div className="disp-card"><b><CountUp value={resumo?.agendadas ?? 0} /></b><span>agendadas</span></div>
        </div>

        {agendador?.token && (
          <details className="disp-agendador" open={agendador.parado}>
            <summary>
              <Icon name="clock" size={14} /> Agendador automático ·{" "}
              {agendador.parado ? <span className="txt-erro">parado</span> : <span className="txt-ok">rodando</span>}
              <span className="muted"> · última verificação {haQuanto(agendador.ultima)}</span>
            </summary>
            <p className="hint">
              Os disparos agendados saem quando o cron-job.org chama este endereço a cada minuto. No
              cron-job.org: <b>Create cronjob</b>, cole a URL, marque <b>Every minute</b> e salve. A URL tem
              uma senha: não compartilhe.
            </p>
            <CopyLink path={`/api/campanhas/agendador?token=${encodeURIComponent(agendador.token)}`} />
          </details>
        )}

        <div className="disp-mon-h">Monitoramento</div>
        <div className="table-wrap">
          {campanhas.length === 0 ? (
            <div className="empty">Nenhum disparo ainda.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Quando</th><th>Candidato</th><th>Responsável</th><th>Status</th>
                  <th>Enviados</th><th>Aguardando</th><th>Entregues</th><th>Lidos</th><th>Responderam</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Quando" className="muted">
                      {c.status === "agendada" ? (
                        <span className="com-icone"><Icon name="clock" size={13} /> {c.agendado_fmt}</span>
                      ) : (
                        c.criado_fmt
                      )}
                    </td>
                    <td data-label="Candidato">{c.agente_nome || "-"}</td>
                    <td data-label="Responsável">{c.responsavel || "-"}</td>
                    <td data-label="Status">
                      <span className={`selo ${SELO[c.status] ?? "ok"}`} title={c.motivo || undefined}>{c.status}</span>
                      {c.motivo && <small className="disp-motivo">{c.motivo}</small>}
                      {c.agendado && ["agendada", "pausada", "enviando"].includes(c.status) && (
                        <button type="button" className="btn-link perigo disp-cancelar" onClick={() => cancelar(c)}>
                          Cancelar
                        </button>
                      )}
                    </td>
                    <td data-label="Enviados" className="num forte">{Math.max(c.enviados || 0, c.out_real || 0)}/{c.total}</td>
                    <td data-label="Aguardando" title="Aceitas pela Meta, mas ainda não entregues no aparelho">
                      {c.aguardando ? <span className="txt-atencao">{c.aguardando}</span> : 0}
                    </td>
                    <td data-label="Entregues">{c.entregues} <span className="muted">({taxa(c.entregues, c.out_real)})</span></td>
                    <td data-label="Lidos">{c.lidos} <span className="muted">({taxa(c.lidos, c.out_real)})</span></td>
                    <td data-label="Responderam" className="txt-ok">
                      {c.responderam} <span className="muted">({taxa(c.responderam, c.out_real)})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
