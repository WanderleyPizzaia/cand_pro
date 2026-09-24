"use client";

import dynamic from "next/dynamic";
import Icon from "../../components/Icon";

// Leaflet so funciona no browser -> carrega sem SSR
const MapaCliente = dynamic(() => import("./MapaCliente"), {
  ssr: false,
  loading: () => (
    <div className="empty" style={{ height: 400 }}>
      Carregando mapa...
    </div>
  ),
});

export default function MapaPage() {
  return (
    <>
      <h1 className="page-title">
        <Icon name="map" /> Mapa de Votos
      </h1>
      <p className="page-sub">
        Geomapeamento de cadastros por cidade · densidade por cor e tamanho
      </p>
      <MapaCliente />
    </>
  );
}
