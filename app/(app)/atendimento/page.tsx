import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import Icon from "../../components/Icon";
import AtendimentoCliente from "./AtendimentoCliente";

export const dynamic = "force-dynamic";

const PERMITIDOS = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO", "ATENDENTE"];

export default async function AtendimentoPage() {
  const sessao = getSessao()!;
  if (!PERMITIDOS.includes(sessao.perfil)) redirect("/");

  return (
    <>
      <h1 className="page-title">
        <Icon name="chat" /> Atendimento
      </h1>
      <p className="page-sub">
        Inbox da equipe · conversas distribuídas automaticamente, cada uma travada
        no seu atendente. A IA responde até alguém assumir.
      </p>
      <AtendimentoCliente />
    </>
  );
}
