import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { buscarCidade } from "@/lib/cidades";
import { regiaoMaisProxima } from "@/lib/opcoes";
import { agentesDaSessao } from "@/lib/escopo";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // importações grandes (milhares de linhas)

// Parser de CSV (aspas duplas, escape "", quebras de linha dentro de aspas).
function parseCSV(text: string, delim: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      // ignora
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizar(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Aliases de cabeçalho -> campo interno
const ALIAS: Record<string, string> = {
  nome: "nome",
  categoria: "categoria",
  grupo: "categoria",
  funcao: "funcao",
  partido: "partido",
  cidade: "cidade",
  municipio: "cidade",
  bairro: "bairro",
  whatsapp: "whatsapp",
  whats: "whatsapp",
  telefone: "whatsapp",
  celular: "whatsapp",
  email: "email",
  "e-mail": "email",
  instagram: "instagram",
  insta: "instagram",
  observacao: "observacao",
  obs: "observacao",
};

// POST /api/pessoas/import -> recebe o CSV (texto) e cria os cadastros
export async function POST(req: NextRequest) {
  const sessao = getSessao();
  if (!sessao) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });

  const texto = await req.text();
  if (!texto.trim())
    return NextResponse.json({ erro: "Arquivo vazio." }, { status: 400 });

  // Número (agente) a vincular. Sem vínculo, o candidato NÃO vê os contatos
  // (a visão dele filtra por agente_id). Regra:
  //  - ?candidato=<id> escolhido na aba → usa esse (se o usuário tiver acesso);
  //  - senão, usuário escopado (candidato/equipe) → 1º número do escopo;
  //  - admin sem aba selecionada → sem vínculo (aparece em "Todos").
  const meus = await agentesDaSessao(sessao);
  const esc = meus && meus.length ? meus : null;
  const candParam = Number(new URL(req.url).searchParams.get("candidato")) || 0;
  let agenteId: number | null = null;
  if (candParam > 0 && (sessao.perfil === "ADMIN" || (esc && esc.includes(candParam)))) {
    agenteId = candParam;
  } else if (esc) {
    agenteId = esc[0];
  }

  // Detecta o delimitador pela 1ª linha
  const primeira = texto.split(/\r?\n/)[0] || "";
  const delim =
    (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";

  const linhas = parseCSV(texto, delim).filter((l) => l.some((c) => c.trim()));
  if (linhas.length < 2)
    return NextResponse.json(
      { erro: "CSV sem dados (precisa de cabeçalho + linhas)." },
      { status: 400 }
    );

  // Mapeia cabeçalho -> índice de campo
  const cabecalho = linhas[0].map((h) => ALIAS[normalizar(h)] ?? "");
  if (!cabecalho.includes("nome"))
    return NextResponse.json(
      { erro: 'O CSV precisa de uma coluna "nome".' },
      { status: 400 }
    );

  let inseridos = 0;
  let ignorados = 0;
  const erros: string[] = [];
  const MAX = 20000; // teto de segurança por importação
  const NCOL = 15;

  const dados = linhas.slice(1, MAX + 1);
  // 1) Monta as tuplas de valores (rápido, em memória).
  const tuplas: any[][] = [];
  for (const linha of dados) {
    const reg: Record<string, string> = {};
    cabecalho.forEach((campo, i) => {
      if (campo) reg[campo] = (linha[i] ?? "").trim();
    });
    const nome = (reg.nome ?? "").trim();
    if (!nome) { ignorados++; continue; }
    const cidadeNome = (reg.cidade ?? "").trim();
    const cidade = buscarCidade(cidadeNome);
    const lat = cidade?.lat ?? null;
    const lng = cidade?.lng ?? null;
    const regiao = lat != null && lng != null ? regiaoMaisProxima(lat, lng) : null;
    tuplas.push([
      nome, reg.categoria || null, reg.funcao || null, reg.partido || null,
      cidadeNome || null, regiao, reg.bairro || null, reg.whatsapp || null,
      reg.email || null, reg.instagram || null, reg.observacao || null,
      lat, lng, String(sessao.uid), agenteId,
    ]);
  }

  // 2) Insere em LOTES (multi-row VALUES) — poucas queries em vez de milhares.
  const CHUNK = 500;
  for (let i = 0; i < tuplas.length; i += CHUNK) {
    const bloco = tuplas.slice(i, i + CHUNK);
    const params: any[] = [];
    const valores = bloco.map((t, k) => {
      const base = k * NCOL;
      params.push(...t);
      return `(${Array.from({ length: NCOL }, (_, j) => `$${base + j + 1}`).join(",")})`;
    });
    try {
      const n = await execute(
        `INSERT INTO pessoas
          (nome, categoria, funcao, partido, cidade, regiao, bairro, whatsapp, email, instagram, observacao, lat, lng, criado_por, agente_id)
         VALUES ${valores.join(",")}`,
        params
      );
      inseridos += n ?? bloco.length;
    } catch (e: any) {
      erros.push(`Lote ${i / CHUNK + 1}: ${e.message}`);
    }
  }

  return NextResponse.json({
    inseridos,
    ignorados,
    total: dados.length,
    erros: erros.slice(0, 10),
  });
}
