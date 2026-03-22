"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
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
  started_at: string
  ended_at: string
  bet_history: Array<{
    bet_direction?: string | null
    bet_digit?: string | null
    bet_parity?: string | null
    result?: string | null
  }>
}

export function ClosingPrices() {
  const [closingPrices, setClosingPrices] = useState<ClosingPrice[]>([])
  const [rounds, setRounds] = useState<RoundData[]>([])
  const [showAll, setShowAll] = useState(false)

  const fetchRounds = () => {
    fetch("/api/rounds")
      .then((r) => r.json())
      .then((data) => { if (data.rounds) setRounds(data.rounds) })
      .catch(() => {})
  }

  useEffect(() => {
    // 초기값: window.__bitcoinClosingPrices (BakaBettingGame의 init 이벤트로 세팅됨)
    const initPrices: ClosingPrice[] = (window as any).__bitcoinClosingPrices ?? []
    if (initPrices.length > 0) setClosingPrices(initPrices)

    fetchRounds()

    // baka:closing 이벤트 구독 — Railway 단일 소스
    const onClosing = (e: Event) => {
      const { price, time } = (e as CustomEvent<{ price: number; time: number }>).detail
      setClosingPrices(prev => {
        const last = prev[prev.length - 1]
        if (last?.time === time) return prev
        return [...prev, { time, price }].slice(-100)
      })
      // 새 마감가마다 rounds 갱신 (결과 반영)
      fetchRounds()
    }
    window.addEventListener("baka:closing", onClosing)
    return () => window.removeEventListener("baka:closing", onClosing)
  }, [])

  if (closingPrices.length === 0) return null

  const displayLimit = showAll ? 100 : 10
  const displayPrices = closingPrices.slice(-displayLimit).reverse()

  // ended_at → unix timestamp 기준으로 rounds를 Map에 인덱싱
  const roundByTime = new Map<number, RoundData>()
  rounds.forEach((r) => {
    if (r.ended_at) {
      const ts = Math.floor(new Date(r.ended_at).getTime() / 1000)
      roundByTime.set(ts, r)
    }
  })

  const getLastDigit = (price: number) => Math.floor(Math.abs(price * 10)) % 10
  const getDigitType = (digit: number) => (digit <= 4 ? "언더" : "오버")
  const getParityType = (digit: number) => (digit % 2 === 0 ? "짝" : "홀")

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

  const GOLD = "#d4af37"
  const GOLD_DIM = "rgba(212,175,55,0.5)"
  const GOLD_BORDER = "rgba(212,175,55,0.18)"
  const CARD_BG = "rgba(5,13,10,0.85)"
  const ROW_BG = "rgba(212,175,55,0.04)"
  const ROW_BORDER = "rgba(212,175,55,0.1)"

  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${GOLD_BORDER}`,
        borderRadius: 14,
        padding: "16px",
        boxShadow: "0 2px 24px rgba(0,0,0,0.5)",
      }}
    >
      <h3 style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 12, letterSpacing: "0.04em" }}>
        30초 마감 기준가 (최근 {displayLimit}개)
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" }}>
        {displayPrices.map((item, idx) => {
          const roundInfo = roundByTime.get(item.time) ?? null
          const betInfo = getBetInfo(roundInfo)
          const hasBet = betInfo.direction || betInfo.digit || betInfo.parity

          const digit = getLastDigit(item.price)
          const prevPrice = displayPrices[idx + 1]?.price ?? null
          const resultDirection = prevPrice != null
            ? (item.price >= prevPrice ? "롱" : "숏")
            : null
          const resultDigit = getDigitType(digit)
          const resultParity = getParityType(digit)

          const dirBetMatch = betInfo.direction === resultDirection
          const digBetMatch = betInfo.digit === resultDigit
          const parBetMatch = betInfo.parity === resultParity

          const Tag = ({ label, isBet, won }: { label: string; isBet: boolean; won: boolean | null }) => {
            let bg = "rgba(212,175,55,0.08)"
            let color = GOLD_DIM
            if (isBet && won === true)  { bg = "rgba(34,197,94,0.15)";  color = "#22c55e" }
            if (isBet && won === false) { bg = "rgba(239,68,68,0.15)";  color = "#ef4444" }
            if (isBet && won === null)  { bg = "rgba(212,175,55,0.18)"; color = GOLD }
            return (
              <span style={{
                padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                background: bg, color,
              }}>{label}</span>
            )
          }

          return (
            <div
              key={`${item.time}-${idx}`}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 8, padding: "7px 10px", borderRadius: 8,
                background: ROW_BG, border: `1px solid ${ROW_BORDER}`,
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: GOLD_DIM, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  {new Date(item.time * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                </span>
                <span style={{ fontWeight: 700, color: "rgba(232,213,163,0.9)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  ${item.price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
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

      {!showAll && closingPrices.length > 10 && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            width: "100%", marginTop: 8, padding: "7px 0", borderRadius: 8,
            fontSize: 12, fontWeight: 600, color: GOLD_DIM,
            background: "transparent", border: `1px solid ${GOLD_BORDER}`,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            transition: "color 0.2s, border-color 0.2s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = GOLD; (e.currentTarget as HTMLElement).style.borderColor = "rgba(212,175,55,0.4)" }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = GOLD_DIM; (e.currentTarget as HTMLElement).style.borderColor = GOLD_BORDER }}
        >
          더보기 <ChevronDown size={13} />
        </button>
      )}
    </div>
  )
}
