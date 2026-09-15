"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  Polyline,
  useMap,
} from "react-leaflet";
import CountUp from "../../components/CountUp";
import spContornoRaw from "@/data/sp-contorno.json";

const SP_CONTORNO = spContornoRaw as [number, number][];

// Base do candidato + pontos de interesse/culturais de Suzano (referências a
// confirmar). Ficam sempre destacados e interligados no mapa.
const SUZANO: [number, number] = [-23.5426, -46.3110];
const POIS_SUZANO: { nome: string; tipo: string; lat: number; lng: number }[] = [
  { nome: "Parque Max Feffer", tipo: "Cultura e lazer", lat: -23.5389, lng: -46.3075 },
  { nome: "Centro · Prefeitura", tipo: "Institucional", lat: -23.5443, lng: -46.3112 },
  { nome: "Estação Suzano (CPTM)", tipo: "Mobilidade", lat: -23.5426, lng: -46.3086 },
  { nome: "Parque de Eventos", tipo: "Cultura popular", lat: -23.5352, lng: -46.3202 },
];
// Enquadramento travado no Estado de São Paulo.
const SP_BOUNDS: [[number, number], [number, number]] = [[-25.6, -53.3], [-19.6, -44.0]];

// Normaliza p/ casar cidade digitada sem depender de acento/maiúscula.
const DIACRIT = new RegExp(
  "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
  "g"
);
const normCid = (s: string) =>
  (s || "").normalize("NFD").replace(DIACRIT, "").trim().toLowerCase();

type PessoaCidade = {
  id: number;
  nome: string;
  whatsapp: string | null;
  foto: string | null;
  agente_id: number | null;
  candidato: string | null;
};

type Ponto = {
  cidade: string;
  regiao: string | null;
  lat: number;
  lng: number;
  total: number;
};
type PautaPonto = {
  cidade: string | null;
  bairro: string | null;
  lat: number;
  lng: number;
  total: number;
  tema_top: string | null;
};
const TEMA_ROTULO: Record<string, string> = {
  saneamento: "Saneamento", saude: "Saúde", seguranca: "Segurança", educacao: "Educação",
  transporte: "Transporte", moradia: "Moradia", emprego: "Emprego", assistencia: "Assistência", outros: "Outros",
};
type Grupo = { grupo: string; total: number };
type AgenteOpc = { id: number; candidato: string; total: number };
type Resumo = {
  totalCadastros: number;
  totalCidades: number;
  totalLideres: number;
  totalDemandas: number;
  confirmados: number;
  estimados: number;
  porGrupo: Grupo[];
  topCidades: Ponto[];
};

// Voa/centraliza o mapa na cidade destacada (busca). Volta a enquadrar SP
// quando a busca é limpa. Componente-filho do MapContainer (usa useMap).
function FocarCidade({ alvo }: { alvo: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (alvo) map.flyTo(alvo, 11, { duration: 0.8 });
    else map.flyTo([-22.5, -48.5], 7, { duration: 0.6 });
  }, [alvo, map]);
  return null;
}

// Corrige o "mapa em branco" quando o container é montado dentro de um grid/flex
// (tamanho 0 na inicialização do Leaflet). Recalcula o tamanho após montar.
function InvalidarTamanho() {
  const map = useMap();
  useEffect(() => {
    const revalidar = () => map.invalidateSize();
    const t1 = setTimeout(revalidar, 120);
    const t2 = setTimeout(revalidar, 600);
    window.addEventListener("resize", revalidar);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", revalidar); };
  }, [map]);
  return null;
}

// Tons de azul por densidade (claro -> escuro).
function cor(total: number, max: number): string {
  const r = max > 0 ? total / max : 0;
  if (r > 0.66) return "#0f458f";
  if (r > 0.33) return "#1657b8";
  if (r > 0.1) return "#2c86e8";
  return "#7db4ef";
}

export default function MapaCliente() {
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [pautas, setPautas] = useState<PautaPonto[]>([]);
  const [mostrarPautas, setMostrarPautas] = useState(true);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [cidades, setCidades] = useState<string[]>([]);
  const [agentes, setAgentes] = useState<AgenteOpc[]>([]);
  const [cidadeFiltro, setCidadeFiltro] = useState("");
  const [agenteFiltro, setAgenteFiltro] = useState("");
  const [ehGlobal, setEhGlobal] = useState(false); // só ADMIN cruza candidatos

  // Painel "quem está cadastrado nesta bolinha"
  const [cidadeAberta, setCidadeAberta] = useState<string | null>(null);
  const [pessoasCidade, setPessoasCidade] = useState<PessoaCidade[]>([]);
  const [carregandoPessoas, setCarregandoPessoas] = useState(false);

  async function abrirCidade(cidade: string) {
    setCidadeAberta(cidade);
    setCarregandoPessoas(true);
    const qs = new URLSearchParams({ cidade });
    if (agenteFiltro) qs.set("agente", agenteFiltro);
    try {
      const r = await fetch(`/api/mapa/pessoas?${qs}`, { cache: "no-store" });
      setPessoasCidade(r.ok ? await r.json() : []);
    } finally {
      setCarregandoPessoas(false);
    }
  }

  useEffect(() => {
    const qs = new URLSearchParams();
    if (cidadeFiltro) qs.set("cidade", cidadeFiltro);
    if (agenteFiltro) qs.set("agente", agenteFiltro);
    fetch(`/api/mapa?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        // Blindagem: resposta lenta/errada nunca zera nem quebra a tela.
        if (Array.isArray(d?.pontos)) setPontos(d.pontos);
        if (Array.isArray(d?.pautas)) setPautas(d.pautas);
        if (d?.resumo) setResumo(d.resumo);
        if (Array.isArray(d?.cidades)) setCidades(d.cidades);
        if (Array.isArray(d?.agentes)) setAgentes(d.agentes);
        if ("ehGlobal" in (d || {})) setEhGlobal(!!d.ehGlobal);
      })
      .catch(() => {});
  }, [cidadeFiltro, agenteFiltro]);

  const max = pontos.reduce((m, p) => Math.max(m, p.total), 0);
  // Ranking de cidades: agrega os pontos por cidade (podem vir vários pontos
  // por cidade, ex.: bairros/DDD) e ordena por total. Alimenta a lista clicável.
  const ranking = (() => {
    const acc = new Map<string, number>();
    for (const p of pontos) {
      const c = (p.cidade || "").trim();
      if (!c) continue;
      acc.set(c, (acc.get(c) || 0) + p.total);
    }
    return Array.from(acc, ([cidade, total]) => ({ cidade, total })).sort(
      (a, b) => b.total - a.total
    );
  })();
  const rankMax = ranking.length ? ranking[0].total : 0;
  const confirmados = resumo?.confirmados ?? 0;
  const estimados = resumo?.estimados ?? 0;
  const baseGeo = confirmados + estimados;
  const pctConfirmado = baseGeo > 0 ? Math.round((confirmados / baseGeo) * 100) : 0;

  // Ponto da cidade buscada (p/ centralizar o mapa). Casa sem acento/maiúscula.
  const pontoAlvo = cidadeFiltro
    ? pontos.find((p) => normCid(p.cidade) === normCid(cidadeFiltro))
    : undefined;
  const alvo: [number, number] | null = pontoAlvo
    ? [pontoAlvo.lat, pontoAlvo.lng]
    : null;

  return (
    <div className="map-shell">
      <div>
        {/* Cadastrados na cidade clicada */}
        {cidadeAberta && (
          <div className="map-panel" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Em {cidadeAberta}</h3>
              <button className="btn-link" style={{ padding: 0 }} onClick={() => setCidadeAberta(null)}>
                fechar ✕
              </button>
            </div>
            {carregandoPessoas ? (
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>Carregando…</div>
            ) : pessoasCidade.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>Ninguém neste filtro.</div>
            ) : (
              <div className="cidade-lista">
                {pessoasCidade.map((p) => {
                  const nome = p.nome && !/^\d+$/.test(p.nome.trim()) ? p.nome : "Sem nome";
                  const num = (p.whatsapp || "").replace(/\D/g, "");
                  return (
                    <div key={p.id} className="cidade-pessoa">
                      <span className="cp-foto">
                        {p.foto ? (
                          <img src={p.foto} alt={nome} referrerPolicy="no-referrer" />
                        ) : (
                          <span>{nome.charAt(0).toUpperCase()}</span>
                        )}
                      </span>
                      <span className="cp-nome">{nome}</span>
                      <span className="cp-acoes">
                        {num && (
                          <Link
                            href={`/inbox?contato=${num}${p.agente_id ? `&agente=${p.agente_id}` : ""}`}
                            title="Abrir conversa"
                            className="cp-conversa"
                          >
                            ›
                          </Link>
                        )}
                        <Link href={`/cadastro?id=${p.id}`} title="Abrir cadastro" className="cp-abrir">
                          abrir
                        </Link>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Filtros */}
        <div className="map-panel" style={{ marginBottom: 16 }}>
          <h3>Filtros</h3>

          {/* Seletor de candidato: só ADMIN cruza "Todos os candidatos". O
              candidato/equipe fica restrito ao próprio gabinete (nunca vê o do
              outro). Com um único número, o seletor nem aparece. */}
          {(ehGlobal || agentes.length > 1) && (
            <>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                }}
              >
                {ehGlobal ? "Candidato" : "Número"}
              </label>
              <select
                value={agenteFiltro}
                onChange={(e) => {
                  setAgenteFiltro(e.target.value);
                  setCidadeFiltro(""); // troca de candidato zera a cidade
                }}
                style={{ marginTop: 6, marginBottom: 14 }}
              >
                <option value="">
                  {ehGlobal ? "Todos os candidatos" : "Todo o meu gabinete"}
                </option>
                {agentes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.candidato} ({a.total})
                  </option>
                ))}
              </select>
            </>
          )}

          <label
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Cidade
          </label>
          <input
            list="lista-cidades"
            value={cidadeFiltro}
            onChange={(e) => {
              const v = e.target.value;
              // Se casar com uma cidade conhecida, usa o nome oficial (com acento)
              // p/ o filtro/indicadores baterem; senão mantém o que foi digitado.
              const oficial = cidades.find((c) => normCid(c) === normCid(v));
              setCidadeFiltro(oficial || v);
            }}
            placeholder="Digite a cidade…"
            style={{ marginTop: 6 }}
          />
          <datalist id="lista-cidades">
            {cidades.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {cidadeFiltro && (
            <button
              type="button"
              className="btn-link"
              style={{ padding: 0, marginTop: 6, fontSize: 12, alignSelf: "flex-start" }}
              onClick={() => setCidadeFiltro("")}
            >
              limpar cidade ✕
            </button>
          )}
        </div>

        {/* Resumo */}
        <div className="map-panel" style={{ marginBottom: 16 }}>
          <h3>Resumo {cidadeFiltro && `· ${cidadeFiltro}`}</h3>
          <div className="rank-item">
            <span>Total de cadastros</span>
            <span className="n"><CountUp value={resumo?.totalCadastros ?? 0} /></span>
          </div>
          <div className="rank-item">
            <span>{cidadeFiltro ? "Cidade" : "Cidades no mapa"}</span>
            <span className="n"><CountUp value={resumo?.totalCidades ?? 0} /></span>
          </div>
          <div className="rank-item">
            <span>Lideranças</span>
            <span className="n"><CountUp value={resumo?.totalLideres ?? 0} /></span>
          </div>
          <div className="rank-item">
            <span>Total de demandas</span>
            <span className="n"><CountUp value={resumo?.totalDemandas ?? 0} /></span>
          </div>
          <div className="rank-item" title="Posição no mapa pela cidade que a pessoa informou (preciso).">
            <span>📍 Confirmados por cidade</span>
            <span className="n" style={{ color: "var(--green)" }}>
              <CountUp value={confirmados} />
            </span>
          </div>
          <div className="rank-item" title="Sem cidade informada: posição estimada pela região do DDD do telefone (aproximado).">
            <span>≈ Estimados por região (DDD)</span>
            <span className="n" style={{ color: "var(--yellow)" }}>
              <CountUp value={estimados} />
            </span>
          </div>
          {baseGeo > 0 && (
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                lineHeight: 1.4,
                color: "var(--muted)",
                borderTop: "1px solid var(--border)",
                paddingTop: 8,
              }}
            >
              <b>{pctConfirmado}%</b> dos pontos vêm da <b>cidade informada</b> (preciso).
              Os <b>estimados</b> não têm cidade e caem no polo do <b>DDD</b> do telefone —
              use como referência de região, não de cidade exata.
            </div>
          )}
        </div>

        {/* Pessoas por grupo */}
        <div className="map-panel" style={{ marginBottom: 16 }}>
          <h3>Pessoas por grupo</h3>
          {resumo && resumo.porGrupo.length > 0 ? (
            resumo.porGrupo.map((g) => (
              <div className="rank-item" key={g.grupo}>
                <span>{g.grupo}</span>
                <span className="n">{g.total}</span>
              </div>
            ))
          ) : (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              Sem dados ainda.
            </div>
          )}
        </div>

        {/* Ranking de cidades — lista completa, ordenada por nº de cadastros.
            Clique numa cidade filtra/centraliza o mapa nela. */}
        <div className="map-panel">
          <h3>
            Ranking de cidades{" "}
            <span style={{ color: "var(--muted)", fontWeight: 600, fontSize: 12 }}>
              ({ranking.length})
            </span>
          </h3>
          {cidadeFiltro && (
            <button
              type="button"
              className="btn-link"
              style={{ padding: 0, marginBottom: 8, fontSize: 12 }}
              onClick={() => setCidadeFiltro("")}
            >
              ← ver todas
            </button>
          )}
          {ranking.length > 0 ? (
            <div className="rank-cidades">
              {ranking.map((c, i) => {
                const ativa = normCid(c.cidade) === normCid(cidadeFiltro);
                const pct = rankMax > 0 ? Math.round((c.total / rankMax) * 100) : 0;
                return (
                  <button
                    type="button"
                    key={c.cidade}
                    className={`rank-cidade${ativa ? " ativa" : ""}`}
                    onClick={() => setCidadeFiltro(ativa ? "" : c.cidade)}
                    title={`Filtrar o mapa em ${c.cidade}`}
                  >
                    <span className="rc-pos">{i + 1}</span>
                    <span className="rc-nome">{c.cidade}</span>
                    <span className="rc-bar">
                      <i style={{ width: `${Math.max(pct, 4)}%` }} />
                    </span>
                    <span className="rc-total">{c.total}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              Sem dados ainda.
            </div>
          )}
        </div>
      </div>

      <div className="map-col">
      <div className="map-camadas">
        <label className="cam-toggle">
          <input type="checkbox" checked={mostrarPautas} onChange={(e) => setMostrarPautas(e.target.checked)} />
          Mostrar pautas ({pautas.reduce((s, p) => s + p.total, 0)})
        </label>
        <span className="cam-legenda">
          <i className="cam-dot azul" /> Contatos
          <i className="cam-dot ambar" /> Pautas
        </span>
      </div>

      <div className="map-box">
        <MapContainer
          center={[-22.5, -48.5]}
          zoom={7}
          minZoom={6}
          scrollWheelZoom={true}
          maxBounds={SP_BOUNDS}
          maxBoundsViscosity={0.8}
        >
          {/* Basemap claro SEM chave de API (a CartoDB passou a exigir key).
              Esri "Light Gray Canvas" é gratuito e mantém o visual claro. */}
          <TileLayer
            attribution="Tiles &copy; Esri &mdash; &copy; OpenStreetMap"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            maxZoom={16}
          />
          {/* Recalcula o tamanho (corrige mapa em branco/espremido em grid/flex). */}
          <InvalidarTamanho />
          {/* Centraliza/dá zoom na cidade buscada (ou reenquadra SP ao limpar). */}
          <FocarCidade alvo={alvo} />
          {/* Contorno do estado de São Paulo (área de atuação) */}
          <Polyline
            positions={SP_CONTORNO}
            pathOptions={{ color: "#0f458f", weight: 2, opacity: 0.7, fill: false, dashArray: "5 5" }}
          />

          {/* Suzano: base do candidato — interliga com os pontos culturais/interesse */}
          {POIS_SUZANO.map((poi, i) => (
            <Polyline
              key={"lig-" + i}
              positions={[SUZANO, [poi.lat, poi.lng]]}
              pathOptions={{ color: "#0b9247", weight: 1.5, opacity: 0.5, dashArray: "3 5" }}
            />
          ))}
          {POIS_SUZANO.map((poi, i) => (
            <CircleMarker
              key={"poi-" + i}
              center={[poi.lat, poi.lng]}
              radius={7}
              pathOptions={{ color: "#0b7a3b", fillColor: "#0b9247", fillOpacity: 0.85, weight: 1.5 }}
            >
              <Tooltip>
                <b>{poi.nome}</b>
                <br />
                <span style={{ color: "#0b9247" }}>{poi.tipo}</span>
                <br />
                <span style={{ color: "#888" }}>Suzano · ponto de interesse</span>
              </Tooltip>
            </CircleMarker>
          ))}
          <CircleMarker
            center={SUZANO}
            radius={11}
            pathOptions={{ color: "#FBBA00", fillColor: "#ED1C24", fillOpacity: 0.9, weight: 3 }}
          >
            <Tooltip permanent direction="top" offset={[0, -8]} className="tt-suzano">
              <b>SUZANO</b> · nossa base
            </Tooltip>
          </CircleMarker>

          {pontos.map((p) => {
            const destacada = !!cidadeFiltro && normCid(p.cidade) === normCid(cidadeFiltro);
            return (
              <CircleMarker
                key={p.cidade}
                center={[p.lat, p.lng]}
                radius={8 + Math.sqrt(p.total) * 5}
                eventHandlers={{ click: () => abrirCidade(p.cidade) }}
                pathOptions={{
                  color: destacada ? "#0b2f63" : cor(p.total, max),
                  fillColor: cor(p.total, max),
                  fillOpacity: cidadeFiltro && !destacada ? 0.2 : 0.6,
                  weight: destacada ? 3 : 1.5,
                }}
              >
                <Tooltip>
                  <b>{p.cidade}</b>
                  <br />
                  {p.total} cadastro(s)
                  <br />
                  <span style={{ color: "#888" }}>{p.regiao || "-"}</span>
                  <br />
                  <span style={{ color: "var(--accent)" }}>clique para ver quem está aqui</span>
                </Tooltip>
              </CircleMarker>
            );
          })}
          {mostrarPautas &&
            pautas.map((p, i) => (
              <CircleMarker
                key={"pauta-" + i}
                center={[p.lat, p.lng]}
                radius={6 + Math.sqrt(p.total) * 4}
                pathOptions={{ color: "#B85C00", fillColor: "#E8820C", fillOpacity: 0.75, weight: 1.5 }}
              >
                <Tooltip>
                  <b>{p.total} pauta(s)</b>
                  <br />
                  {p.tema_top ? TEMA_ROTULO[p.tema_top] || p.tema_top : "Diversos"}
                  <br />
                  <span style={{ color: "#888" }}>
                    {[p.bairro, p.cidade].filter(Boolean).join(" · ") || "-"}
                  </span>
                </Tooltip>
              </CircleMarker>
            ))}
        </MapContainer>
      </div>
      </div>
    </div>
  );
}
