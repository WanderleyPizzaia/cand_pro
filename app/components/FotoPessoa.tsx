"use client";

import { useState } from "react";

type Props = {
  src: string | null;
  nome: string;
  size?: number;
};

export default function FotoPessoa({ src, nome, size = 64 }: Props) {
  const [erro, setErro] = useState(false);
  const inicial = nome && nome !== "Sem nome" ? nome.charAt(0).toUpperCase() : "?";

  if (src && !erro) {
    return (
      <img
        src={src}
        alt={nome}
        referrerPolicy="no-referrer"
        style={{ width: size, height: size, objectFit: "cover", borderRadius: "50%" }}
        onError={() => setErro(true)}
      />
    );
  }

  return <span className="pessoa-inicial">{inicial}</span>;
}
