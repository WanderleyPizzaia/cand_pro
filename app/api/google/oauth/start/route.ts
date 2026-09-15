import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

// Inicia o OAuth do Google (Calendar + Tasks + Gmail, somente leitura).
// Fica pronto: assim que GOOGLE_CLIENT_ID e GOOGLE_REDIRECT_URI forem cadastrados
// no config, devolve a URL de consentimento. Sem credenciais, avisa o usuário.
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/tasks.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "email",
  "profile",
].join(" ");

export async function POST() {
  const s = getSessao();
  if (!s) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });

  const clientId = await getConfig("GOOGLE_CLIENT_ID");
  const redirect = await getConfig("GOOGLE_REDIRECT_URI");
  if (!clientId || !redirect) {
    return NextResponse.json({
      aviso:
        "Conexão Google em ativação. Falta cadastrar as credenciais (GOOGLE_CLIENT_ID e GOOGLE_REDIRECT_URI). Assim que subir, o botão conecta a conta.",
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    scope: SCOPES,
    state: String(s.uid),
  });
  return NextResponse.json({ url: "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString() });
}
