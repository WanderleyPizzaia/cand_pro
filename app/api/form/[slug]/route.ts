import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute, Usuario } from "@/lib/db";
import { buscarCidade } from "@/lib/cidades";
import { regiaoMaisProxima } from "@/lib/opcoes";
import { agentesDoCandidato } from "@/lib/metas";

export const dynamic = "force-dynamic";

// POST /api/form/[slug] -> cadastro PUBLICO vinculado ao candidato (sem login)
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = (params.slug ?? "").toLowerCase();
  const lider = await queryOne<Usuario>(
    "SELECT * FROM usuarios WHERE (lower(email) = $1 OR lower(split_part(email,'@',1)) = $1) AND ativo = 1 LIMIT 1",
    [slug]
  );

  if (!lider) {
    return NextResponse.json(
      { erro: "Link de cadastro inválido." },
      { status: 404 }
    );
  }

  const b = await req.json();
  const nome = (b.nome ?? "").toString().trim();
  if (!nome) {
    return NextResponse.json({ erro: "Informe seu nome." }, { status: 400 });
  }

  const cidadeNome = (b.cidade ?? "").toString().trim();
  const cidade = buscarCidade(cidadeNome);
  const lat = cidade?.lat ?? null;
  const lng = cidade?.lng ?? null;
  const regiao = lat != null && lng != null ? regiaoMaisProxima(lat, lng) : null;

  // Respostas de intenção (opcionais): montam a observação e classificam o apoiador.
  const sim = (v: any) => (v ? String(v).trim() : "");
  const partes = [
    sim(b.e_sp) && `Estado SP: ${sim(b.e_sp)}`,
    sim(b.votaria) && `Votaria no candidato: ${sim(b.votaria)}`,
    sim(b.comunidade) && `Entrar na comunidade: ${sim(b.comunidade)}`,
  ].filter(Boolean);
  const observacao = partes.length
    ? partes.join(" · ")
    : (b.observacao || "Cadastro via formulário público");
  // "Votaria = Sim" vira apoiador; senão, contato.
  const categoria = /sim/i.test(sim(b.votaria)) ? "Apoiador" : b.categoria || "Contato";

  // Vincula ao agente do candidato (conta no dashboard dele e no isolamento).
  const agentes = await agentesDoCandidato(lider.nome, lider.id);
  const agenteId = agentes[0] ?? null;

  await execute(
    `INSERT INTO pessoas
       (nome, categoria, cidade, regiao, bairro, whatsapp, email, observacao, lat, lng, agente_id, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      nome,
      categoria,
      cidadeNome || null,
      regiao,
      b.bairro || null,
      b.whatsapp || null,
      b.email || null,
      observacao,
      lat,
      lng,
      agenteId,
      String(lider.id),
    ]
  );

  return NextResponse.json({ ok: true });
}
