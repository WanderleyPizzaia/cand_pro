import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute, Agente, quotaEfetiva, disparosUsadosHoje, LIMITES_IA_PADRAO } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { deletarInstancia, definirWebhook } from "@/lib/evolution";
import { urlWebhookEvolution } from "@/lib/config";

export const dynamic = "force-dynamic";

function podeGerir() {
  const s = getSessao();
  if (!s || !["ADMIN", "COORDENACAO"].includes(s.perfil)) return null;
  return s;
}

// Valida o dono (usuário-candidato) de um agente.
// Retorna: null (sem dono / desvincular), o id validado, ou false (inválido).
async function validarDono(valor: any): Promise<number | null | false> {
  if (valor === undefined || valor === null || valor === "" || Number(valor) === 0)
    return null;
  const uid = Number(valor);
  if (!Number.isFinite(uid) || uid <= 0) return false;
  const existe = await queryOne<{ id: number }>(
    "SELECT id FROM usuarios WHERE id = $1",
    [uid]
  );
  return existe ? uid : false;
}

// GET -> lista agentes com métricas
export async function GET() {
  if (!podeGerir())
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  // Sem segredos: não retornar apikey/ia_key/meta_token (só flags).
  const agentes = await query<
    Omit<Agente, "apikey" | "ia_key" | "meta_token"> & {
      tem_ia: boolean;
      tem_meta_token: boolean;
    }
  >(
    `SELECT id, candidato, foto, instancia, telefone, persona, usuario_id, ativo, criado_em,
            provedor, meta_phone_id, meta_waba_id, quota_diaria, config,
            (ia_key IS NOT NULL) AS tem_ia,
            (meta_token IS NOT NULL) AS tem_meta_token
       FROM agentes ORDER BY id`
  );
  const enriquecidos = await Promise.all(
    agentes.map(async (a) => {
      const total =
        (
          await queryOne<{ c: number }>(
            "SELECT COUNT(*) c FROM mensagens WHERE agente_id = $1 AND direcao IN ('in','out')",
            [a.id]
          )
        )?.c ?? 0;
      const hoje =
        (
          await queryOne<{ c: number }>(
            `SELECT COUNT(*) c FROM mensagens
              WHERE agente_id = $1 AND direcao = 'in'
                AND (criado_em AT TIME ZONE 'America/Sao_Paulo')::date
                  = (now() AT TIME ZONE 'America/Sao_Paulo')::date`,
            [a.id]
          )
        )?.c ?? 0;
      // Cota de disparo: efetiva (própria ou padrão do provedor) e usada hoje.
      const quota = quotaEfetiva(a as any);
      const usadoHoje = await disparosUsadosHoje(a.id);
      return {
        ...a,
        totalMensagens: total,
        recebidasHoje: hoje,
        quotaEfetiva: quota,
        disparosHoje: usadoHoje,
      };
    })
  );
  return NextResponse.json(enriquecidos);
}

// POST -> cria um agente (sem id) ou atualiza um existente (com id)
export async function POST(req: NextRequest) {
  if (!podeGerir())
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json();
  const id = Number(b.id);

  // Ação em massa: ligar todos os agentes. Plug-and-play para
  // reativar a operação de uma vez. Só ADMIN/COORDENAÇÃO (já garantido acima).
  if (b.acao === "ativar_todos") {
    const n = await execute("UPDATE agentes SET ativo = 1");
    return NextResponse.json({ ok: true, ativados: n });
  }

  // Reaplica o webhook (URL já com o token obrigatório) em todas as instâncias
  // Evolution. Usado uma vez nas instâncias conectadas antes do token.
  if (b.acao === "reaplicar_webhooks") {
    const url = await urlWebhookEvolution(new URL(req.url).origin);
    // Com `id`, reaplica só naquele número (botão "reativar tempo real").
    const alvo = Number(b.id) || 0;
    const lista = await query<Agente>(
      `SELECT * FROM agentes
        WHERE provedor <> 'meta' AND instancia IS NOT NULL AND instancia <> ''
        ${alvo ? "AND id = $1" : ""}`,
      alvo ? [alvo] : []
    );
    let ok = 0;
    const falhas: string[] = [];
    for (const a of lista) {
      const r = await definirWebhook(a.instancia!, url, a.apikey);
      if (r.ok) ok++;
      else falhas.push(a.candidato);
    }
    return NextResponse.json({ ok, total: lista.length, falhas });
  }

  // Criar novo agente (candidato) - plug-and-play: conecta depois pra gerar a instância.
  if (!id) {
    const candidato = (b.candidato ?? "").toString().trim();
    if (!candidato)
      return NextResponse.json(
        { erro: "Informe o nome do candidato." },
        { status: 400 }
      );
    // Dono (usuário-candidato) opcional: vincula o agente ao login do candidato
    // para que ele conecte/gerencie o próprio WhatsApp e para escopo robusto.
    const donoId = await validarDono(b.usuario_id);
    if (donoId === false)
      return NextResponse.json({ erro: "Usuário dono inválido." }, { status: 400 });
    const novo = await queryOne<{ id: number }>(
      `INSERT INTO agentes (candidato, persona, apikey, usuario_id, ativo)
       VALUES ($1, $2, $3, $4, 0) RETURNING id`,
      [
        candidato,
        b.persona ||
          `Você é o assistente virtual de ${candidato}. Responda eleitores no WhatsApp de forma cordial, breve e prestativa. Seja sempre respeitoso e apartidário no tom.`,
        b.apikey || null,
        donoId,
      ]
    );
    return NextResponse.json({ ok: true, id: novo?.id }, { status: 201 });
  }

  // Atualização com set builder (campos secretos só quando enviados).
  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;
  const setCampo = (col: string, valor: any) => {
    sets.push(`${col} = $${i++}`);
    vals.push(valor);
  };

  setCampo("instancia", b.instancia || null);
  setCampo("telefone", b.telefone || null);
  setCampo("persona", b.persona || null);
  setCampo("ativo", b.ativo ? 1 : 0);

  // Provedor + campos Meta (não-secretos gravam sempre que enviados).
  if (typeof b.provedor === "string" && ["evolution", "meta"].includes(b.provedor))
    setCampo("provedor", b.provedor);
  if (typeof b.meta_phone_id === "string")
    setCampo("meta_phone_id", b.meta_phone_id.trim() || null);
  if (typeof b.meta_waba_id === "string")
    setCampo("meta_waba_id", b.meta_waba_id.trim() || null);
  // Cota diária de disparo (número > 0, ou vazio/0 para voltar ao padrão do provedor).
  if (b.quota_diaria !== undefined) {
    const q = Number(b.quota_diaria);
    setCampo("quota_diaria", Number.isFinite(q) && q > 0 ? Math.floor(q) : null);
  }

  // Dono (usuário-candidato): vincula/desvincula o agente ao login do candidato.
  if (b.usuario_id !== undefined) {
    const donoId = await validarDono(b.usuario_id);
    if (donoId === false)
      return NextResponse.json({ erro: "Usuário dono inválido." }, { status: 400 });
    setCampo("usuario_id", donoId);
  }

  // Limites da conversa com a IA (teto de respostas, contexto e assunto).
  // Grava dentro do config JSONB, substituindo o bloco inteiro.
  if (b.limites && typeof b.limites === "object") {
    const l = b.limites as Record<string, unknown>;
    const inteiro = (v: unknown, padrao: number, max: number) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return padrao;
      return Math.min(Math.floor(n), max);
    };
    const limites = {
      respostas_dia: inteiro(l.respostas_dia, LIMITES_IA_PADRAO.respostasDia, 200),
      historico: Math.max(2, inteiro(l.historico, LIMITES_IA_PADRAO.historico, 40)),
      assuntos: String(l.assuntos ?? "").trim().slice(0, 400),
      fora_do_escopo: String(l.fora_do_escopo ?? "").trim().slice(0, 300),
      pausa_humana_horas: inteiro(l.pausa_humana_horas, LIMITES_IA_PADRAO.pausaHumanaHoras, 720),
    };
    sets.push(`config = COALESCE(config,'{}'::jsonb) || $${i++}::jsonb`);
    vals.push(JSON.stringify({ limites }));
  }

  // Segredos (write-only): só atualizam quando vêm no corpo.
  // A chave costuma vir colada de chat/markdown com lixo em volta (crase, aspas,
  // "Bearer ", quebra de linha). Extrai só a chave — um caractere a mais dá 401.
  if (typeof b.ia_key === "string") {
    const bruto = b.ia_key.trim();
    const limpa = (bruto.match(/sk-[A-Za-z0-9_-]+/) || [])[0] || bruto;
    setCampo("ia_key", limpa || null);
  }
  if (typeof b.meta_token === "string")
    setCampo("meta_token", b.meta_token.trim() || null);

  vals.push(id);
  await execute(`UPDATE agentes SET ${sets.join(", ")} WHERE id = $${i}`, vals);

  return NextResponse.json({ ok: true });
}

// DELETE /api/agentes?id= -> exclui o agente (e a instância na Evolution).
// As mensagens ficam (FK ON DELETE SET NULL) para não perder histórico.
export async function DELETE(req: NextRequest) {
  if (!podeGerir())
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });

  const agente = await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [id]);
  if (!agente)
    return NextResponse.json({ erro: "Agente não encontrado" }, { status: 404 });

  if (agente.instancia) {
    await deletarInstancia(agente.instancia, agente.apikey); // best-effort
  }
  await execute("DELETE FROM agentes WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
