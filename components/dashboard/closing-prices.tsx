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

  useEffect(() => {
    fetch("/api/closing-price")
      .then((r) => r.json())
      .then((data) => {
        if (data.prices && data.prices.length > 0) {
          const existing: ClosingPrice[] = (window as any).__bitcoinClosingPrices ?? []
          if (existing.length === 0) {
            ;(window as any).__bitcoinClosingPrices = data.prices
            setClosingPrices(data.prices)
          }
        }
      })
      .catch(() => {})

    fetch("/api/rounds")
      .then((r) => r.json())
      .then((data) => { if (data.rounds) setRounds(data.rounds) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof window !== "undefined" && (window as any).__bitcoinClosingPrices) {
        setClosingPrices((window as any).__bitcoinClosingPrices)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [])

  if (closingPrices.length === 0) return null

  const displayLimit = showAll ? 100 : 10
  const displayPrices = closingPrices.slice(-displayLimit).reverse()

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

  return (
    <Card className="p-4 bg-background border border-border/60">
      <h3 className="text-sm font-semibold text-foreground mb-3">
        30초 마감 기준가 (최근 {displayLimit}개)
      </h3>
      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
        {displayPrices.map((item, idx) => {
          const roundInfo = rounds[rounds.length - 1 - idx] ?? null
          const roundNum = roundInfo ? parseInt(roundInfo.id) : "—"
          const betInfo = getBetInfo(roundInfo)
          const hasBet = betInfo.direction || betInfo.digit || betInfo.parity

          const digit = getLastDigit(item.price)
          // 이전 마감가(배열에서 한 칸 앞 = 시간상 이전)를 기준으로 롱/숏 판정
          const prevPrice = displayPrices[idx + 1]?.price ?? null
          const resultDirection = prevPrice != null
            ? (item.price >= prevPrice ? "롱" : "숏")
            : null
          const resultDigit = getDigitType(digit)
          const resultParity = getParityType(digit)

          // 배팅한 태그의 승/패 판단
          const dirBetMatch = betInfo.direction === resultDirection
          const digBetMatch = betInfo.digit === resultDigit
          const parBetMatch = betInfo.parity === resultParity

          const Tag = ({
            label,
            isBet,
            won,
          }: {
            label: string
            isBet: boolean
            won: boolean | null
          }) => {
            if (isBet && won !== null) {
              // 배팅한 항목 + 결과 있음 → 승/패 색상
              return (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    won
                      ? "bg-emerald-500/15 text-emerald-600"
                      : "bg-red-500/15 text-red-500"
                  }`}
                >
                  {label}
                </span>
              )
            }
            if (isBet) {
              // 배팅했지만 아직 결과 없음 (진행중)
              return (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary text-primary-foreground">
                  {label}
                </span>
              )
            }
            return (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground">
                {label}
              </span>
            )
          }

          return (
            <div
              key={`${item.time}-${idx}`}
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                hasBet
                  ? "bg-muted/30 border-border/40"
                  : "bg-muted/30 border-border/40"
              }`}
            >
              {/* 왼쪽: 시간 + 가격 */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-muted-foreground tabular-nums shrink-0">
                  {new Date(item.time * 1000).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}
                </span>
                <span className="font-bold text-foreground tabular-nums shrink-0">
                  ${item.price.toLocaleString("en-US", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                </span>
              </div>

              {/* 오른쪽: 롱/숏 · 오버/언더 · 홀/짝 */}
              <div className="flex items-center gap-1 shrink-0">
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
          className="w-full mt-2 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground border border-border/40 hover:border-border transition-colors flex items-center justify-center gap-1"
        >
          더보기 <ChevronDown size={13} />
        </button>
      )}
    </Card>
  )
}
