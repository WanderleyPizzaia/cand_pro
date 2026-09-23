import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute, Agente } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { buscarMensagensPagina } from "@/lib/evolution";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DIAS_OK = [7, 15, 30, 60, 90];
const MAX_PAGINAS = 200; // trava de segurança

// POST /api/agentes/sincronizar { id, dias }
// Importa o histórico de mensagens da instância (últimos N dias) para o banco.
// Idempotente: dedup por wa_id (key.id do WhatsApp) - rodar 2x não duplica.
// Também preenche o texto de mensagens que ficaram vazias (mídia que o webhook
// antigo não sabia ler), sem tocar nas que já têm conteúdo.
export async function POST(req: NextRequest) {
  const s = getSessao();
  if (!s || !["ADMIN", "COORDENACAO"].includes(s.perfil))
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  const dias = DIAS_OK.includes(Number(b.dias)) ? Number(b.dias) : 30;
  if (!id) return NextResponse.json({ erro: "ID inválido" }, { status: 400 });

  const agente = await queryOne<Agente>("SELECT * FROM agentes WHERE id = $1", [id]);
  if (!agente || !agente.instancia)
    return NextResponse.json(
      { erro: "Agente sem instância de WhatsApp." },
      { status: 400 }
    );

  const cutoff = Math.floor(Date.now() / 1000) - dias * 86400;

  let inseridas = 0;
  let lidas = 0;
  let pagina = 1;
  let totalPaginas = 1;
  let parou = false;

  try {
    while (pagina <= totalPaginas && pagina <= MAX_PAGINAS) {
      const r = await buscarMensagensPagina(agente.instancia, pagina, agente.apikey);
      if (!r.ok)
        return NextResponse.json(
          { erro: r.erro || "Falha ao buscar mensagens" },
          { status: 502 }
        );
      totalPaginas = r.pages || 1;

      // Mantém só as dentro da janela de dias.
      const dentro = r.msgs.filter((m) => m.timestamp >= cutoff);
      lidas += r.msgs.length;

      if (dentro.length > 0) {
        // Insert em lote, ignorando duplicados (wa_id já existente).
        const vals: any[] = [];
        const linhas: string[] = [];
        let k = 1;
        for (const m of dentro) {
          linhas.push(
            `($${k++}, $${k++}, $${k++}, $${k++}, $${k++}, to_timestamp($${k++}), $${k++}, $${k++})`
          );
          vals.push(
            agente.id,
            m.numero,
            m.nome,
            m.fromMe ? "out" : "in",
            m.texto,
            m.timestamp,
            m.waId,
            m.status
          );
        }
        const ins = await execute(
          `INSERT INTO mensagens
             (agente_id, contato, contato_nome, direcao, texto, criado_em, wa_id, status)
           VALUES ${linhas.join(", ")}
           ON CONFLICT (wa_id) WHERE wa_id IS NOT NULL DO UPDATE
             SET texto = EXCLUDED.texto
             -- Conserta as bolhas vazias já gravadas (mídia que o webhook não
             -- sabia ler). Mensagem que já tem texto fica como está.
             WHERE mensagens.texto IS NULL OR btrim(mensagens.texto) = ''`,
          vals
        );
        inseridas += ins;
      }

      // Página já caiu abaixo do corte (mensagens vêm das mais novas p/ velhas):
      // se a página tem alguma fora da janela, as próximas só serão mais antigas.
      if (r.msgs.some((m) => m.timestamp < cutoff)) {
        parou = true;
        break;
      }
      pagina++;
    }
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    dias,
    inseridas,
    lidas,
    paginas: pagina,
    completo: parou || pagina > totalPaginas,
  });
}
