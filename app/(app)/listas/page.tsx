import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { query, Agente } from "@/lib/db";
import Icon from "../../components/Icon";
import ListasCliente from "./ListasCliente";
import { agentesDaSessao } from "@/lib/escopo";

export const dynamic = "force-dynamic";

const PERMITIDOS = ["ADMIN", "COORDENACAO", "CANDIDATO"];

export default async function ListasPage() {
  const sessao = getSessao()!;
  if (!PERMITIDOS.includes(sessao.perfil)) redirect("/");

  // Números disponíveis (escopados p/ candidato/equipe vinculado).
  const esc = await agentesDaSessao(sessao);
  const filtro =
    sessao.perfil !== "ADMIN" && esc
      ? `AND id IN (${(esc.length ? esc : [-1]).join(",")})`
      : "";
  const agentes = await query<Agente>(
    `SELECT id, candidato FROM agentes WHERE 1=1 ${filtro} ORDER BY candidato`
  );

  return (
    <>
      <h1 className="page-title">
        <Icon name="users" /> Listas de disparo
      </h1>
      <p className="page-sub">
        Importe um CSV de contatos e transforme numa lista reutilizável. A
        importação normaliza o telefone, remove duplicados e já plota no mapa.
      </p>
      <ListasCliente agentes={agentes.map((a) => ({ id: a.id, candidato: a.candidato }))} />
    </>
  );
}
