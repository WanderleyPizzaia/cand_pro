import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { query } from "@/lib/db";
import WhatsTabs from "../agentes/WhatsTabs";
import InboxCliente from "./InboxCliente";
import CandidatoTabs from "./CandidatoTabs";
import PuxarNovas from "./PuxarNovas";
import Icon from "../../components/Icon";

export const dynamic = "force-dynamic";

const PERMITIDOS = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO"];

export default async function InboxPage({
  searchParams,
}: {
  searchParams: { contato?: string; agente?: string };
}) {
  const sessao = getSessao()!;
  if (!PERMITIDOS.includes(sessao.perfil)) redirect("/");

  const contatoInicial = (searchParams.contato || "").replace(/\D/g, "") || null;
  const agenteInicial = searchParams.agente ? Number(searchParams.agente) : null;

  // Números do CANDIDATO (todos os do escopo). Vazio => não vê nada.
  const escCand =
    sessao.perfil === "CANDIDATO"
      ? sessao.escopoAgentes && sessao.escopoAgentes.length
        ? sessao.escopoAgentes
        : [-1]
      : null;

  // Busca agentes para o seletor de abas. CANDIDATO só os SEUS números;
  // gestor/admin todos.
  const agentes = escCand
    ? await query<{ id: number; candidato: string }>(
        `SELECT id, candidato FROM agentes WHERE id IN (${escCand.join(",")}) ORDER BY id`
      )
    : await query<{ id: number; candidato: string }>(
        "SELECT id, candidato FROM agentes ORDER BY id"
      );

  // CANDIDATO vê todos os seus números (sem travar em um só): abas ficam
  // disponíveis e o padrão é "Todos" (os dele). A fronteira real é no /api/inbox.
  const agenteIdFixo: number | null = null;

  const ehGestor = ["ADMIN", "COORDENACAO"].includes(sessao.perfil);

  return (
    <>
      <h1 className="page-title">
        <Icon name="chat" /> Conversas · WhatsApp
      </h1>
      <p className="page-sub">
        {sessao.perfil === "CANDIDATO"
          ? "Mensagens recebidas pelo seu agente de WhatsApp"
          : "Caixa de entrada dos agentes · veja e responda manualmente"}
      </p>
      {ehGestor && <WhatsTabs />}
      {sessao.perfil === "CANDIDATO" && <CandidatoTabs />}
      {/* Busca ativa: importa da Evolution mesmo quando o webhook não avisa. */}
      <PuxarNovas segundos={15} />
      <InboxCliente
        perfil={sessao.perfil}
        agenteIdFixo={agenteIdFixo}
        agentes={agentes}
        contatoInicial={contatoInicial}
        agenteInicial={agenteInicial}
      />
    </>
  );
}
