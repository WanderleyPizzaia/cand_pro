import Link from "next/link";
import { query, Pessoa } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import ImportExport from "./ImportExport";
import PessoaAcoes from "./PessoaAcoes";
import BuscaPessoas from "./BuscaPessoas";
import Icon from "../../components/Icon";
import FotoPessoa from "../../components/FotoPessoa";

export const dynamic = "force-dynamic";

type Linha = Pessoa & {
  autor: string | null;
  candidato: string | null;
  agente_id: number | null;
};

const POR_PAGINA = 48;

function formatFone(w: string | null) {
  const d = (w || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) {
    const ddd = d.slice(2, 4);
    const n = d.slice(4);
    const meio = n.length > 8 ? n.slice(0, 5) : n.slice(0, 4);
    const fim = n.length > 8 ? n.slice(5) : n.slice(4);
    return `(${ddd}) ${meio}-${fim}`;
  }
  return w || "";
}

// Se o nome for só dígitos (número do WhatsApp), retorna null - sem nome real cadastrado
function nomeReal(nome: string | null): string | null {
  const n = (nome || "").trim();
  if (!n || /^\d+$/.test(n)) return null;
  return n;
}

export default async function PessoasPage({
  searchParams,
}: {
  searchParams: { candidato?: string; page?: string; q?: string };
}) {
  const sessao = getSessao()!;
  const ehLider = sessao.perfil === "LIDER";
  const candFiltro = searchParams.candidato || "";
  const busca = (searchParams.q || "").trim();
  const page = Math.max(1, parseInt(searchParams.page || "1") || 1);
  const offset = (page - 1) * POR_PAGINA;

  // Isolamento: candidato/equipe vinculado só vê os agentes do próprio terreno
  // (nunca os concorrentes). ADMIN vê todos.
  const bound = sessao.perfil !== "ADMIN" && !ehLider && !!sessao.escopoAgentes;
  const boundIds = bound ? (sessao.escopoAgentes!.length ? sessao.escopoAgentes! : [-1]) : null;

  // Seletor de candidatos: lider não vê; bound vê SÓ os seus; admin vê todos.
  const candidatos = ehLider
    ? []
    : await query<{ id: number; candidato: string; total: number }>(
        `SELECT a.id, a.candidato, count(p.id)::int total FROM agentes a JOIN pessoas p ON p.agente_id=a.id
          ${bound ? `WHERE a.id IN (${boundIds!.join(",")})` : ""}
          GROUP BY a.id,a.candidato ORDER BY total DESC`
      );

  const wheres: string[] = [];
  const params: any[] = [];
  if (ehLider) {
    params.push(String(sessao.uid));
    wheres.push(`p.criado_por = $${params.length}`);
  }
  if (candFiltro) {
    params.push(Number(candFiltro));
    wheres.push(`p.agente_id = $${params.length}`);
  }
  // Isolamento: candidato/equipe vinculado vê só os agentes do seu terreno.
  if (bound) {
    wheres.push(`p.agente_id IN (${boundIds!.join(",")})`);
  }
  // Busca dinâmica por nome, cargo, cidade, categoria, email ou número
  // (o número ignora espaços/traços: compara só os dígitos).
  if (busca) {
    params.push(`%${busca}%`);
    const n = params.length;
    let cond = `(p.nome ILIKE $${n} OR p.funcao ILIKE $${n} OR p.funcao_outro ILIKE $${n} OR p.cidade ILIKE $${n} OR p.categoria ILIKE $${n} OR p.email ILIKE $${n} OR p.bairro ILIKE $${n}`;
    const digitos = busca.replace(/\D/g, "");
    if (digitos.length >= 3) {
      params.push(`%${digitos}%`);
      cond += ` OR regexp_replace(COALESCE(p.whatsapp,''),'\\D','','g') ILIKE $${params.length}`;
    }
    cond += ")";
    wheres.push(cond);
  }
  const whereSql = wheres.length ? "WHERE " + wheres.join(" AND ") : "";

  const total =
    (await query<{ c: number }>(`SELECT count(*)::int c FROM pessoas p ${whereSql}`, params))[0]?.c || 0;
  const totalGeral = ehLider
    ? total
    : bound
    ? (await query<{ c: number }>(`SELECT count(*)::int c FROM pessoas WHERE agente_id IN (${boundIds!.join(",")})`))[0]?.c || 0
    : (await query<{ c: number }>("SELECT count(*)::int c FROM pessoas"))[0]?.c || 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const base =
    "SELECT p.*, u.nome as autor, a.candidato FROM pessoas p " +
    // Cast seguro: criado_por pode não ser numérico; só converte quando é.
    "LEFT JOIN usuarios u ON u.id = CASE WHEN p.criado_por ~ '^[0-9]+$' THEN p.criado_por::bigint END " +
    "LEFT JOIN agentes a ON p.agente_id = a.id ";
  // Prioriza quem TEM foto (para saber com quem se está falando), depois mais recentes.
  const pessoas = await query<Linha>(
    `${base} ${whereSql} ORDER BY (p.foto IS NOT NULL) DESC, p.id DESC LIMIT ${POR_PAGINA} OFFSET ${offset}`,
    params
  );

  const link = (cand: string, pg: number) => {
    const sp = new URLSearchParams();
    if (cand) sp.set("candidato", cand);
    if (busca) sp.set("q", busca);
    if (pg > 1) sp.set("page", String(pg));
    const s = sp.toString();
    return "/pessoas" + (s ? "?" + s : "");
  };

  return (
    <>
      <div className="page-head">
        <div className="page-head-txt">
          <h1 className="page-title">
            <Icon name="users" /> Contatos
          </h1>
          <p className="page-sub">
            {total} pessoa(s)
            {busca ? ` · busca "${busca}"` : ehLider ? " · seus cadastros" : candFiltro ? " · filtrado" : " na base"}
          </p>
        </div>
        <div className="page-head-acoes">
          <ImportExport />
          <Link href="/cadastro" className="btn btn-primary">
            <Icon name="plus" size={16} /> Cadastrar
          </Link>
        </div>
      </div>

      {!ehLider && candidatos.length > 0 && (
        <div className="map-tabs">
          <Link href={link("", 1)} className={`map-tab${!candFiltro ? " ativo" : ""}`}>
            Todos ({totalGeral})
          </Link>
          {candidatos.map((c) => (
            <Link
              key={c.id}
              href={link(String(c.id), 1)}
              className={`map-tab${candFiltro === String(c.id) ? " ativo" : ""}`}
            >
              {c.candidato} ({c.total})
            </Link>
          ))}
        </div>
      )}

      <BuscaPessoas />

      {pessoas.length === 0 ? (
        <div className="table-wrap">
          <div className="empty">
            {busca ? `Nenhum contato para "${busca}".` : `Nenhum cadastro ${candFiltro ? "neste filtro" : "ainda"}.`}{" "}
            {!candFiltro && !busca && <Link href="/cadastro">Cadastre o primeiro →</Link>}
          </div>
        </div>
      ) : (
        <>
          <div className="pessoa-grid">
            {pessoas.map((p) => (
              <div key={p.id} className="pessoa-card">
                {(() => {
                  const nome = nomeReal(p.nome);
                  const inicial = nome ? nome.charAt(0).toUpperCase() : "?";
                  const display = nome || "Sem nome";
                  return (
                    <>
                      <div className="pessoa-foto">
                        <FotoPessoa src={p.foto} nome={display} />
                        {p.categoria && <span className="pessoa-selo">{p.categoria}</span>}
                      </div>
                      <div
                        className="pessoa-nome"
                        style={nome ? undefined : { color: "var(--muted)", fontStyle: "italic" }}
                      >
                        {display}
                      </div>
                      {p.whatsapp && (
                        <div className="pessoa-meta">{formatFone(p.whatsapp)}</div>
                      )}
                      {p.funcao && (
                        <div className="pessoa-meta" style={{ color: "var(--accent)", fontWeight: 600 }}>
                          {p.funcao === "Outro" ? p.funcao_outro || "Outro" : p.funcao}
                        </div>
                      )}
                    </>
                  );
                })()}
                {(p.cidade || p.regiao) && (
                  <div className="pessoa-local">
                    <Icon name="map-pin" size={14} />
                    {[p.cidade, p.regiao].filter(Boolean).join(" · ")}
                  </div>
                )}
                {p.candidato ? (
                  <div className="pessoa-cand">{p.candidato}</div>
                ) : (
                  !ehLider && p.autor && <div className="pessoa-autor">por {p.autor}</div>
                )}
                <PessoaAcoes
                  id={p.id}
                  numero={(p.whatsapp || "").replace(/\D/g, "")}
                  agenteId={p.agente_id ?? null}
                  nome={nomeReal(p.nome) || "Sem nome"}
                />
              </div>
            ))}
          </div>
          {totalPaginas > 1 && (
            <div className="paginacao">
              {page > 1 ? (
                <Link href={link(candFiltro, page - 1)} className="btn btn-ghost">
                  ← Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="pag-info">
                Página {page} de {totalPaginas}
              </span>
              {page < totalPaginas ? (
                <Link href={link(candFiltro, page + 1)} className="btn btn-ghost">
                  Próxima →
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
