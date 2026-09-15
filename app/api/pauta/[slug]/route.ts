import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute, Usuario } from "@/lib/db";
import { buscarCidade } from "@/lib/cidades";
import { regiaoMaisProxima } from "@/lib/opcoes";
import { agentesDoCandidato } from "@/lib/metas";
import { TEMAS, TIPOS, gerarProtocolo } from "@/lib/pautas";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

// CORS: o formulário/pesca roda no site da campanha (outro domínio) e posta aqui.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// POST /api/pauta/[slug] -> acolhimento PÚBLICO de pauta (sem login), vinculado ao gabinete.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = (params.slug ?? "").toLowerCase();
  const dono = await queryOne<Usuario>(
    "SELECT * FROM usuarios WHERE (lower(email) = $1 OR lower(split_part(email,'@',1)) = $1) AND ativo = 1 LIMIT 1",
    [slug]
  );
  if (!dono) return NextResponse.json({ erro: "Link inválido." }, { status: 404, headers: CORS });

  const b = await req.json().catch(() => ({}));
  const descricao = (b.descricao ?? "").toString().trim();
  if (!descricao) return NextResponse.json({ erro: "Descreva a sua pauta." }, { status: 400, headers: CORS });

  const tema = TEMAS.some((t) => t.v === b.tema) ? b.tema : "outros";
  const tipo = TIPOS.some((t) => t.v === b.tipo) ? b.tipo : "solicitacao";
  const cidadeNome = (b.cidade ?? "").toString().trim();
  const cidade = buscarCidade(cidadeNome);
  const lat = cidade?.lat ?? null;
  const lng = cidade?.lng ?? null;
  const regiao = lat != null && lng != null ? regiaoMaisProxima(lat, lng) : null;

  const agentes = await agentesDoCandidato(dono.nome, dono.id);
  const agenteId = agentes[0] ?? null;

  const nome = (b.nome || "").toString().trim() || null;
  const contato = (b.contato || "").toString().trim() || null;
  const bairro = (b.bairro || "").toString().trim() || null;

  const protocolo = gerarProtocolo(await getConfig("URNA:" + dono.nome));
  await execute(
    `INSERT INTO pautas
       (agente_id, origem, nome, contato, cidade, bairro, regiao, lat, lng, tema, tipo, titulo, descricao, criado_por, protocolo)
     VALUES ($1,'publico',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      agenteId,
      nome,
      contato,
      cidadeNome || null,
      bairro,
      regiao,
      lat,
      lng,
      tema,
      tipo,
      (b.titulo || "").toString().trim().slice(0, 160) || null,
      descricao.slice(0, 4000),
      "form-publico",
      protocolo,
    ]
  );

  // Entra no banco do candidato: cadastra/atualiza o cidadão em `pessoas`
  // (funil, mapa e dashboard). Sem apagar dado bom; dedup por WhatsApp + agente.
  try {
    const zap = (contato || "").replace(/\D/g, "");
    const temContatoZap = zap.length >= 10;
    if (agenteId && (temContatoZap || (nome && lat != null))) {
      const existente = temContatoZap
        ? await queryOne<{ id: number }>(
            `SELECT id FROM pessoas
              WHERE regexp_replace(COALESCE(whatsapp,''),'\\D','','g') = $1 AND agente_id = $2
              LIMIT 1`,
            [zap, agenteId]
          )
        : null;
      if (existente) {
        await execute(
          `UPDATE pessoas
              SET nome   = COALESCE($1, nome),
                  cidade = COALESCE(NULLIF($2,''), cidade),
                  bairro = COALESCE(NULLIF($3,''), bairro),
                  regiao = COALESCE(NULLIF($4,''), regiao),
                  lat    = COALESCE(lat, $5),
                  lng    = COALESCE(lng, $6)
            WHERE id = $7`,
          [nome, cidadeNome || "", bairro || "", regiao || "", lat, lng, existente.id]
        );
      } else {
        await execute(
          `INSERT INTO pessoas (nome, categoria, cidade, bairro, regiao, whatsapp, lat, lng, agente_id, criado_por)
           VALUES ($1, 'Pauta', $2, $3, $4, $5, $6, $7, $8, 'form-publico')`,
          [
            nome || "Sem nome",
            cidadeNome || null,
            bairro,
            regiao,
            temContatoZap ? zap : null,
            lat,
            lng,
            agenteId,
          ]
        );
      }
    }
  } catch (e) {
    console.error("pauta->pessoas:", e);
  }

  return NextResponse.json({ ok: true, protocolo }, { headers: CORS });
}
