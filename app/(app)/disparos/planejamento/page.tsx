import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import PlanejamentoDisparos from "../../tecnologia/PlanejamentoDisparos";

export const dynamic = "force-dynamic";

// Mesmo público que via o Planejamento dentro de Tecnologia.
const PERFIS_OK = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];

export default function PlanejamentoPage() {
  const s = getSessao();
  if (!s) redirect("/login");
  if (!PERFIS_OK.includes(s.perfil)) redirect("/");

  return (
    <>
      <h1 className="page-title">Planejamento de disparos</h1>
      <p className="page-sub">
        Régua de envios até a votação: quanto disparar em cada fase e o que a equipe faz em cada semana.
      </p>
      <PlanejamentoDisparos />
    </>
  );
}
