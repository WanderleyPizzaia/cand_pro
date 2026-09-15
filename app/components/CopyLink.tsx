"use client";

import { useEffect, useState } from "react";

// Mostra a URL publica completa e um botao de copiar.
export default function CopyLink({
  path,
  compact = false,
}: {
  path: string;
  compact?: boolean;
}) {
  const [url, setUrl] = useState(path);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setUrl(window.location.origin + path);
  }, [path]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // fallback simples
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  if (compact) {
    return (
      <button className="btn-copiar" style={{ padding: "6px 12px" }} onClick={copiar}>
        {copiado ? "Copiado!" : "Copiar link"}
      </button>
    );
  }

  return (
    <div className="link-row">
      <input readOnly value={url} onFocus={(e) => e.target.select()} />
      <button className="btn-copiar" onClick={copiar}>
        {copiado ? "✓ Copiado!" : "Copiar"}
      </button>
    </div>
  );
}
