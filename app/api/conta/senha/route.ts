import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute, Usuario } from "@/lib/db";
import { getSessao, conferirSenha, hashSenha } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/conta/senha -> troca a senha do PRÓPRIO usuário logado
export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });

  const b = await req.json();
  const atual = (b.atual ?? "").toString();
  const nova = (b.nova ?? "").toString();

  if (nova.length < 6)
    return NextResponse.json(
      { erro: "A nova senha deve ter ao menos 6 caracteres." },
      { status: 400 }
    );

  const u = await queryOne<Usuario>("SELECT * FROM usuarios WHERE id = $1", [
    s.uid,
  ]);
  if (!u)
    return NextResponse.json(
      { erro: "Usuário não encontrado." },
      { status: 404 }
    );

  if (!conferirSenha(atual, u.senha_hash))
    return NextResponse.json(
      { erro: "Senha atual incorreta." },
      { status: 401 }
    );

  await execute("UPDATE usuarios SET senha_hash = $1 WHERE id = $2", [
    hashSenha(nova),
    s.uid,
  ]);
  return NextResponse.json({ ok: true });
}
