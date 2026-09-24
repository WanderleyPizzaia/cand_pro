"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Icon from "../../components/Icon";

type Opcao = { v: string; total: number; rotulo?: string };

// Filtros da lista de contatos: cada um é um seletor compacto que vira
// parâmetro na URL (dá para compartilhar o link já filtrado).
export default function FiltrosContatos({
  categorias,
  cidades,
  candidatos,
}: {
  categorias: Opcao[];
  cidades: Opcao[];
  candidatos: Opcao[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function definir(chave: string, valor: string) {
    const sp = new URLSearchParams(Array.from(params.entries()));
    if (valor) sp.set(chave, valor);
    else sp.delete(chave);
    sp.delete("page");
    sp.delete("abrir");
    router.replace("/pessoas" + (sp.toString() ? "?" + sp.toString() : ""));
  }

  const ativos = ["categoria", "cidade", "candidato"].filter((k) => params.get(k));

  const seletor = (chave: string, rotulo: string, opcoes: Opcao[]) => {
    if (!opcoes.length) return null;
    const atual = params.get(chave) || "";
    return (
      <label className={`filtro-sel${atual ? " ativo" : ""}`}>
        <span className="sr-only">{rotulo}</span>
        <select id={`filtro-${chave}`} value={atual} onChange={(e) => definir(chave, e.target.value)}>
          <option value="">{rotulo}: todas</option>
          {opcoes.map((o) => (
            <option key={o.v} value={o.v}>
              {o.rotulo || o.v} ({o.total})
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <div className="ct-filtros">
      {seletor("categoria", "Categoria", categorias)}
      {seletor("cidade", "Cidade", cidades)}
      {seletor("candidato", "Candidato", candidatos)}
      {ativos.length > 0 && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => {
            const sp = new URLSearchParams(Array.from(params.entries()));
            ["categoria", "cidade", "candidato", "page", "abrir"].forEach((k) => sp.delete(k));
            router.replace("/pessoas" + (sp.toString() ? "?" + sp.toString() : ""));
          }}
        >
          <Icon name="x" size={14} /> Limpar filtros
        </button>
      )}
    </div>
  );
}
