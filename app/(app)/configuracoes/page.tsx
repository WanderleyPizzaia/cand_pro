import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { statusConfig } from "@/lib/config";
import ConfigTabs from "./ConfigTabs";
import Icon from "../../components/Icon";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const sessao = getSessao()!;
  const admin = sessao.perfil === "ADMIN";
  // Gestor de gabinete (Candidato/Coordenação vinculado) entra numa visão
  // reduzida: só o time (ver + redefinir senha) e a própria senha.
  const bound =
    (sessao.perfil === "CANDIDATO" || sessao.perfil === "COORDENACAO") &&
    !!sessao.escopoCandidato;
  if (!admin && !bound) redirect("/");
  const st = admin ? await statusConfig() : null;

  return (
    <>
      <h1 className="page-title">
        <Icon name="settings" /> Configurações
      </h1>
      <p className="page-sub">
        {admin
          ? "Logins da equipe, integrações e sua senha, tudo em um lugar."
          : "Sua equipe e sua senha de acesso."}
      </p>

      <ConfigTabs meuId={sessao.uid} status={st} admin={admin} />
    </>
  );
}
