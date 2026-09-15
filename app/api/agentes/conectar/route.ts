import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute, Agente } from "@/lib/db";
import { getSessao, Sessao } from "@/lib/auth";
import { urlWebhookEvolution } from "@/lib/config";
import {
  conectarInstancia,
  criarInstancia,
  definirConfiguracoes,
  definirWebhook,
  deletarInstancia,
  estadoInstancia,
  buscarFotoPerfil,
  slugInstancia,
} from "@/lib/evolution";

export const dynamic = "force-dynamic";

// Autoriza gestores (ADMIN/COORDENACAO) em qualquer agente; e o próprio
// candidato apenas no SEU agente (usuario_id = uid). Retorna o agente.
async function autorizarAgente(
  s: Sessao | null,
  id: number
): Promise<{ agente?: Agente; erro?: string; status?: number }> {
  if (!s) return { erro: "Acesso negado", status: 403 };
  const agente = await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [id]);
  if (!agente) return { erro: "Agente não encontrado", status: 404 };
  const ehGestor = ["ADMIN", "COORDENACAO"].includes(s.perfil);
  const ehDono = agente.usuario_id === s.uid;
  if (!ehGestor && !ehDono) return { erro: "Acesso negado", status: 403 };
  return { agente };
}

// POST /api/agentes/conectar { id }
// Inicia a conexão de WhatsApp de um agente e devolve o QR Code.
// Se o agente ainda não tem instância, cria uma (nome derivado do candidato)
// e grava no banco - assim dá pra conectar de dentro do próprio WhatsApp.
export async function POST(req: NextRequest) {
  const s = getSessao();
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });

  const auth = await autorizarAgente(s, id);
  if (!auth.agente)
    return NextResponse.json({ erro: auth.erro }, { status: auth.status });
  const agente = auth.agente;

  let instancia = agente.instancia;

  // Sem instância ainda -> cria uma e persiste.
  // CRIAR exige a chave GLOBAL do servidor: a apikey de uma instância não tem
  // permissão para criar outra (dava 401 e virava "chave expirou" na tela).
  if (!instancia) {
    instancia = slugInstancia(agente.candidato) || `agente-${agente.id}`;
    const c = await criarInstancia(instancia, null);
    if (!c.ok)
      return NextResponse.json(
        { erro: c.erro || "Falha ao criar instância" },
        { status: 502 }
      );
    await execute("UPDATE agentes SET instancia = $1 WHERE id = $2", [
      instancia,
      id,
    ]);
  }

  // Garante webhook + configuração padrão (baixar histórico, ignorar grupos,
  // sempre online) em toda conexão. Best-effort: não bloqueia o QR.
  try {
    const origin = new URL(req.url).origin;
    await definirWebhook(instancia, await urlWebhookEvolution(origin), agente.apikey);
    await definirConfiguracoes(instancia, agente.apikey);
  } catch {
    /* não bloqueia a conexão */
  }

  let conn = await conectarInstancia(instancia, agente.apikey);

  // Auto-cura: a instância consta no banco mas sumiu do servidor Evolution
  // (apagada por fora). Em vez de dar erro, recria e tenta de novo — é o que
  // "plug-and-play" significa para quem está do outro lado da tela.
  if (!conn.ok && /não existe|does not exist|404/i.test(conn.erro || "")) {
    const nova = slugInstancia(agente.candidato) || `agente-${agente.id}`;
    const c = await criarInstancia(nova, null); // chave global: a da instância morreu junto
    if (c.ok) {
      instancia = nova;
      await execute("UPDATE agentes SET instancia = $1, apikey = NULL WHERE id = $2", [
        nova,
        id,
      ]);
      try {
        const origin = new URL(req.url).origin;
        await definirWebhook(nova, await urlWebhookEvolution(origin), null);
        await definirConfiguracoes(nova, null);
      } catch {
        /* não bloqueia a conexão */
      }
      conn = await conectarInstancia(nova, null);
    }
  }

  if (!conn.ok)
    return NextResponse.json(
      { erro: conn.erro || "Falha ao gerar QR" },
      { status: 502 }
    );

  return NextResponse.json({
    ok: true,
    instancia,
    qr: conn.qr,
    pairingCode: conn.pairingCode,
  });
}

// GET /api/agentes/conectar?id= -> só checa o estado (usado no polling do modal)
export async function GET(req: NextRequest) {
  const s = getSessao();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });

  const auth = await autorizarAgente(s, id);
  if (!auth.agente)
    return NextResponse.json({ erro: auth.erro }, { status: auth.status });

  if (!auth.agente.instancia)
    return NextResponse.json({ state: "sem-instancia" });

  const r = await estadoInstancia(auth.agente.instancia, auth.agente.apikey);

  // Acabou de conectar e ainda não tem foto? Puxa a do próprio número, que é
  // o que o WhatsApp mostra. Best-effort: nunca atrapalha o polling do status.
  if (r.state === "open" && !auth.agente.foto && auth.agente.telefone) {
    try {
      const f = await buscarFotoPerfil(
        auth.agente.instancia,
        auth.agente.telefone,
        auth.agente.apikey
      );
      if (f) await execute("UPDATE agentes SET foto = $1 WHERE id = $2", [f, id]);
    } catch {
      /* foto é enfeite */
    }
  }

  return NextResponse.json({ state: r.state });
}

// DELETE /api/agentes/conectar?id= -> exclui a instância na Evolution
// (logout + delete) e desvincula do agente no banco. Plug-and-play.
export async function DELETE(req: NextRequest) {
  const s = getSessao();
  if (!s || !["ADMIN", "COORDENACAO"].includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });

  const agente = await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [id]);
  if (!agente)
    return NextResponse.json({ erro: "Agente não encontrado" }, { status: 404 });
  if (!agente.instancia)
    return NextResponse.json({ ok: true, jaRemovida: true });

  const d = await deletarInstancia(agente.instancia, agente.apikey);
  if (!d.ok)
    return NextResponse.json(
      { erro: d.erro || "Falha ao excluir instância" },
      { status: 502 }
    );

  // Desvincula no banco (mantém o agente e o histórico de mensagens).
  await execute(
    "UPDATE agentes SET instancia = NULL, ativo = 0 WHERE id = $1",
    [id]
  );
  return NextResponse.json({ ok: true });
}
