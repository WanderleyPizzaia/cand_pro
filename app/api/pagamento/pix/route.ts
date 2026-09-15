import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth";
import { execute } from "@/lib/db";
import { criarCobrancaPix, btgConfigurado } from "@/lib/btg";

export const dynamic = "force-dynamic";

const PODE = ["ADMIN", "MARKETING", "COORDENACAO"];

async function garantirTabela() {
  await execute(
    `CREATE TABLE IF NOT EXISTS pagamentos (
       id SERIAL PRIMARY KEY,
       escopo TEXT NOT NULL,
       valor NUMERIC(12,2) NOT NULL,
       descricao TEXT,
       txid TEXT,
       emv TEXT,
       status TEXT NOT NULL DEFAULT 'pendente',
       criado_por TEXT,
       criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
       pago_em TIMESTAMPTZ
     )`
  );
}

// POST { valor, descricao } -> cria cobrança PIX (BTG) e devolve QR + copia-e-cola.
export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !PODE.includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  await garantirTabela();

  const b = await req.json().catch(() => ({}));
  const valor = Math.round(Number(b.valor) * 100) / 100;
  const descricao = (b.descricao || "Aporte CAND PRO").toString().slice(0, 140);
  if (!valor || valor <= 0) return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });

  if (!(await btgConfigurado())) {
    return NextResponse.json({
      ok: false,
      aguardando: true,
      aviso: "Integração BTG em ativação: falta provisionar as credenciais (client_id/secret + COMPANY_ID + chave PIX) no cofre. Assim que subirem, o QR é gerado aqui.",
    });
  }

  const escopo = s.escopoCandidato || (s.perfil === "CANDIDATO" ? s.nome : "GLOBAL");
  const cob = await criarCobrancaPix({ valor, descricao });
  if (!cob.ok) return NextResponse.json({ ok: false, erro: cob.erro }, { status: 502 });

  await execute(
    "INSERT INTO pagamentos (escopo, valor, descricao, txid, emv, status, criado_por) VALUES ($1,$2,$3,$4,$5,'pendente',$6)",
    [escopo, valor, descricao, cob.txid || null, cob.emv || null, s.nome]
  );

  return NextResponse.json({ ok: true, valor, txid: cob.txid, emv: cob.emv, qrcodeBase64: cob.qrcodeBase64 || "" });
}
