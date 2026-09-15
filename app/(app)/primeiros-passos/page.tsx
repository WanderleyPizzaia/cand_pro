import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import Icon from "../../components/Icon";
import PrimeirosPassosCliente from "./PrimeirosPassosCliente";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];

export default function PrimeirosPassosPage() {
  const s = getSessao();
  if (!s) redirect("/login");
  if (!PERFIS_OK.includes(s.perfil)) redirect("/");

  const primeiro = s.nome.split(" ")[0];
  return (
    <>
      <h1 className="page-title">
        <Icon name="check" /> Configure seu gabinete
      </h1>
      <p className="page-sub">
        {primeiro}, preencha os passos abaixo para o sistema trabalhar no seu tom e com a sua estratégia. Você e a equipe podem fazer isso a qualquer momento.
      </p>
      <PrimeirosPassosCliente />
    </>
  );
}
