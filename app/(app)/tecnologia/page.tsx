import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import Icon from "../../components/Icon";
import TecnologiaCliente from "./TecnologiaCliente";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];

export default function TecnologiaPage() {
  const s = getSessao();
  if (!s) redirect("/login");
  if (!PERFIS_OK.includes(s.perfil)) redirect("/");

  return (
    <>
      <h1 className="page-title">
        <Icon name="settings" /> Tecnologia
      </h1>
      <p className="page-sub">
        Planejamento, discurso e o financeiro da operação: investimento, custos dos disparos e saldo, com transparência.
      </p>
      <TecnologiaCliente />
    </>
  );
}
