import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import Icon from "../../components/Icon";
import FunilCliente from "./FunilCliente";

export const dynamic = "force-dynamic";

// Apenas o admin master acessa o Funil.
const PERFIS_OK = ["ADMIN"];

export default function FunilPage() {
  const s = getSessao();
  if (!s) redirect("/login");
  if (!PERFIS_OK.includes(s.perfil)) redirect("/");

  return (
    <>
      <h1 className="page-title">
        <Icon name="funil" /> Funil de Eleitores
      </h1>
      <p className="page-sub">
        Do alcance ao voto: os eleitores escorregam do topo ao fundo conforme entram na base e engajam.
      </p>
      <FunilCliente />
    </>
  );
}
