import { NextRequest, NextResponse } from "next/server";
import { queryOne, Agente } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { validarNumeroMeta } from "@/lib/meta";

export const dynamic = "force-dynamic";

function podeGerir() {
  const s = getSessao();
  if (!s || !["ADMIN", "COORDENACAO"].includes(s.perfil)) return null;
  return s;
}

// POST -> testa as credenciais Meta (Cloud API) e devolve o número conectado.
// Aceita o token digitado no formulário (write-only) OU, se vazio, usa o já salvo.
// Corpo: { id, meta_phone_id?, meta_token? }
export async function POST(req: NextRequest) {
  if (!podeGerir())
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const id = Number(b?.id);

  // Busca o agente para preencher o que não veio no corpo (token/phone salvos).
  const agente = id
    ? await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [id])
    : undefined;

  const phoneId =
    (typeof b?.meta_phone_id === "string" && b.meta_phone_id.trim()) ||
    agente?.meta_phone_id ||
    "";
  const token =
    (typeof b?.meta_token === "string" && b.meta_token.trim()) ||
    agente?.meta_token ||
    "";

  if (!phoneId || !token)
    return NextResponse.json(
      { erro: "Informe o Phone Number ID e o token da Meta." },
      { status: 400 }
    );

  const r = await validarNumeroMeta(phoneId, token);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 });
  return NextResponse.json({ ok: true, numero: r.numero });
}
