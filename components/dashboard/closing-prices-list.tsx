"use client"

import { useEffect, useState } from "react"

const PLAYER_COLOR = "#60a5fa"
const BANKER_COLOR = "#ef4444"
const TIE_COLOR    = "#22c55e"

function ScoreCircles({ bDisplay, pDisplay, result }: {
  bDisplay: number | null; pDisplay: number | null; result: "player" | "banker" | "tie" | null
}) {
  if (bDisplay === null || pDisplay === null) {
    return <span style={{ color: "rgba(212,175,55,0.4)", fontSize: 10 }}>—</span>
  }
  const isTie = result === "tie"
  const bWin  = result === "banker"
  const pWin  = result === "player"
  const bColor = bWin ? BANKER_COLOR : isTie ? TIE_COLOR : "rgba(212,175,55,0.25)"
  const pColor = pWin ? PLAYER_COLOR : isTie ? TIE_COLOR : "rgba(212,175,55,0.25)"
  const bFill  = bWin ? `${BANKER_COLOR}30` : isTie ? `${TIE_COLOR}18` : "transparent"
  const pFill  = pWin ? `${PLAYER_COLOR}30` : isTie ? `${TIE_COLOR}18` : "transparent"
  const bText  = bWin ? BANKER_COLOR : isTie ? TIE_COLOR : "rgba(232,213,163,0.55)"
  const pText  = pWin ? PLAYER_COLOR : isTie ? TIE_COLOR : "rgba(232,213,163,0.55)"
  const circle = (val: number, bc: string, bg: string, tc: string) => (
    <div style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 26, height: 26, borderRadius: "50%",
      border: `1.5px solid ${bc}`, background: bg,
      fontSize: 10, fontWeight: 800, color: tc, lineHeight: 1, flexShrink: 0,
    }}>{val}</div>
  )
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <span style={{ fontSize: 8, fontWeight: 700, color: bColor, marginRight: 1 }}>B</span>
      {circle(bDisplay, bColor, bFill, bText)}
      <span style={{ fontSize: 8, fontWeight: 700, color: pColor, marginLeft: 2, marginRight: 1 }}>P</span>
      {circle(pDisplay, pColor, pFill, pText)}
    </div>
  )
}

interface ClosingPrice {
  time: number
  price: number
  baccaratResult?: "player" | "banker" | "tie" | null
  bScore?: number | null
  pScore?: number | null
  bRawSum?: number | null
  pRawSum?: number | null
}

/** 카드 끝자리 점수 기반 승패 계산 */
function scoreToResult(b: number, p: number): "player" | "banker" | "tie" {
  return p > b ? "player" : b > p ? "banker" : "tie"
}

export function ClosingPricesList() {
  const [prices, setPrices] = useState<ClosingPrice[]>([])

  // 페이지 로드 시 DB에서 최근 10개 불러오기
  useEffect(() => {
    fetch("/api/closing-price?limit=10")
      .then(r => r.json())
      .then(({ prices: fetched }) => {
        if (Array.isArray(fetched) && fetched.length > 0) {
          // DB는 오래된 순 반환 → 최신순으로 뒤집어 저장
          setPrices([...fetched].reverse() as ClosingPrice[])
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    // baka:closing 이벤트로 30초마다 새 엔트리 추가 (점수는 deal-complete 이후 반영)
    const onClosing = (e: Event) => {
      const { price, time } = (e as CustomEvent<{ price: number; time: number }>).detail
      setPrices(prev => {
        const updated = [{ time, price, baccaratResult: null, bScore: null, pScore: null }, ...prev]
        return updated.slice(0, 10)
      })
    }
    // 카드 연출 완료: 가장 최근 엔트리에 점수 반영
    const onDealComplete = (e: Event) => {
      const { result, pScore, bScore, pRawSum, bRawSum } = (e as CustomEvent<{ result: "player" | "banker" | "tie"; pScore: number; bScore: number; pRawSum: number; bRawSum: number }>).detail
      setPrices(prev => {
        if (prev.length === 0) return prev
        const updated = [...prev]
        updated[0] = { ...updated[0], baccaratResult: result, bScore, pScore, bRawSum, pRawSum }
        return updated
      })
    }
    window.addEventListener("baka:closing", onClosing)
    window.addEventListener("baccarat:deal-complete", onDealComplete)
    return () => {
      window.removeEventListener("baka:closing", onClosing)
      window.removeEventListener("baccarat:deal-complete", onDealComplete)
    }
  }, [])

  return (
    <div style={{
      background: "rgba(5,15,10,0.92)",
      border: "1px solid rgba(212,175,55,0.2)",
      borderRadius: 12,
      overflow: "hidden",
    }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(212,175,55,0.1)" }}>
        <div style={{ fontSize: 9, color: "rgba(212,175,55,0.5)", letterSpacing: "0.1em", textTransform: "uppercase" }}>30초 끝자리 (최근 10개)</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxHeight: 200, overflowY: "auto" }}>
        {prices.length === 0 ? (
          <div style={{ padding: "10px 14px", color: "rgba(212,175,55,0.3)", fontSize: 12 }}>—</div>
        ) : (
          prices.map((p, i) => {
            const time = new Date(p.time * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
            const hasScores = p.bScore !== null && p.bScore !== undefined && p.pScore !== null && p.pScore !== undefined
            const bDisplay = p.bRawSum ?? p.bScore ?? null
            const pDisplay = p.pRawSum ?? p.pScore ?? null
            const result = hasScores ? scoreToResult(p.bScore!, p.pScore!) : p.baccaratResult ?? null
            return (
              <div key={p.time} style={{
                padding: "8px 14px",
                borderBottom: i < prices.length - 1 ? "1px solid rgba(212,175,55,0.08)" : "none",
                display: "flex",
                alignItems: "center",
                fontSize: 12,
                gap: 8,
              }}>
                <span style={{ color: "rgba(212,175,55,0.5)", minWidth: 50 }}>{time}</span>
                <span style={{ color: "#d4af37", fontWeight: 600, fontVariantNumeric: "tabular-nums", flex: 1, textAlign: "right" }}>
                  ${p.price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                </span>
                <ScoreCircles bDisplay={bDisplay} pDisplay={pDisplay} result={result} />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
