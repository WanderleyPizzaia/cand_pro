"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Ações por contato no Cadastro: ir para a conversa do WhatsApp, editar e excluir.
export default function PessoaAcoes({
  id,
  numero,
  agenteId,
  nome,
}: {
  id: number;
  numero: string; // só dígitos (vazio se não houver WhatsApp)
  agenteId: number | null;
  nome: string;
}) {
  const router = useRouter();
  const [excluindo, setExcluindo] = useState(false);

  async function excluir() {
    if (!confirm(`Excluir o cadastro de ${nome}? Esta ação não pode ser desfeita.`))
      return;
    setExcluindo(true);
    const r = await fetch(`/api/pessoas?id=${id}`, { method: "DELETE" });
    if (r.ok) router.refresh();
    else setExcluindo(false);
  }

  const conversaHref = numero
    ? `/inbox?contato=${numero}${agenteId ? `&agente=${agenteId}` : ""}`
    : null;

  return (
    <div className="pessoa-acoes">
      {conversaHref && (
        <Link className="pa-btn pa-conversa" href={conversaHref} title="Abrir conversa no WhatsApp">
          Conversa <span aria-hidden>›</span>
        </Link>
      )}
      <Link className="pa-btn" href={`/cadastro?id=${id}`} title="Editar cadastro">
        Editar
      </Link>
      <button
        className="pa-btn pa-excluir"
        onClick={excluir}
        disabled={excluindo}
        title="Excluir cadastro"
      >
        {excluindo ? "…" : "Excluir"}
      </button>
    </div>
  );
}
