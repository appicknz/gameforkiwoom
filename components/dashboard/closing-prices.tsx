"use client"

import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"

interface ClosingPrice {
  time: number
  price: number
}

interface RoundData {
  id: string
  base_price: number
  result_price: number
  result_digit: number
  baccarat_result?: string | null
  started_at: string
  ended_at: string
  bet_history: Array<{
    bet_direction?: string | null
    bet_digit?: string | null
    bet_parity?: string | null
    result?: string | null
  }>
}

const GOLD = "#d4af37"
const GOLD_DIM = "rgba(212,175,55,0.5)"
const GOLD_BORDER = "rgba(212,175,55,0.18)"
const CARD_BG = "rgba(5,13,10,0.85)"
const ROW_BG = "rgba(212,175,55,0.04)"
const ROW_BORDER = "rgba(212,175,55,0.1)"

function Tag({ label, isBet, won }: { label: string; isBet: boolean; won: boolean | null }) {
  let bg = "rgba(212,175,55,0.08)"
  let color = GOLD_DIM
  if (isBet && won === true)  { bg = "rgba(34,197,94,0.15)";  color = "#22c55e" }
  if (isBet && won === false) { bg = "rgba(239,68,68,0.15)";  color = "#ef4444" }
  if (isBet && won === null)  { bg = "rgba(212,175,55,0.18)"; color = GOLD }
  return (
    <span style={{ padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: bg, color }}>
      {label}
    </span>
  )
}

function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
}

function fmtPrice(price: number) {
  return "$" + price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getLastDigit(price: number) {
  const truncated = Math.floor(price * 100)
  return truncated % 10
}
function getDigitType(digit: number) { return digit <= 4 ? "언더" : "오버" }
function getParityType(digit: number) { return digit % 2 === 0 ? "짝" : "홀" }

// ── 섹션 1: 1초 실시간 ──────────────────────────────────────────────────────
function RealtimePrices({ prices, rounds }: { prices: ClosingPrice[]; rounds: RoundData[] }) {
  const [showAll, setShowAll] = useState(false)
  const displayLimit = showAll ? 100 : 10
  const displayPrices = prices.slice(-displayLimit).reverse()

  const roundByTime = new Map<number, RoundData>()
  rounds.forEach((r) => {
    if (r.ended_at) {
      const ts = Math.floor(new Date(r.ended_at).getTime() / 1000)
      roundByTime.set(ts, r)
    }
  })

  const getBetInfo = (roundInfo: RoundData | null) => {
    if (!roundInfo?.bet_history?.length) return { direction: null, digit: null, parity: null, directionWon: null, digitWon: null, parityWon: null }
    const dirRow = roundInfo.bet_history.find(b => b.bet_direction)
    const digRow = roundInfo.bet_history.find(b => b.bet_digit)
    const parRow = roundInfo.bet_history.find(b => b.bet_parity)
    return {
      direction: dirRow?.bet_direction ? (dirRow.bet_direction === "long" ? "롱" : "숏") : null,
      digit: digRow?.bet_digit ? (digRow.bet_digit === "over" ? "오버" : "언더") : null,
      parity: parRow?.bet_parity ? (parRow.bet_parity === "odd" ? "홀" : "짝") : null,
      directionWon: dirRow ? dirRow.result === "win" : null,
      digitWon: digRow ? digRow.result === "win" : null,
      parityWon: parRow ? parRow.result === "win" : null,
    }
  }

  return (
    <div style={{ background: CARD_BG, border: `1px solid ${GOLD_BORDER}`, borderRadius: 14, padding: 16, boxShadow: "0 2px 24px rgba(0,0,0,0.5)" }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 12, letterSpacing: "0.04em" }}>
        라운드 결과 (최근 {displayLimit}개)
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" }}>
        {displayPrices.map((item, idx) => {
          const roundInfo = roundByTime.get(item.time) ?? null
          const betInfo = getBetInfo(roundInfo)
          const digit = getLastDigit(item.price)
          const prevPrice = displayPrices[idx + 1]?.price ?? null
          const resultDirection = prevPrice != null ? (item.price >= prevPrice ? "롱" : "숏") : null
          const resultDigit = getDigitType(digit)
          const resultParity = getParityType(digit)
          const dirBetMatch = betInfo.direction === resultDirection
          const digBetMatch = betInfo.digit === resultDigit
          const parBetMatch = betInfo.parity === resultParity

          const seconds = new Date(item.time * 1000).getSeconds()
          const isRoundBoundary = seconds === 0 || seconds === 30
          const boundaryBg = isRoundBoundary ? "rgba(34,197,94,0.15)" : ROW_BG
          const boundaryBorder = isRoundBoundary ? "rgba(34,197,94,0.3)" : ROW_BORDER

          return (
            <div
              key={`rt-${item.time}-${idx}`}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 8, padding: "7px 10px", borderRadius: 8,
                background: boundaryBg, border: `1px solid ${boundaryBorder}`,
                fontSize: 12, transition: "background 0.2s, border-color 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: GOLD_DIM, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtTime(item.time)}</span>
                <span style={{ fontWeight: 700, color: "rgba(232,213,163,0.9)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtPrice(item.price)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <Tag label={resultDirection ?? "—"} isBet={dirBetMatch && !!betInfo.direction} won={dirBetMatch && !!betInfo.direction ? betInfo.directionWon : null} />
                <Tag label={resultDigit} isBet={digBetMatch && !!betInfo.digit} won={digBetMatch && !!betInfo.digit ? betInfo.digitWon : null} />
                <Tag label={resultParity} isBet={parBetMatch && !!betInfo.parity} won={parBetMatch && !!betInfo.parity ? betInfo.parityWon : null} />
              </div>
            </div>
          )
        })}
      </div>
      {!showAll && prices.length > 10 && (
        <button
          onClick={() => setShowAll(true)}
          style={{ width: "100%", marginTop: 8, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 600, color: GOLD_DIM, background: "transparent", border: `1px solid ${GOLD_BORDER}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
        >
          더보기 <ChevronDown size={13} />
        </button>
      )}
    </div>
  )
}

// ── 섹션 2: 30초 마감 기준가 (DB) ───────────────────────────────────────────
function DbClosingPrices({ prices }: { prices: ClosingPrice[] }) {
  const [showAll, setShowAll] = useState(false)
  const displayLimit = showAll ? 100 : 10
  // prices는 이미 최신순으로 정렬되어 전달됨
  const displayPrices = prices.slice(0, displayLimit)

  return (
    <div style={{ background: CARD_BG, border: `1px solid ${GOLD_BORDER}`, borderRadius: 14, padding: 16, boxShadow: "0 2px 24px rgba(0,0,0,0.5)" }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 12, letterSpacing: "0.04em" }}>
        30초 마��� 기준가 (최근 {displayLimit}개)
      </h3>
      {displayPrices.length === 0 ? (
        <div style={{ color: GOLD_DIM, fontSize: 12, textAlign: "center", padding: "12px 0" }}>데이터 없음</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" }}>
          {displayPrices.map((item, idx) => {
            const digit = getLastDigit(item.price)
            const prevItem = displayPrices[idx + 1]
            const resultDirection = prevItem ? (item.price >= prevItem.price ? "롱" : "숏") : null
            const resultDigit = getDigitType(digit)
            const resultParity = getParityType(digit)

            // 소수점 두 자리 — 뱅커: 첫째, 플레이어: 둘째
            const truncated = Math.floor(item.price * 100)
            const bankerDigit = Math.floor(truncated / 10) % 10
            const playerDigit = truncated % 10

            return (
              <div
                key={`db-${item.time}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 8, padding: "7px 10px", borderRadius: 8,
                  background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: GOLD_DIM, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtTime(item.time)}</span>
                  <span style={{ fontWeight: 700, color: "rgba(232,213,163,0.9)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtPrice(item.price)}</span>
                  <span style={{ fontSize: 10, color: "rgba(34,197,94,0.7)", fontVariantNumeric: "tabular-nums" }}>
                    B{bankerDigit} P{playerDigit}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <Tag label={resultDirection ?? "—"} isBet={false} won={null} />
                  <Tag label={resultDigit} isBet={false} won={null} />
                  <Tag label={resultParity} isBet={false} won={null} />
                </div>
              </div>
            )
          })}
        </div>
      )}
      {!showAll && prices.length > 10 && (
        <button
          onClick={() => setShowAll(true)}
          style={{ width: "100%", marginTop: 8, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 600, color: GOLD_DIM, background: "transparent", border: `1px solid ${GOLD_BORDER}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
        >
          더보기 <ChevronDown size={13} />
        </button>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────
export function ClosingPrices() {
  // closingPrices = 30초 라운드 결과 목록 (baka:closing 이벤트 + DB 초기값)
  const [closingPrices, setClosingPrices] = useState<ClosingPrice[]>([])
  const [rounds, setRounds] = useState<RoundData[]>([])

  const fetchRounds = () => {
    fetch("/api/rounds")
      .then(r => r.json())
      .then(data => { if (data.rounds) setRounds(data.rounds) })
      .catch(() => {})
  }

  useEffect(() => {
    // 초기값: DB에서 30초 마감가 목록 로드 (최신순 → 오래된순으로 변환해서 저장)
    fetch("/api/closing-price")
      .then(r => r.json())
      .then(data => {
        if (data.prices && Array.isArray(data.prices)) {
          // API는 ended_at DESC → 최신이 앞. 오래된순으로 뒤집어서 저장 (push 방식과 일치)
          const sorted = [...data.prices].sort((a: ClosingPrice, b: ClosingPrice) => a.time - b.time)
          setClosingPrices(sorted)
        }
      })
      .catch(() => {})

    fetchRounds()

    // baka:closing = 30초마다 현재가 스냅샷이 담겨 오는 단일 소스
    const onClosing = (e: Event) => {
      const { price, time } = (e as CustomEvent<{ price: number; time: number }>).detail
      setClosingPrices(prev => {
        // 중복 방지
        if (prev[prev.length - 1]?.time === time) return prev
        return [...prev, { time, price }].slice(-200)
      })
      fetchRounds()
    }
    window.addEventListener("baka:closing", onClosing)
    return () => window.removeEventListener("baka:closing", onClosing)
  }, [])

  if (closingPrices.length === 0) return null

  // 최신순으로 정렬해서 렌더링
  const sorted = [...closingPrices].sort((a, b) => b.time - a.time)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 라운드 결과 — 30초마다 현재가 스냅샷 */}
      <RealtimePrices prices={sorted} rounds={rounds} />
    </div>
  )
}
