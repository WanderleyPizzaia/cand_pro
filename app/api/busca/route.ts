import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { resolverEscopoAtual, filtroPessoas } from "@/lib/escopo";

export const dynamic = "force-dynamic";

// Quem enxerga a tela de Contatos também acha contatos pela busca global.
const VEEM_CONTATOS = ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO", "LIDER"];

// GET /api/busca?q=texto -> até 8 contatos no escopo da sessão (nome, cidade,
// cargo ou número). As telas o próprio cliente filtra, sem ir ao servidor.
export async function GET(req: NextRequest) {
  const s = getSessao();
  if (!s) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });
  if (!VEEM_CONTATOS.includes(s.perfil)) return NextResponse.json({ contatos: [] });

  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ contatos: [] });

  const esc = await resolverEscopoAtual(s);
  const params: string[] = [`%${q}%`];
  let cond = `(p.nome ILIKE $1 OR p.cidade ILIKE $1 OR p.funcao ILIKE $1 OR p.categoria ILIKE $1)`;
  const digitos = q.replace(/\D/g, "");
  if (digitos.length >= 3) {
    params.push(`%${digitos}%`);
    cond = `(${cond.slice(1, -1)} OR regexp_replace(COALESCE(p.whatsapp,''),'\\D','','g') ILIKE $2)`;
  }
  const contatos = await query<{
    id: number;
    nome: string;
    cidade: string | null;
    whatsapp: string | null;
    categoria: string | null;
  }>(
    `SELECT p.id, p.nome, p.cidade, p.whatsapp, p.categoria
       FROM pessoas p
      WHERE ${cond} ${filtroPessoas(esc, "p")}
      ORDER BY p.id DESC
      LIMIT 8`,
    params
  );
  return NextResponse.json({ contatos });
}
