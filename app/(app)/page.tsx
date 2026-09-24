import Link from "next/link";
import { redirect } from "next/navigation";
import { queryOne, Usuario } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { coletarDashboard, dashboardVazio } from "@/lib/dashboard";
import CopyLink from "../components/CopyLink";
import DashboardLive from "./DashboardLive";
import Icon from "../components/Icon";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const sessao = getSessao()!;
  // Atendente só opera o CRM de Atendimento — cai direto nele.
  if (sessao.perfil === "ATENDENTE") redirect("/atendimento");
  const ehLider = sessao.perfil === "LIDER";

  const eu = await queryOne<Pick<Usuario, "email">>(
    "SELECT email FROM usuarios WHERE id = $1",
    [sessao.uid]
  );
  const meuSlug = eu?.email ?? "";

  // Render inicial dos indicadores (depois o componente atualiza sozinho).
  // Se o banco engasgar, abre zerado em vez de derrubar a página inteira com
  // "Application error" — os números aparecem no primeiro refresh automático.
  const inicial = await coletarDashboard(sessao).catch((e) => {
    console.error("[dashboard] falha ao coletar:", (e as Error).message);
    return dashboardVazio(
      sessao.perfil === "LIDER" ? "lider" : sessao.escopoCandidato ? "candidato" : "global"
    );
  });

  const primeiroNome = (sessao.nome || "").trim().split(/\s+/)[0];
  const hoje = new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <div className="page-head">
        <div className="page-head-txt">
          <h1 className="page-title">
            <Icon name="dashboard" /> Início
          </h1>
          <p className="page-sub">
            Olá, {primeiroNome}. Hoje é {hoje}
            {inicial.escopo === "candidato" && inicial.candidatoNome ? ` · números de ${inicial.candidatoNome}` : ""}
            {ehLider ? " · seus cadastros" : ""}.
          </p>
        </div>
        <div className="page-head-acoes">
          <Link href="/mapa" className="btn btn-ghost so-desktop">
            <Icon name="map" size={16} /> Mapa de votos
          </Link>
          <Link href="/cadastro" className="btn btn-primary">
            <Icon name="plus" size={16} /> Cadastrar contato
          </Link>
        </div>
      </div>

      {ehLider && (
        <div className="link-card">
          <h3>
            <Icon name="link" size={16} /> Seu link de captação
          </h3>
          <p>
            Compartilhe no WhatsApp, na bio do Instagram ou onde quiser. Quem se
            cadastrar entra automaticamente vinculado a você.
          </p>
          <CopyLink path={`/form/${meuSlug}`} />
        </div>
      )}

      <DashboardLive inicial={inicial} perfil={sessao.perfil} />
    </>
  );
}
