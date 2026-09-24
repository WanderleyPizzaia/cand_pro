"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import CountUp from "../../../components/CountUp";

type Ponto = {
  cidade: string;
  regiao: string | null;
  lat: number;
  lng: number;
  total: number;
};
type RankItem = {
  id: number;
  nome: string;
  perfil: string;
  total: number;
  cidades: number;
};
type Dados = {
  pontos: Ponto[];
  ranking: RankItem[];
  resumo: {
    totalLiderancas: number;
    totalLideresAtivos: number;
    totalCidades: number;
  };
};

const ROTULO: Record<string, string> = {
  ADMIN: "Administrador",
  MARKETING: "Marketing",
  COORDENACAO: "Coordenação",
  CANDIDATO: "Candidato",
  LIDER: "Líder",
};

// Mesma lógica do Mapa de votos, em violeta para distinguir lideranças de
// contatos: quanto mais lideranças, mais clara e intensa a bolha.
function cor(total: number, max: number): string {
  const r = max > 0 ? total / max : 0;
  if (r > 0.66) return "#d6c9fb";
  if (r > 0.33) return "#b4a0f8";
  if (r > 0.1) return "#8f7ad6";
  return "#6b5aa6";
}

export default function MapaLiderancasCliente() {
  const [d, setD] = useState<Dados | null>(null);
  const [vivo, setVivo] = useState(true);

  // Tempo real: busca inicial + atualização a cada 15s (pausa com aba oculta).
  useEffect(() => {
    let ativo = true;
    const buscar = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden")
        return;
      try {
        const r = await fetch("/api/lideranca", { cache: "no-store" });
        if (!r.ok) return;
        const novo = (await r.json()) as Dados;
        if (ativo) {
          setD(novo);
          setVivo(true);
        }
      } catch {
        if (ativo) setVivo(false);
      }
    };
    buscar();
    const id = setInterval(buscar, 15000);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, []);

  const pontos = d?.pontos ?? [];
  const ranking = d?.ranking ?? [];
  const max = pontos.reduce((m, p) => Math.max(m, p.total), 0);
  const maxRank = Math.max(1, ...ranking.map((r) => r.total));

  return (
    <div className="map-shell">
      <div>
        <div className="map-panel" style={{ marginBottom: 16 }}>
          <h3>Resumo</h3>
          <div className="rank-item">
            <span>Lideranças cadastradas</span>
            <span className="n">
              <CountUp value={d?.resumo.totalLiderancas ?? 0} />
            </span>
          </div>
          <div className="rank-item">
            <span>Líderes ativos (acesso)</span>
            <span className="n">
              <CountUp value={d?.resumo.totalLideresAtivos ?? 0} />
            </span>
          </div>
          <div className="rank-item">
            <span>Cidades com liderança</span>
            <span className="n">
              <CountUp value={d?.resumo.totalCidades ?? 0} />
            </span>
          </div>
        </div>

        <div className="map-panel">
          <h3>Ranking de captação · ao vivo</h3>
          {ranking.length > 0 ? (
            ranking.map((l, i) => (
              <div key={l.id} className="rank-item rank-bar">
                <div className="rank-info">
                  <span className="rank-pos">{i + 1}º</span>
                  <span className="rank-nome">{l.nome}</span>
                  <span className="tag">{ROTULO[l.perfil] ?? l.perfil}</span>
                </div>
                <span className="n" title={`${l.cidades} cidade(s)`}>
                  <CountUp value={l.total} />
                </span>
                <div
                  className="rank-fill"
                  style={{ width: `${(l.total / maxRank) * 100}%` }}
                />
              </div>
            ))
          ) : (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              Sem cadastros ainda.
            </div>
          )}
        </div>

        <div className={`live-badge${vivo ? "" : " off"}`}>
          <span className="live-dot" />
          {vivo ? "Atualizando em tempo real (a cada 15s)" : "Reconectando…"}
        </div>
      </div>

      <div className="map-box">
        <MapContainer center={[-22.5, -48.5]} zoom={7} scrollWheelZoom={true}>
          {/* Basemap claro SEM chave (CartoDB passou a exigir API key). */}
          <TileLayer
            attribution="Tiles &copy; Esri &mdash; &copy; OpenStreetMap"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          />
          {pontos.map((p) => (
            <CircleMarker
              key={p.cidade}
              center={[p.lat, p.lng]}
              radius={8 + Math.sqrt(p.total) * 5}
              pathOptions={{
                color: cor(p.total, max),
                fillColor: cor(p.total, max),
                fillOpacity: 0.45,
                weight: 1.5,
              }}
            >
              <Tooltip>
                <b>{p.cidade}</b>
                <br />
                {p.total} liderança(s)
                <br />
                <span className="tt-sub">{p.regiao || "-"}</span>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
