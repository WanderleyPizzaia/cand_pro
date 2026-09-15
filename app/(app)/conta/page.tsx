import { getSessao, ROTULO_PERFIL, Perfil } from "@/lib/auth";
import FormSenha from "./FormSenha";
import Icon from "../../components/Icon";

export const dynamic = "force-dynamic";

export default function ContaPage() {
  const s = getSessao()!;

  return (
    <>
      <h1 className="page-title">
        <Icon name="key" /> Minha conta
      </h1>
      <p className="page-sub">
        {s.nome} · {ROTULO_PERFIL[s.perfil as Perfil] || s.perfil}
      </p>

      <FormSenha />
    </>
  );
}
