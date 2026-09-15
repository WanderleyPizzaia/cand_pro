import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import OnboardingCliente from "./OnboardingCliente";

export const dynamic = "force-dynamic";

// Tela de boas-vindas do 1º acesso (fullscreen, sem sidebar), para o candidato
// real vinculado que ainda não passou pelo onboarding (flag `onboarded` no banco).
export default async function OnboardingPage() {
  const sessao = getSessao();
  if (!sessao) redirect("/login");
  if (!sessao.escopoCandidato || sessao.onboarded) redirect("/");

  const primeiroNome = sessao.nome.split(" ")[0];

  // Nome do candidato do gabinete (para o cartão) e a foto do agente dele,
  // quando houver.
  const candidato = sessao.escopoCandidato;
  const primeiro = candidato.split(" ")[0];
  const ag = await queryOne<{ foto: string | null }>(
    `SELECT foto FROM agentes
      WHERE usuario_id = $1 OR candidato ILIKE $2
      ORDER BY (usuario_id = $1) DESC LIMIT 1`,
    [sessao.uid, primeiro + "%"]
  );

  return (
    <OnboardingCliente
      nome={primeiroNome}
      candidato={candidato}
      foto={ag?.foto ?? null}
    />
  );
}
