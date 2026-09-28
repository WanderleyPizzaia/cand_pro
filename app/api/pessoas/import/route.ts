import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { buscarCidade } from "@/lib/cidades";
import { regiaoMaisProxima } from "@/lib/opcoes";
import { agentesDaSessao } from "@/lib/escopo";
import { parseCSV, detectarDelimitador, mapearCabecalho, acharCabecalho, registroDaLinha } from "@/lib/csv";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A tela manda o arquivo em partes de 1.000 linhas (cada parte cabe folgada
// nos 60 s e nos 4,5 MB da Vercel). Acima disto, recusa: arquivo grande num
// pedido só era cortado no meio e perdia o resto sem aviso.
const MAX_POR_PARTE = 2000;
const LOTE = 500;
const NCOL = 15;
const COLUNAS =
  "(nome, categoria, funcao, partido, cidade, regiao, bairro, whatsapp, email, instagram, observacao, lat, lng, criado_por, agente_id)";

type Linha = { linha: number; valores: any[] };
type Erro = { linha: number; motivo: string };

// Número para comparar duplicados: só dígitos, sem o 55 do Brasil
// ("(11) 99999-8888" e "5511999998888" são o mesmo contato).
function chaveNumero(bruto: string | null | undefined): string {
  let d = (bruto || "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 8 ? d : "";
}

// Sem número, o mesmo contato é o mesmo nome na mesma cidade.
function chaveSemNumero(nome: string, cidade: string): string {
  const n = (v: string) => v.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  return `${n(nome)}|${n(cidade)}`;
}

// Insere e, se o lote falhar, divide ao meio até isolar as linhas ruins:
// uma linha com problema não derruba mais as outras 499.
async function inserir(linhas: Linha[], erros: Erro[]): Promise<number> {
  if (!linhas.length) return 0;
  const params: any[] = [];
  const valores = linhas.map((l, k) => {
    params.push(...l.valores);
    return `(${Array.from({ length: NCOL }, (_, j) => `$${k * NCOL + j + 1}`).join(",")})`;
  });
  try {
    return (await execute(`INSERT INTO pessoas ${COLUNAS} VALUES ${valores.join(",")}`, params)) || linhas.length;
  } catch (e: any) {
    if (linhas.length === 1) {
      erros.push({ linha: linhas[0].linha, motivo: String(e?.message || e).slice(0, 140) });
      return 0;
    }
    const meio = Math.ceil(linhas.length / 2);
    return (await inserir(linhas.slice(0, meio), erros)) + (await inserir(linhas.slice(meio), erros));
  }
}

// POST /api/pessoas/import
//   JSON { cabecalho: string[], linhas: string[][], inicio: number } (a tela manda em partes)
//   ou o CSV inteiro como texto (compatibilidade; arquivos pequenos).
export async function POST(req: NextRequest) {
  const sessao = getSessao();
  if (!sessao) return NextResponse.json({ erro: "Sem sessão" }, { status: 401 });

  let cabecalhoBruto: string[] = [];
  let dados: string[][] = [];
  let inicio = 0;
  if ((req.headers.get("content-type") || "").includes("application/json")) {
    const b = await req.json().catch(() => null);
    if (!b || !Array.isArray(b.cabecalho) || !Array.isArray(b.linhas))
      return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
    cabecalhoBruto = b.cabecalho.map((c: unknown) => String(c ?? ""));
    dados = b.linhas.map((l: unknown) => (Array.isArray(l) ? l.map((c) => String(c ?? "").replace(/\u0000/g, "")) : []));
    inicio = Math.max(0, Number(b.inicio) || 0);
  } else {
    const texto = await req.text();
    if (!texto.trim()) return NextResponse.json({ erro: "Arquivo vazio." }, { status: 400 });
    const todas = parseCSV(texto, detectarDelimitador(texto));
    const h = Math.max(0, acharCabecalho(todas));
    if (todas.length < h + 2)
      return NextResponse.json({ erro: "CSV sem dados (precisa de cabeçalho + linhas)." }, { status: 400 });
    cabecalhoBruto = todas[h];
    dados = todas.slice(h + 1);
    inicio = h;
  }
  if (dados.length > MAX_POR_PARTE)
    return NextResponse.json(
      { erro: `Parte grande demais (${dados.length} linhas). Recarregue a página e importe de novo.` },
      { status: 413 }
    );

  const cabecalho = mapearCabecalho(cabecalhoBruto);
  if (!cabecalho.includes("nome"))
    return NextResponse.json(
      { erro: `Não achei a coluna do nome. Colunas lidas: ${cabecalhoBruto.slice(0, 8).map((c) => `"${c}"`).join(", ")}.` },
      { status: 400 }
    );

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

  // 1) Monta as linhas (em memória).
  let ignorados = 0;
  const candidatas: (Linha & { chave: string })[] = [];
  dados.forEach((linha, idx) => {
    const reg = registroDaLinha(cabecalho, linha);
    const nome = reg.nome ?? "";
    if (!nome) {
      ignorados++;
      return;
    }
    const cidadeNome = (reg.cidade ?? "").trim();
    const cidade = buscarCidade(cidadeNome);
    const lat = cidade?.lat ?? null;
    const lng = cidade?.lng ?? null;
    const numero = chaveNumero(reg.whatsapp);
    candidatas.push({
      linha: inicio + idx + 2, // +1 do cabeçalho, +1 porque a planilha conta do 1
      chave: numero ? numero : "sem:" + chaveSemNumero(nome, cidadeNome),
      valores: [
        nome, reg.categoria || null, reg.funcao || null, reg.partido || null,
        cidadeNome || null, lat != null && lng != null ? regiaoMaisProxima(lat, lng) : null,
        reg.bairro || null, reg.whatsapp || null, reg.email || null, reg.instagram || null,
        reg.observacao || null, lat, lng, String(sessao.uid), agenteId,
      ],
    });
  });

  // 2) Pula o número que já existe neste candidato (ou que repete no arquivo):
  //    reimportar a mesma planilha completa só o que faltou. Sem número,
  //    compara nome + cidade.
  const alvo = agenteId ? "agente_id = $2" : "agente_id IS NULL";
  const chaves = Array.from(new Set(candidatas.map((c) => c.chave).filter((k) => !k.startsWith("sem:"))));
  const existentes = new Set<string>();
  const semNumero = candidatas.filter((c) => c.chave.startsWith("sem:"));
  if (semNumero.length) {
    // Nome exato como ficou gravado (reimportar a mesma planilha); maiúscula e
    // acento o banco pode tratar diferente, então a comparação fina é aqui.
    const nomes = Array.from(new Set(semNumero.map((c) => String(c.valores[0]).trim())));
    const achados = await query<{ nome: string; cidade: string | null }>(
      `SELECT nome, cidade FROM pessoas
        WHERE ${alvo} AND regexp_replace(COALESCE(whatsapp,''),'\\D','','g') = ''
          AND trim(nome) = ANY($1::text[])`,
      agenteId ? [nomes, agenteId] : [nomes]
    );
    for (const a of achados) existentes.add("sem:" + chaveSemNumero(a.nome, a.cidade || ""));
  }
  if (chaves.length) {
    const formas = chaves.flatMap((k) => [k, "55" + k]);
    const achados = await query<{ d: string }>(
      `SELECT DISTINCT regexp_replace(COALESCE(whatsapp,''),'\\D','','g') AS d FROM pessoas
        WHERE regexp_replace(COALESCE(whatsapp,''),'\\D','','g') = ANY($1::text[])
          AND ${alvo}`,
      agenteId ? [formas, agenteId] : [formas]
    );
    for (const a of achados) existentes.add(chaveNumero(a.d));
  }
  let duplicados = 0;
  const vistos = new Set<string>();
  const novas: Linha[] = [];
  for (const c of candidatas) {
    if (existentes.has(c.chave) || vistos.has(c.chave)) {
      duplicados++;
      continue;
    }
    vistos.add(c.chave);
    novas.push(c);
  }

  // 3) Grava em lotes.
  const erros: Erro[] = [];
  let inseridos = 0;
  for (let i = 0; i < novas.length; i += LOTE) inseridos += await inserir(novas.slice(i, i + LOTE), erros);

  return NextResponse.json({
    inseridos,
    duplicados,
    ignorados,
    falhas: erros.length,
    erros: erros.slice(0, 20),
    total: dados.length,
  });
}
