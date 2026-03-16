interface BaccaratHeaderProps {
  result: "player" | "banker" | "tie" | null
  bScore: number
  pScore: number
}

export function BaccaratHeader({ result, bScore, pScore }: BaccaratHeaderProps) {
  const resultLabel =
    result === "banker" ? "BANKER WIN" :
    result === "player" ? "PLAYER WIN" :
    result === "tie"    ? "TIE"        : null

  const resultColor =
    result === "banker" ? "#ef4444" :
    result === "player" ? "#3b82f6" :
    result === "tie"    ? "#22c55e" : "#3b82f6"

  const resultBg =
    result === "banker" ? "rgba(239,68,68,0.18)" :
    result === "player" ? "rgba(59,130,246,0.25)" :
    result === "tie"    ? "rgba(34,197,94,0.18)"  : "rgba(59,130,246,0.25)"

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "20px 20px",
        minHeight: 72,
        background: "rgba(5,13,10,0.7)",
        borderRadius: 10,
        border: "1px solid rgba(212,175,55,0.12)",
      }}
    >
      {/* 좌측: 타이틀 + 뱃지 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#d4af37",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            margin: 0,
            lineHeight: 1,
          }}
        >
          BACCARAT
        </h1>
        <div
          style={{
            fontSize: 10,
            color: "rgba(212,175,55,0.55)",
            border: "1px solid rgba(212,175,55,0.25)",
            padding: "3px 9px",
            borderRadius: 5,
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
          }}
        >
          BTC 끝자리 기반
        </div>
      </div>

      {/* 우측: 결과 뱃지 + 스코어 */}
      {resultLabel && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.1em",
              color: "#ffffff",
              background: resultBg,
              border: `1px solid ${resultColor}55`,
              padding: "4px 12px",
              borderRadius: 6,
              whiteSpace: "nowrap",
            }}
          >
            {resultLabel}
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#ef4444" }}>{bScore}</span>
            <span style={{ fontSize: 13, color: "rgba(212,175,55,0.35)", fontWeight: 400 }}>:</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#3b82f6" }}>{pScore}</span>
          </span>
        </div>
      )}
    </div>
  )
}
