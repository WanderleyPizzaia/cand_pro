"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "../../components/Icon";

type Agente = {
  id: number;
  candidato: string;
  instancia: string | null;
  provedor: string;
  pronto: boolean;
};
type Template = {
  nome: string;
  idioma: string;
  status: string;
  corpo: string;
  variaveis: number;
};
type Campanha = {
  id: number;
  titulo: string | null;
  agente_nome: string | null;
  total: number;
  enviados: number;
  falhas: number;
  status: string;
  filtro_cidade: string | null;
  filtro_categoria: string | null;
  criado_fmt: string;
};

export default function CampanhasCliente({
  agentes,
  cidades,
  categorias,
}: {
  agentes: Agente[];
  cidades: string[];
  categorias: string[];
}) {
  const [titulo, setTitulo] = useState("");
  const [agenteId, setAgenteId] = useState<string>(
    agentes.find((a) => a.pronto)?.id?.toString() ?? ""
  );
  const [templates, setTemplates] = useState<Template[]>([]);
  const [template, setTemplate] = useState("");
  const [erroTpl, setErroTpl] = useState("");
  const [cidade, setCidade] = useState("");
  const [categoria, setCategoria] = useState("");
  const [listaId, setListaId] = useState("");
  const [listas, setListas] = useState<
    { id: number; nome: string; agente_id: number; membros: number; com_whatsapp: number }[]
  >([]);
  const [mensagem, setMensagem] = useState("");
  const [previa, setPrevia] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);
  const [hist, setHist] = useState<Campanha[]>([]);
  // Rastreamento por campanha (entregue/lido/respondeu) vindo do monitor.
  const [track, setTrack] = useState<Record<number, { enviadosReal: number; entregues: number; lidos: number; responderam: number }>>({});

  const carregarHist = useCallback(async () => {
    const r = await fetch("/api/campanhas", { cache: "no-store" });
    if (r.ok) setHist(await r.json());
    // Puxa os contadores de entrega/leitura/resposta do monitor e indexa por id.
    try {
      const rm = await fetch("/api/disparos/monitor", { cache: "no-store" });
      if (rm.ok) {
        const d = await rm.json();
        const mapa: Record<number, { enviadosReal: number; entregues: number; lidos: number; responderam: number }> = {};
        for (const c of d.campanhas || [])
          mapa[c.id] = {
            enviadosReal: Number(c.out_real) || 0,
            entregues: Number(c.entregues) || 0,
            lidos: Number(c.lidos) || 0,
            responderam: Number(c.responderam) || 0,
          };
        setTrack(mapa);
      }
    } catch {}
  }, []);

  useEffect(() => {
    carregarHist();
  }, [carregarHist]);

  // Listas de disparo (segmentos importados) do número selecionado.
  useEffect(() => {
    fetch("/api/listas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setListas(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);
  // Ao trocar de número, zera a lista escolhida (listas são por número).
  useEffect(() => {
    setListaId("");
  }, [agenteId]);
  const listasDoAgente = listas.filter((l) => String(l.agente_id) === agenteId);
  const listaSel = listas.find((l) => String(l.id) === listaId);

  // Enquanto houver campanha enfileirada (envio via n8n em segundo plano),
  // atualiza a lista periodicamente para refletir o progresso do callback.
  const temEnfileirada = hist.some((c) => c.status === "enfileirada");
  useEffect(() => {
    if (!temEnfileirada) return;
    const t = setInterval(carregarHist, 5000);
    return () => clearInterval(t);
  }, [temEnfileirada, carregarHist]);

  const agenteSel = agentes.find((a) => String(a.id) === agenteId);
  const ehMeta = agenteSel?.provedor === "meta";
  const tplSel = templates.find((t) => t.nome === template);

  // Número oficial (Meta): carrega os templates aprovados da WABA.
  useEffect(() => {
    setTemplate("");
    setErroTpl("");
    setTemplates([]);
    if (!ehMeta || !agenteId) return;
    let ativo = true;
    fetch(`/api/campanhas?templates=${agenteId}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!ativo) return;
        if (!r.ok) setErroTpl(d.erro || "Não foi possível listar os templates.");
        else setTemplates(Array.isArray(d) ? d : []);
      })
      .catch(() => ativo && setErroTpl("Não foi possível listar os templates."));
    return () => {
      ativo = false;
    };
  }, [agenteId, ehMeta]);

  // Atualiza a prévia de destinatários quando muda o filtro. Se uma lista está
  // selecionada, o público é a lista (usa o nº de contatos com WhatsApp dela).
  useEffect(() => {
    if (listaSel) {
      setPrevia(listaSel.com_whatsapp);
      return;
    }
    let ativo = true;
    fetch("/api/campanhas/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cidade, categoria, agente_id: agenteId }),
    })
      .then((r) => r.json())
      .then((d) => ativo && setPrevia(d.total ?? 0))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [cidade, categoria, listaId, agenteId]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!agenteId) return setMsg({ t: "err", x: "Escolha o número (agente)." });
    if (ehMeta && !template)
      return setMsg({ t: "err", x: "Escolha um template aprovado da Meta." });
    if (!ehMeta && !mensagem.trim())
      return setMsg({ t: "err", x: "Escreva a mensagem." });
    if (
      !confirm(
        `Disparar para ${previa ?? "?"} contato(s)? Esta ação envia mensagens reais.`
      )
    )
      return;

    setEnviando(true);
    // Continuação automática: só quando é LISTA (o servidor pula quem já recebeu
    // hoje, então cada lote manda gente nova). Sem lista, dispara 1 lote só.
    const podeContinuar = !!listaId;
    const MAX_LOTES = 30; // trava de segurança contra loop
    let totalOk = 0, totalFalha = 0, lote = 0;
    try {
      while (true) {
        lote++;
        const tituloLote = titulo ? (lote === 1 ? titulo : `${titulo} (lote ${lote})`) : "";
        const r = await fetch("/api/campanhas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: tituloLote,
            agente_id: agenteId,
            lista_id: listaId || undefined,
            cidade: listaId ? "" : cidade,
            categoria: listaId ? "" : categoria,
            mensagem,
            template,
            idioma: tplSel?.idioma || "pt_BR",
          }),
        });
        const d = await r.json().catch(() => ({} as any));

        if (r.status === 429) {
          // Cota diária esgotada: para e informa o que já foi.
          setMsg({ t: totalOk ? "ok" : "err", x: `${d.erro || "Cota diária esgotada."}${totalOk ? ` Enviados nesta sessão: ${totalOk}.` : ""}` });
          break;
        }
        if (!r.ok) {
          setMsg({ t: "err", x: d.erro || `Erro ao disparar (HTTP ${r.status}).${totalOk ? ` Já enviados: ${totalOk}.` : ""}` });
          break;
        }
        if (d.modo === "n8n" || d.enfileirada) {
          setMsg({ t: "ok", x: `Campanha enfileirada para ${d.total} contato(s). O envio acontece em segundo plano.` });
          carregarHist();
          break;
        }

        totalOk += d.enviados || 0;
        totalFalha += d.falhas || 0;
        carregarHist();

        // Continua enquanto: é lista, o lote encheu o teto (tem mais), houve
        // progresso real (evita loop na cauda que só falha) e dentro do limite.
        const temMais = podeContinuar && d.limitado && (d.enviados || 0) > 0 && lote < MAX_LOTES;
        if (temMais) {
          setMsg({ t: "ok", x: `Enviando em lotes… ${totalOk} enviados até agora (lote ${lote}). Mantenha esta aba aberta.` });
          await new Promise((res) => setTimeout(res, 1500)); // respira entre lotes (Meta)
          continue;
        }

        setMsg({
          t: "ok",
          x: lote > 1
            ? `Concluído: ${totalOk} enviados · ${totalFalha} falha(s) em ${lote} lote(s).`
            : `Campanha enviada: ${totalOk} ok · ${totalFalha} falha(s) de ${d.total}.`,
        });
        setTitulo("");
        setMensagem("");
        break;
      }
    } catch (err: any) {
      setMsg({ t: "err", x: `Não foi possível concluir o disparo (falha de conexão).${totalOk ? ` Já enviados: ${totalOk}.` : ""}` });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      {msg && <div className={`msg ${msg.t}`}>{msg.x}</div>}

      <form className="form-card" style={{ marginBottom: 24 }} onSubmit={enviar}>
        <div className="grid2">
          <div className="field">
            <label>Título (interno)</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="ex: Convite comício 20/07"
            />
          </div>
          <div className="field">
            <label>Enviar pelo número (agente)</label>
            <select value={agenteId} onChange={(e) => setAgenteId(e.target.value)}>
              <option value="">- escolha -</option>
              {agentes.map((a) => (
                <option key={a.id} value={a.id} disabled={!a.pronto}>
                  {a.candidato}
                  {a.provedor === "meta" ? " · oficial" : ""}
                  {a.pronto ? "" : " (não configurado)"}
                </option>
              ))}
            </select>
          </div>

          {/* Número oficial (Meta): disparo ativo só por template aprovado. */}
          {ehMeta && (
            <div className="field full">
              <label>Template aprovado (Meta)</label>
              <select value={template} onChange={(e) => setTemplate(e.target.value)}>
                <option value="">- escolha -</option>
                {templates.map((t) => (
                  <option key={`${t.nome}-${t.idioma}`} value={t.nome}>
                    {t.nome} ({t.idioma})
                  </option>
                ))}
              </select>
              {erroTpl ? (
                <small style={{ color: "var(--red)", fontSize: 12, marginTop: 4 }}>
                  {erroTpl}
                </small>
              ) : templates.length === 0 ? (
                <small style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                  Nenhum template aprovado nesta conta ainda. Crie e aprove no
                  Gerenciador da Meta.
                </small>
              ) : tplSel ? (
                <small style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                  {tplSel.corpo}
                </small>
              ) : null}
            </div>
          )}
          {listasDoAgente.length > 0 && (
            <div className="field full">
              <label>Lista de disparo (opcional)</label>
              <select value={listaId} onChange={(e) => setListaId(e.target.value)}>
                <option value="">— usar filtros de cidade/grupo —</option>
                {listasDoAgente.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome} · {l.com_whatsapp} c/ WhatsApp
                  </option>
                ))}
              </select>
              {listaSel && (
                <small style={{ color: "var(--muted)" }}>
                  Público = a lista "{listaSel.nome}". Cidade e grupo são ignorados.
                </small>
              )}
            </div>
          )}
          <div className="field">
            <label>Filtrar por cidade</label>
            <select value={cidade} onChange={(e) => setCidade(e.target.value)} disabled={!!listaId}>
              <option value="">Todas</option>
              {cidades.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Filtrar por grupo</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={!!listaId}>
              <option value="">Todos</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {(!ehMeta || (tplSel?.variaveis ?? 0) > 0) && (
            <div className="field full">
              <label>{ehMeta ? "Texto da variável do template" : "Mensagem"}</label>
              <textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Olá {primeiro_nome}! ..."
                style={{ minHeight: ehMeta ? 70 : 120 }}
              />
              <small style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                Personalize com <code>{"{nome}"}</code>,{" "}
                <code>{"{primeiro_nome}"}</code> e <code>{"{cidade}"}</code>.
              </small>
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 16,
            flexWrap: "wrap",
          }}
        >
          <span className="tag" style={{ fontSize: 13 }}>
            {previa ?? "…"} destinatário(s) com WhatsApp
          </span>
          <button type="submit" className="btn btn-primary" disabled={enviando} style={{ flex: "none" }}>
            {enviando ? "Disparando…" : <><Icon name="megaphone" size={16} /> Disparar campanha</>}
          </button>
        </div>
      </form>

      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Campanhas anteriores</h3>
      <div className="table-wrap mob-cards">
        {hist.length === 0 ? (
          <div className="empty">Nenhuma campanha ainda.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Título</th>
                <th>Número</th>
                <th>Filtro</th>
                <th>Status</th>
                <th>Enviados</th>
                <th>Falhas</th>
                <th>Entregues</th>
                <th>Lidos</th>
                <th>Responderam</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((c) => (
                <tr key={c.id}>
                  <td data-label="Quando" style={{ color: "var(--muted)", fontSize: 12.5 }}>{c.criado_fmt}</td>
                  <td data-label="Título" style={{ fontWeight: 600 }}>{c.titulo || "-"}</td>
                  <td data-label="Número">{c.agente_nome || "-"}</td>
                  <td data-label="Filtro" style={{ fontSize: 12.5 }}>
                    {[c.filtro_cidade, c.filtro_categoria].filter(Boolean).join(" · ") || "Todos"}
                  </td>
                  <td data-label="Status" style={{ fontSize: 12.5 }}>
                    {c.status === "enfileirada" ? (
                      <span className="tag" style={{ color: "var(--yellow)" }}>enviando…</span>
                    ) : c.status === "erro" ? (
                      <span className="tag" style={{ color: "var(--red)" }}>erro</span>
                    ) : (
                      <span className="tag" style={{ color: "var(--green)" }}>enviada</span>
                    )}
                  </td>
                  <td data-label="Enviados" style={{ color: "var(--green)", fontWeight: 700 }}>{Math.max(c.enviados || 0, track[c.id]?.enviadosReal ?? 0)}</td>
                  <td data-label="Falhas" style={{ color: c.falhas ? "var(--red)" : "var(--muted)" }}>{c.falhas}</td>
                  <td data-label="Entregues" style={{ fontVariantNumeric: "tabular-nums" }}>{track[c.id]?.entregues ?? "—"}</td>
                  <td data-label="Lidos" style={{ fontVariantNumeric: "tabular-nums", color: "var(--blue)" }}>{track[c.id]?.lidos ?? "—"}</td>
                  <td data-label="Responderam" style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{track[c.id]?.responderam ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
