import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { query } from "@/lib/db";
import DemandasCliente from "./DemandasCliente";
import Icon from "../../components/Icon";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "MARKETING", "COORDENACAO"];

export default async function TarefasPage() {
  const sessao = getSessao()!;
  if (!PERFIS_OK.includes(sessao.perfil)) redirect("/");

  // Opções para os selects (responsável = usuários da equipe; eleitor = pessoas).
  const usuarios = await query<{ id: number; nome: string; perfil: string }>(
    "SELECT id, nome, perfil FROM usuarios WHERE ativo = 1 ORDER BY nome"
  );
  const pessoas = await query<{ id: number; nome: string }>(
    "SELECT id, nome FROM pessoas ORDER BY nome LIMIT 500"
  );

  return (
    <>
      <h1 className="page-title">
        <Icon name="tasks" /> Tarefas · Demandas
      </h1>
      <p className="page-sub">
        Pedidos e demandas dos eleitores · atribuição e acompanhamento
      </p>

      <DemandasCliente usuarios={usuarios} pessoas={pessoas} />
    </>
  );
}
