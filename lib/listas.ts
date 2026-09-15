import { query, execute } from "./db";
import { normalizarNumero } from "./evolution";
import { buscarCidade } from "./cidades";
import { regiaoMaisProxima } from "./opcoes";

// ============================================================
// Importação INTELIGENTE de contatos para uma lista de disparo.
// - Normaliza o telefone (DDI 55) e usa os dígitos como chave.
// - DEDUPLICA: se já existe um contato com aquele telefone NAQUELE número
//   (agente), reaproveita em vez de criar duplicado; senão cria.
// - Geolocaliza pela cidade (entra no mapa) e vincula à lista.
// Retorna um resumo honesto do que entrou.
// ============================================================

// Parser de CSV robusto (aspas duplas, escape "", quebras dentro de aspas).
export function parseCSV(text: string, delim: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\r") { /* ignora */ }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function norm(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const ALIAS: Record<string, string> = {
  nome: "nome", contato: "nome",
  categoria: "categoria", grupo: "categoria",
  funcao: "funcao", partido: "partido",
  cidade: "cidade", municipio: "cidade", bairro: "bairro",
  whatsapp: "whatsapp", whats: "whatsapp", telefone: "whatsapp",
  celular: "whatsapp", fone: "whatsapp", numero: "whatsapp",
  email: "email", "e-mail": "email",
  instagram: "instagram", insta: "instagram",
  observacao: "observacao", obs: "observacao",
};

export type ResumoImport = {
  total: number;       // linhas de dados
  novos: number;       // contatos criados
  reaproveitados: number; // já existiam (dedup) e foram vinculados
  jaNaLista: number;   // já eram membros da lista
  semTelefone: number; // linhas sem WhatsApp válido (ignoradas)
  erros: string[];
};

// Importa o CSV (texto) para a lista. `agenteId` é o número dono da lista.
export async function importarCSV(
  listaId: number,
  agenteId: number,
  texto: string,
  criadoPor: string
): Promise<ResumoImport> {
  const primeira = texto.split(/\r?\n/)[0] || "";
  const delim =
    (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";

  const linhas = parseCSV(texto, delim).filter((l) => l.some((c) => c.trim()));
  if (linhas.length < 2) throw new Error("CSV sem dados (cabeçalho + linhas).");

  const cabecalho = linhas[0].map((h) => ALIAS[norm(h)] ?? "");
  if (!cabecalho.includes("whatsapp"))
    throw new Error('O CSV precisa de uma coluna de telefone (whatsapp/telefone/celular).');

  const r: ResumoImport = {
    total: 0, novos: 0, reaproveitados: 0, jaNaLista: 0, semTelefone: 0, erros: [],
  };
  const MAX = 5000;
  const dados = linhas.slice(1, MAX + 1);
  r.total = dados.length;

  // 1) Normaliza tudo em memória e deduplica por dígitos DENTRO do arquivo.
  type Item = { dig: string; wpp: string; nome: string; cidade: string; categoria: string; obs: string };
  const porDig = new Map<string, Item>();
  for (const linha of dados) {
    const reg: Record<string, string> = {};
    cabecalho.forEach((campo, i) => { if (campo) reg[campo] = (linha[i] ?? "").trim(); });
    const wpp = normalizarNumero(reg.whatsapp || "");
    const dig = wpp.replace(/\D/g, "");
    if (!dig || dig.length < 12) { r.semTelefone++; continue; }
    if (porDig.has(dig)) continue; // duplicado no próprio arquivo
    porDig.set(dig, {
      dig, wpp,
      nome: (reg.nome || "").trim() || dig,
      cidade: reg.cidade || "",
      categoria: reg.categoria || "",
      obs: reg.observacao || "",
    });
  }
  const itens = [...porDig.values()];
  if (itens.length === 0) return r;

  // 2) Busca em UMA query quem já existe (por dígitos). Prioriza o vínculo ao agente.
  const digs = itens.map((i) => i.dig);
  const existentes = await query<{ id: number; dig: string; agente_id: number | null }>(
    `SELECT id, regexp_replace(COALESCE(whatsapp,''),'\\D','','g') AS dig, agente_id
       FROM pessoas
      WHERE regexp_replace(COALESCE(whatsapp,''),'\\D','','g') = ANY($1::text[])`,
    [digs]
  );
  const idPorDig = new Map<string, number>();
  for (const e of existentes) {
    const atual = idPorDig.get(e.dig);
    // Prefere o registro já vinculado a ESTE agente; senão o primeiro.
    if (atual == null || e.agente_id === agenteId) idPorDig.set(e.dig, e.id);
  }

  const novos = itens.filter((i) => !idPorDig.has(i.dig));
  r.reaproveitados = itens.length - novos.length;

  // 3) Insere os novos em LOTE (multi-row VALUES), em blocos.
  const TAM = 500;
  for (let i = 0; i < novos.length; i += TAM) {
    const lote = novos.slice(i, i + TAM);
    const vals: string[] = [];
    const params: any[] = [];
    lote.forEach((it) => {
      const c = buscarCidade(it.cidade);
      const lat = c?.lat ?? null;
      const lng = c?.lng ?? null;
      const regiao = lat != null && lng != null ? regiaoMaisProxima(lat, lng) : null;
      const b = params.length;
      params.push(
        it.nome, it.categoria || null, it.cidade || null, regiao,
        it.wpp, it.obs || null, lat, lng, lat != null ? "cidade" : null,
        agenteId, criadoPor
      );
      vals.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`
      );
    });
    const inseridos = await query<{ id: number; dig: string }>(
      `INSERT INTO pessoas
         (nome, categoria, cidade, regiao, whatsapp, observacao, lat, lng, geo_origem, agente_id, criado_por)
       VALUES ${vals.join(",")}
       RETURNING id, regexp_replace(COALESCE(whatsapp,''),'\\D','','g') AS dig`,
      params
    );
    for (const ins of inseridos) idPorDig.set(ins.dig, ins.id);
    r.novos += inseridos.length;
  }

  // 4) Vincula todos à lista em LOTE (ON CONFLICT conta quem já era membro).
  const pessoaIds = itens.map((i) => idPorDig.get(i.dig)).filter((x): x is number => !!x);
  let vinculados = 0;
  for (let i = 0; i < pessoaIds.length; i += TAM) {
    const lote = pessoaIds.slice(i, i + TAM);
    const vals = lote.map((_, k) => `($1,$${k + 2})`).join(",");
    const add = await execute(
      `INSERT INTO lista_membros (lista_id, pessoa_id) VALUES ${vals}
       ON CONFLICT DO NOTHING`,
      [listaId, ...lote]
    );
    vinculados += add;
  }
  r.jaNaLista = pessoaIds.length - vinculados;
  return r;
}

// Lista com contadores (membros e quantos têm WhatsApp válido).
export async function listarComContadores(agenteIds: number[] | null) {
  const esc = agenteIds ? ` AND l.agente_id IN (${agenteIds.join(",")})` : "";
  return query(
    `SELECT l.id, l.nome, l.descricao, l.agente_id, a.candidato AS agente_nome,
            to_char(l.criado_em,'YYYY-MM-DD HH24:MI') AS criado_em,
            COUNT(m.pessoa_id)::int AS membros,
            COUNT(m.pessoa_id) FILTER (
              WHERE p.whatsapp IS NOT NULL AND p.whatsapp <> ''
            )::int AS com_whatsapp
       FROM listas l
       LEFT JOIN agentes a ON a.id = l.agente_id
       LEFT JOIN lista_membros m ON m.lista_id = l.id
       LEFT JOIN pessoas p ON p.id = m.pessoa_id
      WHERE 1=1 ${esc}
      GROUP BY l.id, l.nome, l.descricao, l.agente_id, a.candidato, l.criado_em
      ORDER BY l.criado_em DESC`
  );
}
