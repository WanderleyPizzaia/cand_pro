import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import Icon from "../../components/Icon";
import PautasCliente from "./PautasCliente";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];

export default function PautasPage() {
  const s = getSessao();
  if (!s) redirect("/login");
  if (!PERFIS_OK.includes(s.perfil)) redirect("/");
  return (
    <>
      <h1 className="page-title">
        <Icon name="inbox" /> Acolhimento de Pauta
      </h1>
      <p className="page-sub">
        As demandas, denúncias e sugestões dos eleitores, organizadas por tema e por bairro. É daqui que sai a agenda do gabinete e as pautas para a assessoria.
      </p>
      <PautasCliente />
    </>
  );
}
