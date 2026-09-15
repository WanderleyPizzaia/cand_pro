import { NextRequest, NextResponse } from "next/server";
import { queryOne, Usuario } from "@/lib/db";
import { conferirSenha, definirCookieSessao, Perfil } from "@/lib/auth";
import { agentesDoCandidato } from "@/lib/metas";
import { agentesDoAtendente } from "@/lib/atendimentoCrm";
import {
  ipDoCliente,
  loginBloqueado,
  registrarFalhaLogin,
  limparFalhasLogin,
} from "@/lib/seguranca";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { email, senha } = await req.json().catch(() => ({}));

  const emailLimpo = (email ?? "").toString().trim().toLowerCase();
  const ip = ipDoCliente(req);

  // Anti força bruta: depois de várias senhas erradas, bloqueia por 15 min.
  const minutos = await loginBloqueado(emailLimpo, ip);
  if (minutos > 0) {
    return NextResponse.json(
      { erro: `Muitas tentativas de login. Tente de novo em ${minutos} minuto(s).` },
      { status: 429, headers: { "Retry-After": String(minutos * 60) } }
    );
  }

  const u = await queryOne<Usuario>(
    "SELECT * FROM usuarios WHERE lower(email) = $1 AND ativo = 1",
    [emailLimpo]
  );

  if (!u || !conferirSenha((senha ?? "").toString(), u.senha_hash)) {
    await registrarFalhaLogin(emailLimpo, ip);
    return NextResponse.json(
      { erro: "E-mail ou senha incorretos." },
      { status: 401 }
    );
  }

  await limparFalhasLogin(emailLimpo, ip);

  const sessao: any = {
    uid: u.id,
    nome: u.nome,
    perfil: u.perfil as Perfil,
    onboarded: !!u.onboarded,
  };

  // Atendente: escopo pelos NÚMEROS vinculados (atendente_agentes). Só vê/recebe
  // conversas desses agentes. Sem vínculo => escopo vazio (não vê nada).
  if (u.perfil === "ATENDENTE") {
    sessao.escopoAgentes = await agentesDoAtendente(u.id);
  }

  // Isolamento por candidato: candidato real (por nome) OU usuário de equipe
  // vinculado (candidato_escopo). ADMIN nunca é escopado (vê tudo).
  if (u.perfil !== "ADMIN" && u.perfil !== "ATENDENTE") {
    const alvo = (
      u.candidato_escopo || (u.perfil === "CANDIDATO" ? u.nome : "")
    ).trim();
    if (alvo) {
      sessao.escopoCandidato = alvo;
      sessao.escopoAgentes = await agentesDoCandidato(alvo, u.id);
    }
  }

  definirCookieSessao(sessao);
  return NextResponse.json({
    ok: true,
    perfil: u.perfil,
    onboarded: !!u.onboarded,
  });
}
