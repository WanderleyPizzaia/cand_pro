import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { query } from "@/lib/db";
import InboxCliente from "./InboxCliente";
import PuxarNovas from "./PuxarNovas";
import Icon from "../../components/Icon";
import { agentesDaSessao } from "@/lib/escopo";

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

  // Números que esta sessão enxerga (marcados no usuário ou do gabinete).
  // null = todos. Vazio => não vê nada.
  const meusAgentes = await agentesDaSessao(sessao);
  const escCand = meusAgentes === null ? null : meusAgentes.length ? meusAgentes : [-1];

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

  return (
    // Tela fixa: quem rola é a lista de conversas e as mensagens, não a página.
    <div className="inbox-tela">
      <h1 className="page-title">
        <Icon name="whatsapp" /> Conversas por número
      </h1>
      <p className="page-sub">
        {sessao.perfil === "CANDIDATO"
          ? "Mensagens recebidas pelo seu agente de WhatsApp"
          : "Caixa de entrada de cada número. Para a fila distribuída entre atendentes, use a aba Atendimento."}
      </p>
      {/* Busca ativa: importa da Evolution mesmo quando o webhook não avisa. */}
      <PuxarNovas segundos={15} />
      <InboxCliente
        perfil={sessao.perfil}
        agenteIdFixo={agenteIdFixo}
        agentes={agentes}
        contatoInicial={contatoInicial}
        agenteInicial={agenteInicial}
      />
    </div>
  );
}
