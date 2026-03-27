"use client"

import { useEffect, useState, useRef, useCallback } from "react"

// ─── 타입 ──────────────────────────────────────────────────────────────────
export type RacePhase = "betting" | "racing" | "result"

export interface RaceState {
  phase: RacePhase
  timeLeft: number       // 남은 초
  roundId: number        // Math.floor(now / 300)
  bitScore: number       // BIT팀 누적 (소수점 첫째)
  coinScore: number      // COIN팀 누적 (소수점 둘째)
  winner: "bit" | "coin" | "tie" | null
  lastPrice: number | null
  lastBitDigit: number | null
  lastCoinDigit: number | null
  secondsInRound: number // 라운드 내 경과 초 (0~299)
}

interface ScoreFlashEntry {
  id: number
  bit: number
  coin: number
  price: number
  ts: number
}

// 5분(300초) 라운드: 0~59초 배팅, 60~299초 레이싱
const ROUND_SEC = 300
const BETTING_SEC = 60

function getRoundId(nowSec: number) { return Math.floor(nowSec / ROUND_SEC) }
function getSecondsInRound(nowSec: number) { return nowSec % ROUND_SEC }

export function useRaceGame() {
  const [state, setState] = useState<RaceState>({
    phase: "betting",
    timeLeft: BETTING_SEC,
    roundId: 0,
    bitScore: 0,
    coinScore: 0,
    winner: null,
    lastPrice: null,
    lastBitDigit: null,
    lastCoinDigit: null,
    secondsInRound: 0,
  })
  const [flashes, setFlashes] = useState<ScoreFlashEntry[]>([])
  const flashId = useRef(0)

  // 서버 UTC 기반 동기화 타이머
  useEffect(() => {
    const tick = () => {
      const nowSec = Math.floor(Date.now() / 1000)
      const sec = getSecondsInRound(nowSec)
      const roundId = getRoundId(nowSec)

      const phase: RacePhase =
        sec < BETTING_SEC ? "betting"
        : sec < ROUND_SEC - 2 ? "racing"
        : "result"

      const timeLeft =
        phase === "betting" ? BETTING_SEC - sec
        : phase === "racing" ? ROUND_SEC - sec
        : 0

      setState(prev => {
        // 라운드 변경 → 스코어 초기화
        if (prev.roundId !== roundId) {
          return {
            ...prev,
            phase,
            timeLeft,
            roundId,
            bitScore: 0,
            coinScore: 0,
            winner: null,
            lastPrice: null,
            lastBitDigit: null,
            lastCoinDigit: null,
            secondsInRound: sec,
          }
        }
        return { ...prev, phase, timeLeft, secondsInRound: sec }
      })
    }

    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [])

  // baka:price 구독 → 레이싱 페이즈에서 스코어 누적
  useEffect(() => {
    const onPrice = (e: Event) => {
      const { price } = (e as CustomEvent<{ price: number; time: number }>).detail

      setState(prev => {
        if (prev.phase !== "racing") return prev

        const dec = price.toFixed(2).split(".")[1] ?? "00"
        const bitDigit = parseInt(dec[0] ?? "0")   // 소수점 첫째 → BIT팀
        const coinDigit = parseInt(dec[1] ?? "0")  // 소수점 둘째 → COIN팀

        const newBit = prev.bitScore + bitDigit
        const newCoin = prev.coinScore + coinDigit

        // 플래시 등록
        setFlashes(f => [
          ...f.slice(-20),
          { id: flashId.current++, bit: bitDigit, coin: coinDigit, price, ts: Date.now() },
        ])
        setTimeout(() => setFlashes(f => f.filter(x => Date.now() - x.ts < 2000)), 2100)

        return {
          ...prev,
          bitScore: newBit,
          coinScore: newCoin,
          lastPrice: price,
          lastBitDigit: bitDigit,
          lastCoinDigit: coinDigit,
        }
      })
    }

    window.addEventListener("baka:price", onPrice)
    return () => window.removeEventListener("baka:price", onPrice)
  }, [])

  // result 페이즈 진입 시 승자 결정
  useEffect(() => {
    if (state.phase === "result" && state.winner === null && (state.bitScore > 0 || state.coinScore > 0)) {
      setState(prev => ({
        ...prev,
        winner: prev.bitScore > prev.coinScore ? "bit"
          : prev.coinScore > prev.bitScore ? "coin"
          : "tie",
      }))
    }
  }, [state.phase, state.winner, state.bitScore, state.coinScore])

  return { state, flashes }
}
