import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute, Pessoa } from "@/lib/db";
import { buscarCidade } from "@/lib/cidades";
import { regiaoMaisProxima } from "@/lib/opcoes";
import { getSessao } from "@/lib/auth";
import { resolverEscopo, filtroPessoas } from "@/lib/escopo";

export const dynamic = "force-dynamic";

// GET /api/pessoas        -> lista os cadastros no escopo da sessão
// GET /api/pessoas?id=N   -> um cadastro (para edição), com checagem de escopo
export async function GET(req: NextRequest) {
  const sessao = getSessao();
  if (!sessao) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });
  const esc = resolverEscopo(sessao);

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (id) {
    // Só devolve se o registro estiver dentro do escopo do usuário.
    const p = await queryOne<Pessoa>(
      `SELECT * FROM pessoas WHERE id = $1 ${filtroPessoas(esc, "")}`,
      [id]
    );
    if (!p) return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
    return NextResponse.json(p);
  }

  const linhas = await query<Pessoa>(
    `SELECT * FROM pessoas WHERE 1=1 ${filtroPessoas(esc, "")} ORDER BY id DESC`
  );
  return NextResponse.json(linhas);
}

// POST /api/pessoas -> cria um novo cadastro
export async function POST(req: NextRequest) {
  const sessao = getSessao();
  if (!sessao) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });

  const b = await req.json();

  const nome = (b.nome ?? "").toString().trim();
  if (!nome) {
    return NextResponse.json({ erro: "O nome e obrigatorio." }, { status: 400 });
  }

  const cidadeNome = (b.cidade ?? "").toString().trim();
  const cidade = buscarCidade(cidadeNome);

  // Resolve coordenadas e regiao a partir da cidade
  const lat = cidade?.lat ?? null;
  const lng = cidade?.lng ?? null;

  let regiao = (b.regiao ?? "").toString().trim();
  if ((!regiao || regiao === "Auto") && lat != null && lng != null) {
    regiao = regiaoMaisProxima(lat, lng);
  }
  if (regiao === "Auto") regiao = "";

  const foto = typeof b.foto === "string" && b.foto.startsWith("data:image")
    ? b.foto
    : null;

  // "Qual?" só faz sentido quando a função é "Outro".
  const funcaoOutro = b.funcao === "Outro" ? (b.funcao_outro || "").toString().trim() || null : null;

  const novo = await queryOne<{ id: number }>(
    `INSERT INTO pessoas
        (nome, categoria, funcao, funcao_outro, partido, cidade, regiao, bairro, whatsapp, email, instagram, observacao, foto, lat, lng, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING id`,
    [
      nome,
      b.categoria || null,
      b.funcao || null,
      funcaoOutro,
      b.partido || null,
      cidadeNome || null,
      regiao || null,
      b.bairro || null,
      b.whatsapp || null,
      b.email || null,
      b.instagram || null,
      b.observacao || null,
      foto,
      lat,
      lng,
      String(sessao.uid),
    ]
  );

  return NextResponse.json(
    { id: novo?.id, cidadeReconhecida: !!cidade, regiao },
    { status: 201 }
  );
}

// PATCH /api/pessoas -> edita um cadastro (recalcula geo se a cidade mudar)
export async function PATCH(req: NextRequest) {
  const sessao = getSessao();
  if (!sessao) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });

  const b = await req.json();
  const id = Number(b.id);
  if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });

  // "Qual?" só vale quando a função é "Outro"; qualquer outra função limpa o campo.
  if ("funcao" in b && b.funcao !== "Outro") b.funcao_outro = "";

  const campos = [
    "nome", "categoria", "funcao", "funcao_outro", "partido", "cidade", "regiao",
    "bairro", "whatsapp", "email", "instagram", "observacao",
  ];
  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;
  for (const c of campos) {
    if (!(c in b)) continue;
    if (c === "nome" && !(b.nome ?? "").toString().trim()) continue;
    sets.push(`${c} = $${i++}`);
    vals.push((b[c] ?? "").toString().trim() || null);
  }

  // Foto: string vazia remove; data:image grava.
  if (typeof b.foto === "string") {
    sets.push(`foto = $${i++}`);
    vals.push(b.foto.startsWith("data:image") ? b.foto : null);
  }

  // Recalcula lat/lng/regiao quando a cidade é enviada.
  if ("cidade" in b) {
    const cidade = buscarCidade((b.cidade ?? "").toString().trim());
    sets.push(`lat = $${i++}`); vals.push(cidade?.lat ?? null);
    sets.push(`lng = $${i++}`); vals.push(cidade?.lng ?? null);
    if (cidade) {
      let regiao = (b.regiao ?? "").toString().trim();
      if (!regiao || regiao === "Auto") regiao = regiaoMaisProxima(cidade.lat, cidade.lng);
      sets.push(`regiao = $${i++}`); vals.push(regiao || null);
    }
  }

  if (sets.length === 0)
    return NextResponse.json({ erro: "Nada para atualizar." }, { status: 400 });

  vals.push(id);
  await execute(`UPDATE pessoas SET ${sets.join(", ")} WHERE id = $${i}`, vals);
  return NextResponse.json({ ok: true });
}

// DELETE /api/pessoas?id= -> remove um cadastro
export async function DELETE(req: NextRequest) {
  const sessao = getSessao();
  if (!sessao) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });
  await execute("DELETE FROM pessoas WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
