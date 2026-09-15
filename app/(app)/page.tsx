import Link from "next/link";
import { redirect } from "next/navigation";
import { queryOne, Usuario } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { coletarDashboard } from "@/lib/dashboard";
import CopyLink from "../components/CopyLink";
import DashboardLive from "./DashboardLive";
import Icon from "../components/Icon";
import AvatarUsuario from "../components/AvatarUsuario";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const sessao = getSessao()!;
  // Atendente só opera o CRM de Atendimento — cai direto nele.
  if (sessao.perfil === "ATENDENTE") redirect("/atendimento");
  const ehLider = sessao.perfil === "LIDER";

  const eu = await queryOne<Pick<Usuario, "email" | "foto">>(
    "SELECT email, foto FROM usuarios WHERE id = $1",
    [sessao.uid]
  );
  const meuSlug = eu?.email ?? "";

  // Render inicial dos indicadores (depois o componente atualiza sozinho).
  const inicial = await coletarDashboard(sessao);

  return (
    <>
      <div className="dash-saudacao">
        <AvatarUsuario foto={eu?.foto ?? null} nome={sessao.nome} className="dash-avatar" />
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>
            <Icon name="dashboard" /> Visão Geral
          </h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Olá, {sessao.nome} · {ehLider ? "seus indicadores" : "visão geral"} ·
            São Paulo
          </p>
        </div>
      </div>

      {ehLider && (
        <div className="link-card">
          <h3><Icon name="link" size={16} />Seu link de captação</h3>
          <p>
            Compartilhe no WhatsApp, bio do Instagram ou onde quiser. Quem se
            cadastrar entra automaticamente vinculado a você.
          </p>
          <CopyLink path={`/form/${meuSlug}`} />
        </div>
      )}

      <DashboardLive inicial={inicial} perfil={sessao.perfil} />

      <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
        <Link href="/cadastro" className="btn btn-primary" style={{ flex: "none" }}>
          <Icon name="plus" size={16} /> Novo cadastro
        </Link>
        <Link href="/mapa" className="btn btn-ghost">
          <Icon name="map" size={16} /> Abrir Mapa de Votos
        </Link>
      </div>
    </>
  );
}
