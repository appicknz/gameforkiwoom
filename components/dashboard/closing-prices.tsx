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
  return new Date(ts * 1000).toLocaleTimeString("ko-KR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  })
}

function fmtPrice(price: number) {
  return "$" + price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 소수점 끝자리: 합산/반올림 없이 소수점 둘째 자리 그대로
function getLastDigit(price: number) {
  // e.g. 70288.91 → Math.floor(70288.91 * 100) = 7028891 → 7028891 % 10 = 1
  return Math.floor(price * 100) % 10
}
// 뱅커 카드 = 소수점 첫째 자리
function getBankerDigit(price: number) {
  return Math.floor(Math.floor(price * 100) / 10) % 10
}
// 플레이어 카드 = 소수점 둘째 자리
function getPlayerDigit(price: number) {
  return Math.floor(price * 100) % 10
}

function getDigitType(digit: number) { return digit <= 4 ? "언더" : "오버" }
function getParityType(digit: number) { return digit % 2 === 0 ? "짝" : "홀" }

// ── 라운드 결과 목록 ──────────────────────────────────────────────────────
function RoundResults({ prices, rounds }: { prices: ClosingPrice[]; rounds: RoundData[] }) {
  const [showAll, setShowAll] = useState(false)
  const displayLimit = showAll ? 200 : 10

  // 최신순 정렬 (time 내림차순)
  const sorted = [...prices].sort((a, b) => b.time - a.time)
  const displayPrices = sorted.slice(0, displayLimit)

  const roundByTime = new Map<number, RoundData>()
  rounds.forEach((r) => {
    if (r.ended_at) {
      const ts = Math.floor(new Date(r.ended_at).getTime() / 1000)
      roundByTime.set(ts, r)
    }
  })

  const getBetInfo = (roundInfo: RoundData | null) => {
    if (!roundInfo?.bet_history?.length) {
      return { direction: null, digit: null, parity: null, directionWon: null, digitWon: null, parityWon: null }
    }
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
      {displayPrices.length === 0 ? (
        <div style={{ color: GOLD_DIM, fontSize: 12, textAlign: "center", padding: "16px 0" }}>데이터 없음</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 420, overflowY: "auto" }}>
          {displayPrices.map((item) => {
            const roundInfo = roundByTime.get(item.time) ?? null
            const betInfo = getBetInfo(roundInfo)
            const lastDigit = getLastDigit(item.price)
            const bankerD = getBankerDigit(item.price)
            const playerD = getPlayerDigit(item.price)

            // 이전 라운드 대비 방향: sorted 배열에서 다음 인덱스(이전 시간)와 비교
            const prevIdx = displayPrices.findIndex(p => p.time === item.time) + 1
            const prevItem = displayPrices[prevIdx]
            const resultDirection = prevItem
              ? (item.price >= prevItem.price ? "롱" : "숏")
              : null

            const resultDigit = getDigitType(lastDigit)
            const resultParity = getParityType(lastDigit)

            const dirMatch = betInfo.direction === resultDirection
            const digMatch = betInfo.digit === resultDigit
            const parMatch = betInfo.parity === resultParity

            return (
              <div
                key={`round-${item.time}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 8, padding: "7px 10px", borderRadius: 8,
                  background: ROW_BG, border: `1px solid ${ROW_BORDER}`,
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: GOLD_DIM, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {fmtTime(item.time)}
                  </span>
                  <span style={{ fontWeight: 700, color: "rgba(232,213,163,0.9)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {fmtPrice(item.price)}
                  </span>
                  {/* 뱅커 카드 숫자 / 플레이어 카드 숫자 */}
                  <span style={{ fontSize: 10, color: "rgba(34,197,94,0.65)", fontVariantNumeric: "tabular-nums" }}>
                    B{bankerD} P{playerD}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <Tag label={resultDirection ?? "—"} isBet={dirMatch && !!betInfo.direction} won={dirMatch && !!betInfo.direction ? betInfo.directionWon : null} />
                  <Tag label={resultDigit} isBet={digMatch && !!betInfo.digit} won={digMatch && !!betInfo.digit ? betInfo.digitWon : null} />
                  <Tag label={resultParity} isBet={parMatch && !!betInfo.parity} won={parMatch && !!betInfo.parity ? betInfo.parityWon : null} />
                </div>
              </div>
            )
          })}
        </div>
      )}
      {!showAll && sorted.length > 10 && (
        <button
          onClick={() => setShowAll(true)}
          style={{ marginTop: 10, width: "100%", background: "rgba(212,175,55,0.06)", border: `1px solid ${GOLD_BORDER}`, borderRadius: 8, color: GOLD_DIM, fontSize: 12, padding: "7px 0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
        >
          더보기 <ChevronDown size={13} />
        </button>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────
export function ClosingPrices() {
  const [closingPrices, setClosingPrices] = useState<ClosingPrice[]>([])
  const [rounds, setRounds] = useState<RoundData[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRounds = () => {
    fetch("/api/rounds")
      .then(r => r.json())
      .then(data => { if (data.rounds) setRounds(data.rounds) })
      .catch(() => {})
  }

  useEffect(() => {
    // DB에서 30초 마감가 목록 초기 로드 (최신순)
    fetch("/api/closing-price")
      .then(r => r.json())
      .then(data => {
        if (data.prices && Array.isArray(data.prices)) {
          // API는 ended_at DESC → 이미 최신순, time 기준 오름차순으로 내부 저장
          const sorted = [...data.prices].sort(
            (a: ClosingPrice, b: ClosingPrice) => a.time - b.time
          )
          setClosingPrices(sorted)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    fetchRounds()

    // baka:closing = 30초마다 현재가 스냅샷 수신
    const onClosing = (e: Event) => {
      const { price, time } = (e as CustomEvent<{ price: number; time: number }>).detail
      setClosingPrices(prev => {
        // 같은 time이면 중복 추가 방지
        if (prev.some(p => p.time === time)) return prev
        return [...prev, { time, price }].sort((a, b) => a.time - b.time)
      })
      fetchRounds()
    }
    window.addEventListener("baka:closing", onClosing)
    return () => {
      window.removeEventListener("baka:closing", onClosing)
    }
  }, [])

  if (loading) return null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <RoundResults prices={closingPrices} rounds={rounds} />
    </div>
  )
}
