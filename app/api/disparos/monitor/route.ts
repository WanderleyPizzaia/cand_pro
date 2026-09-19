import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { agentesDaSessao } from "@/lib/escopo";

export const dynamic = "force-dynamic";

// Monitoramento dos disparos: por campanha calcula enviados, entregues (✓✓),
// lidos (✓✓ azul) e QUANTOS RESPONDERAM (contatos que mandaram mensagem de volta
// depois do disparo). Só ADMIN/COORDENAÇÃO.
export async function GET() {
  const s = getSessao();
  if (!s || !["ADMIN", "COORDENACAO", "CANDIDATO"].includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  // Isolamento: coordenação vinculada só monitora as campanhas do candidato dela.
  const meus = await agentesDaSessao(s);
  const filtroCand = meus
    ? `WHERE c.agente_id IN (${(meus.length ? meus : [-1]).join(",")})`
    : "";

  const linhas = await query(
    `SELECT
        c.id, c.titulo, c.status, c.total, c.enviados, c.falhas,
        to_char(c.criado_em,'DD/MM HH24:MI') AS criado_fmt,
        to_char(c.agendado_para,'DD/MM HH24:MI') AS agendado_fmt,
        a.candidato AS agente_nome,
        u.nome AS responsavel,
        (SELECT COUNT(*) FROM mensagens m
           WHERE m.campanha_id = c.id AND m.direcao = 'out') AS out_real,
        (SELECT COUNT(*) FROM mensagens m
           WHERE m.campanha_id = c.id AND m.status IN ('delivered','read')) AS entregues,
        (SELECT COUNT(*) FROM mensagens m
           WHERE m.campanha_id = c.id AND m.direcao = 'out' AND m.status = 'sent') AS aguardando,
        (SELECT COUNT(*) FROM mensagens m
           WHERE m.campanha_id = c.id AND m.status = 'read') AS lidos,
        (SELECT COUNT(DISTINCT m.contato) FROM mensagens m
           WHERE m.campanha_id = c.id AND m.direcao = 'out'
             AND EXISTS (
               SELECT 1 FROM mensagens r
                WHERE r.agente_id = c.agente_id AND r.contato = m.contato
                  AND r.direcao = 'in' AND r.criado_em > c.criado_em
             )) AS responderam
       FROM campanhas c
       LEFT JOIN agentes a ON a.id = c.agente_id
       LEFT JOIN usuarios u ON u.id::text = c.criado_por
      ${filtroCand}
      ORDER BY c.id DESC
      LIMIT 30`
  );

  // Resumo do topo.
  const resumo = (await query(
    `SELECT
        COUNT(*) FILTER (WHERE status = 'agendada') AS agendadas,
        COALESCE(SUM(enviados),0) AS enviados_total,
        COUNT(*) FILTER (WHERE (criado_em AT TIME ZONE 'America/Sao_Paulo')::date
              = (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS campanhas_hoje
       FROM campanhas c ${filtroCand}`
  ))[0];

  return NextResponse.json({ campanhas: linhas, resumo });
}
