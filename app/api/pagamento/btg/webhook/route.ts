import { NextRequest, NextResponse } from "next/server";
import { execute, queryOne } from "@/lib/db";
import { conferirToken } from "@/lib/config";

export const dynamic = "force-dynamic";

// Webhook PÚBLICO chamado pelo BTG na confirmação do PIX (cash-in).
// Faz a baixa do pagamento e registra o APORTE no Financeiro (transparente).
// Token OBRIGATÓRIO (?token= ou header x-webhook-token igual a BTG_WEBHOOK_TOKEN):
// sem ele qualquer um poderia dar baixa em pagamento.
export async function POST(req: NextRequest) {
  const t = new URL(req.url).searchParams.get("token") || req.headers.get("x-webhook-token") || "";
  const token = await conferirToken("BTG_WEBHOOK_TOKEN", t);
  if (token !== "ok")
    return NextResponse.json(
      { erro: token === "ausente" ? "BTG_WEBHOOK_TOKEN não configurado" : "unauthorized" },
      { status: token === "ausente" ? 503 : 401 }
    );

  const b = await req.json().catch(() => ({}));
  // Parse defensivo: o BTG pode aninhar o evento; buscamos txid + status pagos.
  const txid = b.txid || b.txId || b.id || b?.data?.txid || b?.pixCashIn?.txid || "";
  const statusRaw = (b.status || b?.data?.status || b.tipo || "").toString().toLowerCase();
  const pago = /paid|confirm|conclu|liquidad|received|approved|success/.test(statusRaw) || b.paid === true;

  if (!txid) return NextResponse.json({ ok: true, ignorado: "sem txid" });

  const pg = await queryOne<{ id: number; escopo: string; valor: string; status: string; descricao: string | null }>(
    "SELECT id, escopo, valor, status, descricao FROM pagamentos WHERE txid = $1 LIMIT 1",
    [txid]
  ).catch(() => null);

  if (!pg) return NextResponse.json({ ok: true, ignorado: "txid desconhecido" });
  if (pg.status === "pago") return NextResponse.json({ ok: true, jaProcessado: true });
  if (!pago) return NextResponse.json({ ok: true, aguardando: true });

  // Baixa + registro do aporte no Financeiro (mesma tabela do painel transparente).
  await execute("UPDATE pagamentos SET status = 'pago', pago_em = now() WHERE id = $1", [pg.id]);
  await execute(
    "INSERT INTO financeiro (escopo, tipo, valor, descricao, criado_por) VALUES ($1,'aporte',$2,$3,'btg-webhook')",
    [pg.escopo, Number(pg.valor), "Aporte via PIX (BTG) · " + (pg.descricao || "CAND PRO")]
  );
  return NextResponse.json({ ok: true, baixado: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, servico: "webhook btg pix" });
}
