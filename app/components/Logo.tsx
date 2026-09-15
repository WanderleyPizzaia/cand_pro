// Wordmark oficial CAND PRO — padronizado em todo o sistema (login, sidebar, loading).
// "CAND" herda a cor do contexto + "PRO" em dourado (assinatura da marca).
// Abaixo, uma linha dourada fina fecha a marca. `flag` é mantido por
// compatibilidade de chamadas antigas (não tem efeito).

export default function Logo({
  size = 20,
}: {
  size?: number;
  flag?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: Math.max(5, size * 0.26),
      }}
    >
      <span
        style={{
          fontWeight: 800,
          fontSize: size,
          letterSpacing: size > 28 ? "1px" : "0.3px",
          lineHeight: 1,
          color: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        CAND<span style={{ color: "var(--brand)" }}> PRO</span>
      </span>
      <span
        aria-hidden="true"
        style={{
          height: Math.max(2, size * 0.09),
          width: "42%",
          minWidth: 40,
          borderRadius: 3,
          background:
            "linear-gradient(90deg, var(--brand) 0%, var(--accent-2) 65%, transparent 100%)",
        }}
      />
    </span>
  );
}
