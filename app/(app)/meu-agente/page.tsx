import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import Icon from "../../components/Icon";
import CandidatoTabs from "../inbox/CandidatoTabs";
import MeuAgenteCliente from "./MeuAgenteCliente";

export const dynamic = "force-dynamic";

const PERMITIDOS = ["ADMIN", "COORDENACAO", "CANDIDATO"];

export default function MeuAgentePage() {
  const sessao = getSessao()!;
  if (!PERMITIDOS.includes(sessao.perfil)) redirect("/");

  return (
    <>
      <h1 className="page-title">
        <Icon name="bot" /> Meu Agente · WhatsApp
      </h1>
      <p className="page-sub">
        Seu assistente de IA no WhatsApp · status, ligar/desligar e ajustar a persona
      </p>
      {sessao.perfil === "CANDIDATO" && <CandidatoTabs />}
      <MeuAgenteCliente />
    </>
  );
}
