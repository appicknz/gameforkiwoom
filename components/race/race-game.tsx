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

// ─────────────────────────────────────────────────────────────────────────────
// 현재 라운드의 racing 구간(secondsInRound 60~298)에 해당하는
// closing 가격들을 window.__bitcoinClosingPrices 에서 찾아 스코어를 복원한다.
// 라운드 시작 Unix초 = roundId * ROUND_SEC + BETTING_SEC (60초 배팅 후 레이싱 시작)
function rebuildScoreFromHistory(roundId: number): { bit: number; coin: number } {
  const allPrices: Array<{ time: number; price: number }> =
    (window as any).__bitcoinClosingPrices ?? []

  // 레이싱 구간: [roundStart + BETTING_SEC, roundStart + ROUND_SEC)
  const roundStart = roundId * ROUND_SEC
  const racingFrom = roundStart + BETTING_SEC   // 60초 이후
  const racingTo   = roundStart + ROUND_SEC     // 300초 이전

  let bit = 0, coin = 0
  for (const { time, price } of allPrices) {
    if (time >= racingFrom && time < racingTo) {
      const dec = price.toFixed(2).split(".")[1] ?? "00"
      bit  += parseInt(dec[0] ?? "0")
      coin += parseInt(dec[1] ?? "0")
    }
  }
  return { bit, coin }
}

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

  // ── 서버 UTC 기반 동기화 타이머 ──────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const nowSec = Math.floor(Date.now() / 1000)
      const sec    = getSecondsInRound(nowSec)
      const roundId = getRoundId(nowSec)

      const phase: RacePhase =
        sec < BETTING_SEC      ? "betting"
        : sec < ROUND_SEC - 2  ? "racing"
        : "result"

      const timeLeft =
        phase === "betting" ? BETTING_SEC - sec
        : phase === "racing" ? ROUND_SEC - sec
        : 0

      setState(prev => {
        if (prev.roundId !== roundId) {
          // 새 라운드 진입 → 스코어 초기화
          return {
            ...prev, phase, timeLeft, roundId,
            bitScore: 0, coinScore: 0,
            winner: null, lastPrice: null,
            lastBitDigit: null, lastCoinDigit: null,
            secondsInRound: sec,
          }
        }

        // 같은 라운드 내 racing 페이즈로 처음 진입할 때 혹은
        // 이미 racing 중인 상태로 접속했을 때 → 히스토리에서 스코어 복원
        if (phase === "racing" && prev.phase === "betting") {
          // betting → racing 전환: 항상 히스토리 재계산
          const { bit, coin } = rebuildScoreFromHistory(roundId)
          return {
            ...prev, phase, timeLeft, secondsInRound: sec,
            bitScore: bit, coinScore: coin,
          }
        }

        return { ...prev, phase, timeLeft, secondsInRound: sec }
      })
    }

    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [])

  // ── baka:init — 접속 직후 히스토리 수신 → racing 중이면 즉시 스코어 복원 ──
  useEffect(() => {
    const onInit = () => {
      // __bitcoinClosingPrices 가 채워진 직후에 호출됨
      setState(prev => {
        if (prev.phase !== "racing") return prev
        const { bit, coin } = rebuildScoreFromHistory(prev.roundId)
        return { ...prev, bitScore: bit, coinScore: coin }
      })
    }
    // use-price-worker 가 init 수신 후 window.__bitcoinClosingPrices 세팅 후 발행
    window.addEventListener("baka:init", onInit)
    return () => window.removeEventListener("baka:init", onInit)
  }, [])

  // ── baka:closing — 30초 closing 수신 → racing 구간에서만 득점 누적 ──────
  // baka:price(1초 실시간)가 아닌 baka:closing(30초 확정가)로 변경해
  // 기기/접속 시점에 관계없이 모든 클라이언트가 동일한 시점에 동일한 점수를 얻는다.
  useEffect(() => {
    const onClosing = (e: Event) => {
      const { price, time } = (e as CustomEvent<{ price: number; time: number }>).detail

      setState(prev => {
        if (prev.phase !== "racing") return prev

        // 이 closing time 이 현재 라운드 racing 구간인지 검증
        const roundStart  = prev.roundId * ROUND_SEC
        const racingFrom  = roundStart + BETTING_SEC
        const racingTo    = roundStart + ROUND_SEC
        if (time < racingFrom || time >= racingTo) return prev

        const dec      = price.toFixed(2).split(".")[1] ?? "00"
        const bitDigit = parseInt(dec[0] ?? "0")
        const coinDigit = parseInt(dec[1] ?? "0")

        setFlashes(f => [
          ...f.slice(-20),
          { id: flashId.current++, bit: bitDigit, coin: coinDigit, price, ts: Date.now() },
        ])
        setTimeout(() => setFlashes(f => f.filter(x => Date.now() - x.ts < 2000)), 2100)

        return {
          ...prev,
          bitScore:      prev.bitScore  + bitDigit,
          coinScore:     prev.coinScore + coinDigit,
          lastPrice:     price,
          lastBitDigit:  bitDigit,
          lastCoinDigit: coinDigit,
        }
      })
    }

    window.addEventListener("baka:closing", onClosing)
    return () => window.removeEventListener("baka:closing", onClosing)
  }, [])

  // ── result 페이즈 진입 시 승자 결정 ──────────────────────────────
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
