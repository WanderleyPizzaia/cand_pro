"use client";

import dynamic from "next/dynamic";
import MapaTabs from "../MapaTabs";
import Icon from "../../../components/Icon";

const MapaLiderancasCliente = dynamic(() => import("./MapaLiderancasCliente"), {
  ssr: false,
  loading: () => (
    <div className="empty" style={{ height: 400 }}>
      Carregando mapa...
    </div>
  ),
});

export default function MapaLiderancasPage() {
  return (
    <>
      <h1 className="page-title">
        <Icon name="star" /> Mapa de Lideranças
      </h1>
      <p className="page-sub">
        Onde estão as lideranças · ranking de captação por líder
      </p>
      <MapaTabs />
      <MapaLiderancasCliente />
    </>
  );
}
