"use client"

import { useEffect, useState } from "react"

interface PriceEntry {
  time: number
  price: number
  baccaratResult?: "player" | "banker" | "tie" | null
  bScore?: number | null  // 뱅커 카드 합산 끝자리
  pScore?: number | null  // 플레이어 카드 합산 끝자리
}

const GOLD = "#d4af37"
const GOLD_DIM = "rgba(212,175,55,0.5)"
const ROW_BG = "rgba(212,175,55,0.04)"
const ROW_BORDER = "rgba(212,175,55,0.1)"
const CARD_BG = "rgba(5,13,10,0.85)"
const GOLD_BORDER = "rgba(212,175,55,0.18)"

const PLAYER_COLOR = "#60a5fa"   // blue
const BANKER_COLOR = "#f97316"   // orange
const TIE_COLOR    = "#22c55e"   // green

function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("ko-KR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  })
}

function fmtPrice(p: number) {
  return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 카드 끝자리 점수로 결과 계산 — 9에 가까운 쪽 승리 */
function scoreToResult(bScore: number, pScore: number): "player" | "banker" | "tie" {
  return pScore > bScore ? "player" : bScore > pScore ? "banker" : "tie"
}

function BaccaratBadge({ result }: { result: "player" | "banker" | "tie" }) {
  const label = result === "player" ? "플레이어" : result === "banker" ? "뱅커" : "타이"
  const color = result === "player" ? PLAYER_COLOR : result === "banker" ? BANKER_COLOR : TIE_COLOR
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
      background: `${color}22`, color, border: `1px solid ${color}55`,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  )
}

function PriceRow({ entry }: { entry: PriceEntry }) {
  const bs = entry.bScore ?? null
  const ps = entry.pScore ?? null
  const hasScores = bs !== null && ps !== null

  // 카드 점수 있으면 점수 기반, 없으면 DB 저장값, 둘 다 없으면 null (표시 보류)
  const baccaratResult: "player" | "banker" | "tie" | null =
    hasScores ? scoreToResult(bs!, ps!) : (entry.baccaratResult ?? null)

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 10px", borderRadius: 8,
      background: ROW_BG, border: `1px solid ${ROW_BORDER}`,
      fontSize: 12,
    }}>
      <span style={{ color: GOLD_DIM, fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap", minWidth: 60 }}>
        {fmtTime(entry.time)}
      </span>
      <span style={{ color: GOLD, fontWeight: 700, minWidth: 90, textAlign: "right" }}>
        {fmtPrice(entry.price)}
      </span>
      {/* B/P: 카드 합산 끝자리 점수 */}
      <span style={{ fontSize: 10, color: GOLD_DIM, minWidth: 40, letterSpacing: "0.04em" }}>
        {hasScores ? `B${bs} P${ps}` : "—"}
      </span>
      {baccaratResult && <BaccaratBadge result={baccaratResult} />}
    </div>
  )
}

export function ClosingPrices() {
  const [prices, setPrices] = useState<PriceEntry[]>([])
  const [expanded, setExpanded] = useState(false)

  // 페이지 로드 시 DB에서 기존 마감가 불러오기 (최근 50개)
  useEffect(() => {
    fetch("/api/closing-price?limit=50")
      .then(r => r.json())
      .then(({ prices: fetched }) => {
        if (Array.isArray(fetched) && fetched.length > 0) {
          setPrices(fetched as PriceEntry[])
        }
      })
      .catch(() => {})
  }, [])

  // 30초 마감: baka:closing 이벤트 구독 (가격/시간 먼저 추가, 점수는 deal-complete 이후 반영)
  useEffect(() => {
    const onClosing = (e: Event) => {
      const { price, time } = (e as CustomEvent<{ price: number; time: number }>).detail
      setPrices(prev => {
        const last = prev[prev.length - 1]
        if (last?.time === time) return prev
        return [...prev, { time, price, baccaratResult: null, bScore: null, pScore: null }].slice(-50)
      })
    }
    window.addEventListener("baka:closing", onClosing)
    return () => window.removeEventListener("baka:closing", onClosing)
  }, [])

  // 카드 연출 완료: baccarat:deal-complete 이벤트로 점수 반영
  useEffect(() => {
    const onDealComplete = (e: Event) => {
      const { result, pScore, bScore } = (e as CustomEvent<{ result: "player" | "banker" | "tie"; pScore: number; bScore: number }>).detail
      setPrices(prev => {
        if (prev.length === 0) return prev
        const updated = [...prev]
        // 가장 최근 엔트리에 점수 반영
        updated[updated.length - 1] = { ...updated[updated.length - 1], baccaratResult: result, bScore, pScore }
        return updated
      })
    }
    window.addEventListener("baccarat:deal-complete", onDealComplete)
    return () => window.removeEventListener("baccarat:deal-complete", onDealComplete)
  }, [])

  if (prices.length === 0) return null

  // 최신순 정렬 후 slice
  const sorted = [...prices].reverse()
  const displayCount = expanded ? 50 : 10
  const display = sorted.slice(0, displayCount)

  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${GOLD_BORDER}`,
      borderRadius: 12, padding: "14px 14px 10px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: GOLD, letterSpacing: "0.04em" }}>
          30초 마감 기준가 (최근 {expanded ? "50개" : "10개"})
        </h3>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            background: "rgba(212,175,55,0.08)", border: `1px solid ${GOLD_BORDER}`,
            color: GOLD_DIM, fontSize: 11, fontWeight: 700, padding: "3px 10px",
            borderRadius: 6, cursor: "pointer",
          }}
        >
          {expanded ? "접기" : "전체보기"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {display.map((entry) => (
          <PriceRow key={`closing-${entry.time}`} entry={entry} />
        ))}
      </div>
    </div>
  )
}
