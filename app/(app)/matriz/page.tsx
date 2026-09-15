import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import Icon from "../../components/Icon";
import MatrizCliente from "./MatrizCliente";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];

export default function MatrizPage() {
  const s = getSessao();
  if (!s) redirect("/login");
  if (!PERFIS_OK.includes(s.perfil)) redirect("/");

  return (
    <>
      <h1 className="page-title">
        <Icon name="matriz" /> Matriz Política
      </h1>
      <p className="page-sub">
        Posicionamento em dois eixos: econômico (esquerda e direita) e social (libertário e autoritário). Responda os critérios, calibre pela IA e ajuste no mapa.
      </p>
      <MatrizCliente />
    </>
  );
}
