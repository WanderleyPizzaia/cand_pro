import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import Icon from "../../components/Icon";
import ComunidadesCliente from "./ComunidadesCliente";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];

export default function ComunidadesPage() {
  const s = getSessao();
  if (!s) redirect("/login");
  if (!PERFIS_OK.includes(s.perfil)) redirect("/");

  return (
    <>
      <h1 className="page-title">
        <Icon name="users" /> Comunidades
      </h1>
      <p className="page-sub">
        Organize a base em grupos (sociedade civil, sociedade pública, parceiros, eleitores) e planeje os disparos por comunidade.
      </p>
      <ComunidadesCliente />
    </>
  );
}
