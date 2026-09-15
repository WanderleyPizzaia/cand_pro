import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

const PERFIS_OK = ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO"];

// Modelo de custo do disparo. O CLIENTE vê só o preço FINAL por mensagem
// (margem embutida). O ADMIN vê o detalhe: custo base + corretagem.
export async function GET() {
  const s = getSessao();
  if (!s || !PERFIS_OK.includes(s.perfil))
    return NextResponse.json({ erro: "negado" }, { status: 403 });

  const custoMarketing = Number((await getConfig("CUSTO_MARKETING")) || 0.37);
  const custoUtility = Number((await getConfig("CUSTO_UTILITY")) || 0.08);
  const corretagem = Number((await getConfig("CORRETAGEM_PCT")) || 0.3);
  // Imposto sobre a operação (gross-up da contadora): o tributo é % do BRUTO
  // (nota fiscal), então o bruto = líquido / (1 - imposto). Config IMPOSTO_PCT.
  const imposto = Number((await getConfig("IMPOSTO_PCT")) || 0);
  const admin = s.perfil === "ADMIN";

  // Líquido desejado por msg = custo base + corretagem. Bruto (o que o cliente
  // paga / vai na NF) = líquido / (1 - imposto).
  const finalDe = (custo: number) => +((custo * (1 + corretagem)) / (1 - imposto)).toFixed(2);
  const fMkt = finalDe(custoMarketing);
  const fUtl = finalDe(custoUtility);

  return NextResponse.json({
    admin,
    eleicao: "2026-10-04T08:00:00-03:00",
    // Preço FINAL por mensagem (o que o cliente vê e paga):
    precoFinal: { marketing: fMkt, utility: fUtl },
    // Detalhe SÓ para admin (custo base + corretagem + imposto):
    detalheAdmin: admin
      ? { custoMarketing, custoUtility, corretagemPct: corretagem, impostoPct: imposto }
      : null,
  });
}
