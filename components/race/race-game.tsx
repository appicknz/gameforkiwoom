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

// 스코어는 price-server가 서버에서 계산해 broadcast — 클라이언트는 받은 값을 그대로 표시
// 기기/접속 시점에 관계없이 모든 클라이언트가 항상 동일한 스코어를 가짐

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

        return { ...prev, phase, timeLeft, secondsInRound: sec }
      })
    }

    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [])

  // ── baka:init — 접속 직후 서버의 현재 race 스코어 즉시 반영 ─────────────
  useEffect(() => {
    const onInit = (e: Event) => {
      const { raceScore } = (e as CustomEvent<{ raceScore?: { roundId: number; bit: number; coin: number } }>).detail
      if (!raceScore) return
      setState(prev => {
        if (raceScore.roundId !== prev.roundId) return prev
        return { ...prev, bitScore: raceScore.bit, coinScore: raceScore.coin }
      })
    }
    window.addEventListener("baka:init", onInit)
    return () => window.removeEventListener("baka:init", onInit)
  }, [])

  // ── baka:race-score — 1초 price tick마다 서버가 계산한 스코어 수신 ───────
  // 클라이언트는 계산 없이 서버 값을 그대로 표시 → 모든 기기 항상 동일
  useEffect(() => {
    const onRaceScore = (e: Event) => {
      const { roundId, bit, coin } = (e as CustomEvent<{ roundId: number; bit: number; coin: number }>).detail

      setState(prev => {
        // 라운드가 다르면 무시 (stale 메시지 방어)
        if (roundId !== prev.roundId) return prev
        if (prev.phase !== "racing") return prev

        // 플래시: 이전 스코어와 diff로 이번 tick 득점 계산
        const bitDiff  = bit  - prev.bitScore
        const coinDiff = coin - prev.coinScore
        if (bitDiff > 0 || coinDiff > 0) {
          setFlashes(f => [
            ...f.slice(-20),
            { id: flashId.current++, bit: bitDiff, coin: coinDiff, price: 0, ts: Date.now() },
          ])
          setTimeout(() => setFlashes(f => f.filter(x => Date.now() - x.ts < 2000)), 2100)
        }

        return {
          ...prev,
          bitScore:  bit,
          coinScore: coin,
        }
      })
    }

    window.addEventListener("baka:race-score", onRaceScore)
    return () => window.removeEventListener("baka:race-score", onRaceScore)
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
