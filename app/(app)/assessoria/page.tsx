import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import Icon from "../../components/Icon";
import AssessoriaCliente from "./AssessoriaCliente";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];

export default function AssessoriaPage() {
  const s = getSessao();
  if (!s) redirect("/login");
  if (!PERFIS_OK.includes(s.perfil)) redirect("/");

  const gabinete = s.escopoCandidato || s.nome || "Gabinete";

  return (
    <>
      <h1 className="page-title">
        <Icon name="megaphone" /> Assessoria de Imprensa
      </h1>
      <p className="page-sub">
        Comunicação orientada, mapa de riscos e a sala de gestão de crise: antecipe polêmicas e responda com uma só voz.
      </p>
      <AssessoriaCliente gabinete={gabinete} />
    </>
  );
}
