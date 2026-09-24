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
        <Icon name="cpu" /> Tecnologia
      </h1>
      <p className="page-sub">
        Financeiro da operação (investimento, custo dos disparos e saldo) e o discurso do candidato. O planejamento dos envios agora fica em Disparos.
      </p>
      <TecnologiaCliente />
    </>
  );
}
