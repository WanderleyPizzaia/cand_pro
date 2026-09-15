import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessao } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/mapa/pessoas?cidade=&agente=  -> quem está cadastrado naquela cidade
// (usado ao clicar numa bolinha do mapa). Líder vê só os próprios.
export async function GET(req: NextRequest) {
  const s = getSessao();
  if (!s) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });

  const url = new URL(req.url);
  const cidade = (url.searchParams.get("cidade") ?? "").trim();
  const agenteRaw = (url.searchParams.get("agente") ?? "").trim();
  const agente = /^\d+$/.test(agenteRaw) ? Number(agenteRaw) : null;
  if (!cidade) return NextResponse.json([]);

  const params: any[] = [cidade];
  let i = 2;
  let extra = "";
  if (s.perfil === "LIDER") {
    params.push(String(s.uid));
    extra += ` AND p.criado_por = $${i++}`;
  }
  const bound = s.perfil !== "ADMIN" && !!s.escopoAgentes;
  if (bound) {
    // Candidato/equipe vinculado: só o terreno dele (ignora ?agente da URL).
    extra += ` AND p.agente_id IN (${(s.escopoAgentes!.length ? s.escopoAgentes! : [-1]).join(",")})`;
  } else if (agente) {
    extra += ` AND p.agente_id = ${agente}`; // inteiro validado
  }

  const lista = await query(
    `SELECT p.id, p.nome, p.whatsapp, p.foto, p.agente_id, a.candidato
       FROM pessoas p
       LEFT JOIN agentes a ON a.id = p.agente_id
      WHERE p.cidade = $1 ${extra}
      ORDER BY (p.foto IS NOT NULL) DESC, p.nome ASC
      LIMIT 300`,
    params
  );
  return NextResponse.json(lista);
}
