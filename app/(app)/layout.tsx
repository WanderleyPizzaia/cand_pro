import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessao } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import AppShell from "../components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessao = getSessao();
  if (!sessao) redirect("/login");

  // Candidato real (vinculado a um gabinete) no 1º acesso: tela de boas-vindas,
  // uma única vez. Persiste no banco (onboarded, vale nos próximos logins) e usa
  // o cookie para não repetir dentro do mesmo acesso (a flag da sessão só
  // atualiza no próximo login).
  if (
    sessao.escopoCandidato &&
    !sessao.onboarded &&
    !cookies().get("onboarding_visto")
  ) {
    redirect("/onboarding");
  }

  // Foto do usuário logado para o avatar da sidebar (null se não tiver).
  const u = await queryOne<{ foto: string | null }>(
    "SELECT foto FROM usuarios WHERE id = $1",
    [sessao.uid]
  );

  return (
    <AppShell
      nome={sessao.nome}
      perfil={sessao.perfil}
      foto={u?.foto ?? null}
      tour={!!sessao.escopoCandidato}
    >
      {children}
    </AppShell>
  );
}
