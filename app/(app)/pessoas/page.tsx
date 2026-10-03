import Link from "next/link";
import { query, Pessoa } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import ImportExport from "./ImportExport";
import BuscaPessoas from "./BuscaPessoas";
import FiltrosContatos from "./FiltrosContatos";
import TabelaContatos, { type LinhaContato } from "./TabelaContatos";
import Icon from "../../components/Icon";
import { agentesDaSessao } from "@/lib/escopo";
import { cteAtendimentoAtivo } from "@/lib/atendimentoCrm";
import { ETIQUETAS, ehEtiqueta, etiquetasValidas, FILTRO_SEM, ROTULO_SEM, sqlSemEtiqueta } from "@/lib/etiquetas";

export const dynamic = "force-dynamic";

type Linha = Pessoa & {
  autor: string | null;
  candidato: string | null;
  agente_id: number | null;
  atendente_id: number | null;
  atendente_nome: string | null;
};

// Filtro "Atendimento": conversa em andamento com alguém da equipe.
const FILTROS_ATEND = ["livre", "com", "meus"] as const;

const POR_PAGINA = 50;
const PODE_LISTAS = ["ADMIN", "COORDENACAO", "CANDIDATO"];

// Se o nome for só dígitos (número do WhatsApp), não há nome real cadastrado.
function nomeReal(nome: string | null): string | null {
  const n = (nome || "").trim();
  if (!n || /^\d+$/.test(n)) return null;
  return n;
}

export default async function PessoasPage({
  searchParams,
}: {
  searchParams: {
    candidato?: string;
    page?: string;
    q?: string;
    categoria?: string;
    cidade?: string;
    etiqueta?: string;
    atendimento?: string;
    abrir?: string;
  };
}) {
  const sessao = getSessao()!;
  const ehLider = sessao.perfil === "LIDER";
  // Atendente: só consulta os contatos dos números que atende e inicia
  // atendimento. Sem importar, exportar, cadastrar, editar ou excluir.
  const atender = sessao.perfil === "ATENDENTE";
  const candFiltro = searchParams.candidato || "";
  const catFiltro = (searchParams.categoria || "").trim();
  const cidFiltro = (searchParams.cidade || "").trim();
  // Etiqueta marcada ou "sem" (contato ainda não classificado).
  const etqFiltro =
    ehEtiqueta(searchParams.etiqueta) || searchParams.etiqueta === FILTRO_SEM ? searchParams.etiqueta! : "";
  // Quem trabalha no Atendimento vê quem está com atendente (o Líder não).
  const veAtendimento = !ehLider;
  const atdFiltro =
    veAtendimento && (FILTROS_ATEND as readonly string[]).includes(searchParams.atendimento || "")
      ? (searchParams.atendimento as (typeof FILTROS_ATEND)[number])
      : "";
  const busca = (searchParams.q || "").trim();
  const page = Math.max(1, parseInt(searchParams.page || "1") || 1);
  const offset = (page - 1) * POR_PAGINA;

  // Isolamento: candidato/equipe vinculado só vê os agentes do próprio terreno
  // (nunca os concorrentes). ADMIN vê todos.
  const meusAgentes = await agentesDaSessao(sessao);
  const bound = !ehLider && meusAgentes !== null;
  const boundIds = bound ? (meusAgentes!.length ? meusAgentes! : [-1]) : null;

  // Escopo base (sem os filtros da tela) — alimenta as opções dos filtros.
  const escopo: string[] = [];
  const escopoParams: any[] = [];
  if (ehLider) {
    escopoParams.push(String(sessao.uid));
    escopo.push(`p.criado_por = $${escopoParams.length}`);
  }
  if (bound) escopo.push(`p.agente_id IN (${boundIds!.join(",")})`);
  const escopoSql = escopo.length ? "WHERE " + escopo.join(" AND ") : "";

  // Opções dos filtros (o que existe na base que a pessoa enxerga).
  const candidatos = ehLider
    ? []
    : await query<{ id: number; candidato: string; total: number }>(
        `SELECT a.id, a.candidato, count(p.id)::int total FROM agentes a JOIN pessoas p ON p.agente_id=a.id
          ${bound ? `WHERE a.id IN (${boundIds!.join(",")})` : ""}
          GROUP BY a.id,a.candidato ORDER BY total DESC`
      );
  const categorias = await query<{ v: string; total: number }>(
    `SELECT p.categoria v, count(*)::int total FROM pessoas p ${escopoSql}
       ${escopoSql ? "AND" : "WHERE"} p.categoria IS NOT NULL AND p.categoria <> ''
      GROUP BY 1 ORDER BY total DESC LIMIT 30`,
    escopoParams
  );
  const cidades = await query<{ v: string; total: number }>(
    `SELECT p.cidade v, count(*)::int total FROM pessoas p ${escopoSql}
       ${escopoSql ? "AND" : "WHERE"} p.cidade IS NOT NULL AND p.cidade <> ''
      GROUP BY 1 ORDER BY total DESC LIMIT 60`,
    escopoParams
  );
  const contagemEtiquetas = await query<{ v: string; total: number }>(
    `SELECT e v, count(*)::int total FROM pessoas p, unnest(p.etiquetas) e ${escopoSql} GROUP BY 1`,
    escopoParams
  );
  // Conversas em andamento por contato (só o que esta sessão enxerga).
  const withAtend = veAtendimento ? `WITH ${cteAtendimentoAtivo(boundIds)}` : "";
  const joinAtend = veAtendimento ? "LEFT JOIN atrib_p ap ON ap.pessoa_id = p.id" : "";
  const contAtend = veAtendimento
    ? (
        await query<{ livre: number; com: number; meus: number }>(
          `${withAtend}
           SELECT count(*) FILTER (WHERE ap.pessoa_id IS NULL)::int livre,
                  count(*) FILTER (WHERE ap.pessoa_id IS NOT NULL)::int com,
                  count(*) FILTER (WHERE ap.atendente_id = ${Number(sessao.uid)})::int meus
             FROM pessoas p ${joinAtend} ${escopoSql}`,
          escopoParams
        )
      )[0]
    : null;
  const atendimento = contAtend
    ? [
        { v: "livre", rotulo: "Sem atendente", total: contAtend.livre },
        { v: "com", rotulo: "Com atendente", total: contAtend.com },
        { v: "meus", rotulo: "Comigo", total: contAtend.meus },
      ]
    : [];

  const semEtiqueta =
    (
      await query<{ c: number }>(
        `SELECT count(*)::int c FROM pessoas p ${escopoSql} ${escopoSql ? "AND" : "WHERE"} ${sqlSemEtiqueta("p.etiquetas")}`,
        escopoParams
      )
    )[0]?.c ?? 0;
  const etiquetas = [
    ...ETIQUETAS.map((e) => ({
      v: e.v as string,
      rotulo: e.rotulo,
      total: contagemEtiquetas.find((c) => c.v === e.v)?.total ?? 0,
    })),
    { v: FILTRO_SEM, rotulo: ROTULO_SEM, total: semEtiqueta },
  ];

  const wheres = [...escopo];
  const params = [...escopoParams];
  if (candFiltro) {
    params.push(Number(candFiltro));
    wheres.push(`p.agente_id = $${params.length}`);
  }
  if (catFiltro) {
    params.push(catFiltro);
    wheres.push(`p.categoria = $${params.length}`);
  }
  if (cidFiltro) {
    params.push(cidFiltro);
    wheres.push(`p.cidade = $${params.length}`);
  }
  if (etqFiltro === FILTRO_SEM) {
    wheres.push(sqlSemEtiqueta("p.etiquetas"));
  } else if (etqFiltro) {
    params.push(etqFiltro);
    wheres.push(`p.etiquetas @> ARRAY[$${params.length}]::text[]`);
  }
  if (atdFiltro === "livre") wheres.push("ap.pessoa_id IS NULL");
  if (atdFiltro === "com") wheres.push("ap.pessoa_id IS NOT NULL");
  if (atdFiltro === "meus") wheres.push(`ap.atendente_id = ${Number(sessao.uid)}`);
  // Busca por nome, cargo, cidade, categoria, email ou número
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
    (await query<{ c: number }>(`${withAtend} SELECT count(*)::int c FROM pessoas p ${joinAtend} ${whereSql}`, params))[0]?.c || 0;
  const totalGeral =
    (await query<{ c: number }>(`SELECT count(*)::int c FROM pessoas p ${escopoSql}`, escopoParams))[0]?.c || 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const pessoas = await query<Linha>(
    `${withAtend}
     SELECT p.*, u.nome as autor, a.candidato,
            ${veAtendimento ? "ap.atendente_id, ap.atendente_nome" : "NULL::int AS atendente_id, NULL AS atendente_nome"}
       FROM pessoas p
       LEFT JOIN usuarios u ON u.id = CASE WHEN p.criado_por ~ '^[0-9]+$' THEN p.criado_por::bigint END
       LEFT JOIN agentes a ON p.agente_id = a.id
       ${joinAtend}
       ${whereSql}
      ORDER BY p.id DESC LIMIT ${POR_PAGINA} OFFSET ${offset}`,
    params
  );

  const linhas: LinhaContato[] = pessoas.map((p) => ({
    id: p.id,
    nome: nomeReal(p.nome),
    categoria: p.categoria,
    funcao: p.funcao === "Outro" ? p.funcao_outro || "Outro" : p.funcao,
    partido: p.partido,
    cidade: p.cidade,
    regiao: p.regiao,
    bairro: p.bairro,
    whatsapp: p.whatsapp,
    email: p.email,
    instagram: p.instagram,
    observacao: p.observacao,
    foto: p.foto,
    candidato: p.candidato,
    agenteId: p.agente_id ?? null,
    autor: p.autor,
    criadoEm: p.criado_em,
    etiquetas: etiquetasValidas(p.etiquetas),
    atendenteId: p.atendente_id != null ? Number(p.atendente_id) : null,
    atendenteNome: p.atendente_nome,
  }));

  const filtrando = !!(busca || candFiltro || catFiltro || cidFiltro || etqFiltro || atdFiltro);
  const link = (pg: number) => {
    const sp = new URLSearchParams();
    if (candFiltro) sp.set("candidato", candFiltro);
    if (catFiltro) sp.set("categoria", catFiltro);
    if (cidFiltro) sp.set("cidade", cidFiltro);
    if (etqFiltro) sp.set("etiqueta", etqFiltro);
    if (atdFiltro) sp.set("atendimento", atdFiltro);
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
            <span className="page-title-num">{totalGeral.toLocaleString("pt-BR")}</span>
          </h1>
          <p className="page-sub">
            {ehLider
              ? "Pessoas que você cadastrou."
              : atender
              ? "Contatos dos números que você atende. Toque em Atender para abrir a conversa no WhatsApp."
              : "Eleitores, lideranças e apoiadores. Clique em uma linha para ver os detalhes."}
          </p>
        </div>
        {!atender && (
        <div className="page-head-acoes">
          <ImportExport />
          <Link href="/cadastro" className="btn btn-primary">
            <Icon name="plus" size={16} /> Cadastrar
          </Link>
        </div>
        )}
      </div>

      <div className="ct-toolbar">
        <BuscaPessoas />
        <FiltrosContatos
          categorias={categorias}
          cidades={cidades}
          etiquetas={etiquetas}
          candidatos={candidatos.map((c) => ({ v: String(c.id), rotulo: c.candidato, total: c.total }))}
          atendimento={atendimento}
        />
      </div>

      <p className="ct-conta">
        {filtrando
          ? `${total.toLocaleString("pt-BR")} de ${totalGeral.toLocaleString("pt-BR")} contatos`
          : `${total.toLocaleString("pt-BR")} contatos`}
        {totalPaginas > 1 && ` · página ${page} de ${totalPaginas}`}
      </p>

      {linhas.length === 0 ? (
        <div className="table-wrap">
          <div className="empty">
            {filtrando ? (
              <>
                <b>Nenhum contato com esses filtros.</b>
                <Link href="/pessoas">Limpar filtros</Link>
              </>
            ) : atender ? (
              <b>Nenhum contato nos números que você atende.</b>
            ) : (
              <>
                <b>Nenhum contato ainda.</b>
                <Link href="/cadastro">Cadastre o primeiro</Link> ou importe uma planilha.
              </>
            )}
          </div>
        </div>
      ) : (
        <TabelaContatos
          linhas={linhas}
          mostrarCandidato={!ehLider}
          podeListas={PODE_LISTAS.includes(sessao.perfil)}
          abrirId={Number(searchParams.abrir) || null}
          atender={atender}
          meuId={Number(sessao.uid)}
        />
      )}

      {totalPaginas > 1 && (
        <div className="paginacao">
          {page > 1 ? (
            <Link href={link(page - 1)} className="btn btn-ghost">
              <Icon name="chevron-left" size={16} /> Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="pag-info">
            Página {page} de {totalPaginas}
          </span>
          {page < totalPaginas ? (
            <Link href={link(page + 1)} className="btn btn-ghost">
              Próxima <Icon name="chevron-right" size={16} />
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </>
  );
}
