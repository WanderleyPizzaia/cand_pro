import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute, Usuario } from "@/lib/db";
import { getSessao, hashSenha } from "@/lib/auth";
import { definirAgentesDoAtendente } from "@/lib/atendimentoCrm";

export const dynamic = "force-dynamic";

const PERFIS = ["ADMIN", "MARKETING", "COORDENACAO", "CANDIDATO", "ATENDENTE", "LIDER"];

function exigirAdmin() {
  const s = getSessao();
  if (!s || s.perfil !== "ADMIN") return null;
  return s;
}

// Escopo de gestão de equipe: ADMIN vê/gere tudo; CANDIDATO/COORDENAÇÃO vinculado
// vê e redefine senha SÓ do próprio time (candidato_escopo), nunca de ADMIN.
function escopoEquipe() {
  const s = getSessao();
  if (!s) return null;
  const admin = s.perfil === "ADMIN";
  const escopo =
    !admin && (s.perfil === "CANDIDATO" || s.perfil === "COORDENACAO")
      ? (s.escopoCandidato || "").trim()
      : "";
  if (!admin && !escopo) return null;
  return { s, admin, escopo };
}

// GET -> lista usuarios (sem o hash da senha). ADMIN: todos. Vinculado: só seu time.
export async function GET() {
  const ctx = escopoEquipe();
  if (!ctx) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const where = ctx.admin ? "" : "WHERE u.candidato_escopo = $1 AND u.perfil <> 'ADMIN'";
  const params = ctx.admin ? [] : [ctx.escopo];
  const lista = await query(
    `SELECT u.id, u.nome, u.email, u.perfil, u.foto, u.ativo, u.candidato_escopo,
            to_char(u.criado_em, 'YYYY-MM-DD HH24:MI') AS criado_em,
            -- Quantos contatos este usuário cadastrou (pessoas.criado_por = id).
            (SELECT COUNT(*) FROM pessoas p WHERE p.criado_por = u.id::text)::int AS cadastros,
            -- Presença: heartbeat do atendimento nos últimos 2 minutos.
            (u.visto_em IS NOT NULL AND u.visto_em > now() - interval '2 minutes') AS online,
            COALESCE(
              (SELECT array_agg(agente_id) FROM atendente_agentes WHERE usuario_id = u.id),
              '{}'
            ) AS agentes
       FROM usuarios u ${where} ORDER BY u.id`,
    params
  );
  // Números (agentes) só para ADMIN (vínculo de atendentes).
  const agentes = ctx.admin
    ? await query("SELECT id, candidato, telefone FROM agentes ORDER BY candidato")
    : [];
  return NextResponse.json({ usuarios: lista, agentes, admin: ctx.admin });
}

// POST -> cria usuario
export async function POST(req: NextRequest) {
  if (!exigirAdmin())
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json();
  const nome = (b.nome ?? "").toString().trim();
  const email = (b.email ?? "").toString().trim().toLowerCase();
  const senha = (b.senha ?? "").toString();
  const perfil = (b.perfil ?? "").toString();

  if (!nome || !email || !senha)
    return NextResponse.json(
      { erro: "Nome, e-mail e senha são obrigatórios." },
      { status: 400 }
    );
  if (!PERFIS.includes(perfil))
    return NextResponse.json({ erro: "Perfil inválido." }, { status: 400 });

  const existe = await queryOne<{ id: number }>(
    "SELECT id FROM usuarios WHERE lower(email) = $1",
    [email]
  );
  if (existe)
    return NextResponse.json(
      { erro: "Já existe um usuário com esse e-mail." },
      { status: 409 }
    );

  const foto =
    typeof b.foto === "string" && b.foto.startsWith("data:image") ? b.foto : null;

  // Escopo de gabinete: vincula o usuário a um candidato (isolamento). Vazio = global.
  const escopo =
    typeof b.candidato_escopo === "string" ? b.candidato_escopo.trim() || null : null;

  const novo = await queryOne<{ id: number }>(
    "INSERT INTO usuarios (nome, email, senha_hash, perfil, foto, candidato_escopo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [nome, email, hashSenha(senha), perfil, foto, escopo]
  );

  // Vínculo atendente ↔ números.
  if (novo && perfil === "ATENDENTE" && Array.isArray(b.agentes)) {
    await definirAgentesDoAtendente(novo.id, b.agentes.map(Number));
  }

  return NextResponse.json({ id: novo?.id }, { status: 201 });
}

// Garante que não estamos removendo/derrubando o último admin ativo.
async function ehUltimoAdminAtivo(alvo: Usuario): Promise<boolean> {
  if (alvo.perfil !== "ADMIN" || alvo.ativo !== 1) return false;
  const c =
    (
      await queryOne<{ c: number }>(
        "SELECT COUNT(*) c FROM usuarios WHERE perfil = 'ADMIN' AND ativo = 1"
      )
    )?.c ?? 0;
  return c <= 1;
}

// PATCH -> edita usuário (nome/email/perfil/ativo) e/ou redefine senha
export async function PATCH(req: NextRequest) {
  const ctx = escopoEquipe();
  if (!ctx) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  const s = ctx.s;

  const b = await req.json();
  const id = Number(b.id);
  if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });

  const alvo = await queryOne<Usuario>("SELECT * FROM usuarios WHERE id = $1", [
    id,
  ]);
  if (!alvo)
    return NextResponse.json({ erro: "Usuário não encontrado." }, { status: 404 });

  // Gestor de gabinete (não-ADMIN): só pode REDEFINIR SENHA de membro do SEU time
  // (mesmo candidato_escopo), nunca de ADMIN, e nada além da senha.
  if (!ctx.admin) {
    if (alvo.perfil === "ADMIN" || (alvo.candidato_escopo || "") !== ctx.escopo)
      return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
    const nova = typeof b.senha === "string" ? b.senha : "";
    if (!nova) return NextResponse.json({ erro: "Só é permitido redefinir a senha." }, { status: 400 });
    if (nova.length < 6)
      return NextResponse.json({ erro: "A nova senha deve ter ao menos 6 caracteres." }, { status: 400 });
    await execute("UPDATE usuarios SET senha_hash = $1 WHERE id = $2", [hashSenha(nova), id]);
    return NextResponse.json({ ok: true });
  }

  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;

  if (typeof b.nome === "string" && b.nome.trim()) {
    sets.push(`nome = $${i++}`);
    vals.push(b.nome.trim());
  }

  if (typeof b.email === "string" && b.email.trim()) {
    const email = b.email.trim().toLowerCase();
    const dup = await queryOne<{ id: number }>(
      "SELECT id FROM usuarios WHERE lower(email) = $1 AND id <> $2",
      [email, id]
    );
    if (dup)
      return NextResponse.json(
        { erro: "Já existe outro usuário com esse e-mail." },
        { status: 409 }
      );
    sets.push(`email = $${i++}`);
    vals.push(email);
  }

  if (typeof b.perfil === "string" && PERFIS.includes(b.perfil)) {
    if (b.perfil !== "ADMIN" && (await ehUltimoAdminAtivo(alvo)))
      return NextResponse.json(
        { erro: "É preciso manter ao menos um administrador ativo." },
        { status: 400 }
      );
    sets.push(`perfil = $${i++}`);
    vals.push(b.perfil);
  }

  if ("ativo" in b) {
    const ativo = b.ativo ? 1 : 0;
    if (ativo === 0) {
      if (id === s.uid)
        return NextResponse.json(
          { erro: "Você não pode desativar a si mesmo." },
          { status: 400 }
        );
      if (await ehUltimoAdminAtivo(alvo))
        return NextResponse.json(
          { erro: "É preciso manter ao menos um administrador ativo." },
          { status: 400 }
        );
    }
    sets.push(`ativo = $${i++}`);
    vals.push(ativo);
  }

  if (typeof b.senha === "string" && b.senha) {
    if (b.senha.length < 6)
      return NextResponse.json(
        { erro: "A nova senha deve ter ao menos 6 caracteres." },
        { status: 400 }
      );
    sets.push(`senha_hash = $${i++}`);
    vals.push(hashSenha(b.senha));
  }

  if (typeof b.foto === "string") {
    // string vazia => remove a foto; data:image => grava
    if (b.foto === "" || b.foto.startsWith("data:image")) {
      sets.push(`foto = $${i++}`);
      vals.push(b.foto === "" ? null : b.foto);
    }
  }

  // Escopo de gabinete (isolamento). String vazia => null (global). ADMIN-only (já garantido).
  if (typeof b.candidato_escopo === "string") {
    sets.push(`candidato_escopo = $${i++}`);
    vals.push(b.candidato_escopo.trim() || null);
  }

  // Vínculo atendente ↔ números (independente dos campos do usuário).
  let mexeuAgentes = false;
  if (Array.isArray(b.agentes)) {
    await definirAgentesDoAtendente(id, b.agentes.map(Number));
    mexeuAgentes = true;
  }

  if (sets.length === 0) {
    if (mexeuAgentes) return NextResponse.json({ ok: true });
    return NextResponse.json({ erro: "Nada para atualizar." }, { status: 400 });
  }

  vals.push(id);
  await execute(`UPDATE usuarios SET ${sets.join(", ")} WHERE id = $${i}`, vals);
  return NextResponse.json({ ok: true });
}

// DELETE /api/usuarios?id= -> exclui usuário
export async function DELETE(req: NextRequest) {
  const s = exigirAdmin();
  if (!s) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });
  if (id === s.uid)
    return NextResponse.json(
      { erro: "Você não pode excluir a si mesmo." },
      { status: 400 }
    );

  const alvo = await queryOne<Usuario>("SELECT * FROM usuarios WHERE id = $1", [
    id,
  ]);
  if (!alvo)
    return NextResponse.json({ erro: "Usuário não encontrado." }, { status: 404 });
  if (await ehUltimoAdminAtivo(alvo))
    return NextResponse.json(
      { erro: "É preciso manter ao menos um administrador ativo." },
      { status: 400 }
    );

  await execute("DELETE FROM usuarios WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
