"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "../../components/Icon";

// Busca de contatos (nome, cargo, cidade, categoria, número). Server-side:
// navega para /pessoas?q=... com debounce, preservando o filtro de candidato.
export default function BuscaPessoas() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");

  useEffect(() => {
    const atual = params.get("q") || "";
    const t = setTimeout(() => {
      if (q.trim() === atual) return;
      const sp = new URLSearchParams(Array.from(params.entries()));
      if (q.trim()) sp.set("q", q.trim());
      else sp.delete("q");
      sp.delete("page"); // nova busca volta pra página 1
      router.replace("/pessoas" + (sp.toString() ? "?" + sp.toString() : ""));
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="busca-pessoas">
      <Icon name="search" size={16} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nome, cargo, cidade ou número…"
        aria-label="Buscar contato"
      />
      {q && (
        <button type="button" onClick={() => setQ("")} aria-label="Limpar">
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}
