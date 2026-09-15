import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { query, Agente } from "@/lib/db";
import Icon from "../../components/Icon";
import WhatsTabs from "../agentes/WhatsTabs";
import CandidatoTabs from "../inbox/CandidatoTabs";
import TemplatesClient from "./TemplatesClient";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const sessao = getSessao()!;
  const ehCandidato = sessao.perfil === "CANDIDATO";
  if (sessao.perfil !== "ADMIN" && !ehCandidato) redirect("/");

  // CANDIDATO: só os próprios números Meta. ADMIN: todos.
  const escCand =
    ehCandidato
      ? sessao.escopoAgentes && sessao.escopoAgentes.length
        ? sessao.escopoAgentes
        : [-1]
      : null;
  const agentes = escCand
    ? await query<Agente>(
        `SELECT id, candidato, meta_waba_id FROM agentes
          WHERE provedor = 'meta' AND id IN (${escCand.join(",")}) ORDER BY candidato`
      )
    : await query<Agente>(
        "SELECT id, candidato, meta_waba_id FROM agentes WHERE provedor = 'meta' ORDER BY candidato"
      );

  return (
    <>
      <h1 className="page-title">
        <Icon name="chat" /> Templates
      </h1>
      <p className="page-sub">
        Crie modelos de mensagem, envie para aprovação da Meta e defina variáveis.
      </p>
      {ehCandidato ? <CandidatoTabs /> : <WhatsTabs />}
      <TemplatesClient
        agentes={agentes.map((a) => ({ id: a.id, nome: a.candidato, waba: a.meta_waba_id }))}
      />
    </>
  );
}
