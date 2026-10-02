import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { agentesDaSessao } from "@/lib/escopo";
import { contatoDaConversa } from "@/lib/atendimentoCrm";
import Icon from "../../components/Icon";
import AtendimentoCliente, { type Iniciar } from "./AtendimentoCliente";

export const dynamic = "force-dynamic";

const PERMITIDOS = ["ADMIN", "COORDENACAO", "MARKETING", "CANDIDATO", "ATENDENTE"];

export default async function AtendimentoPage({
  searchParams,
}: {
  searchParams: { view?: string; pessoa?: string };
}) {
  const sessao = getSessao()!;
  if (!PERMITIDOS.includes(sessao.perfil)) redirect("/");

  // Contatos → Atender (?pessoa=ID): confere que o contato é de um número que
  // esta sessão opera e acha a conversa dele (ou a forma do número para começar).
  let iniciar: Iniciar | null = null;
  const pessoaId = Number(searchParams.pessoa) || 0;
  if (pessoaId) {
    const meus = await agentesDaSessao(sessao); // null = todos (gestor sem vínculo)
    const p = await queryOne<{ nome: string | null; whatsapp: string | null; agente_id: number | null; candidato: string | null }>(
      `SELECT p.nome, p.whatsapp, p.agente_id, a.candidato
         FROM pessoas p LEFT JOIN agentes a ON a.id = p.agente_id
        WHERE p.id = $1`,
      [pessoaId]
    );
    const doEscopo =
      !!p?.agente_id && (meus === null ? sessao.perfil !== "CANDIDATO" : meus.includes(p.agente_id));
    if (!p || !doEscopo) {
      iniciar = { erro: "Este contato não é de um número que você atende." };
    } else {
      const contato = await contatoDaConversa(p.agente_id!, p.whatsapp || "");
      const nome = (p.nome || "").trim();
      iniciar = contato
        ? { agente_id: p.agente_id!, contato, contato_nome: nome && !/^\d+$/.test(nome) ? nome : null, agente_nome: p.candidato }
        : { erro: "Este contato não tem WhatsApp cadastrado." };
    }
  }

  return (
    <>
      <h1 className="page-title">
        <Icon name="chat" /> Atendimento
      </h1>
      <p className="page-sub">
        Fila da equipe: cada conversa fica com um atendente. A IA responde até
        alguém assumir.
      </p>
      <AtendimentoCliente viewInicial={searchParams.view} iniciar={iniciar} />
    </>
  );
}
