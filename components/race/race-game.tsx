"use client"

import { useEffect, useState, useRef, useCallback } from "react"

// ─── 타입 ──────────────────────────────────────────────────────────────────
export type RacePhase = "betting" | "racing" | "result"

export interface RaceState {
  phase: RacePhase
  timeLeft: number       // 남은 초
  roundId: number        // Math.floor(now / 180)
  bitScore: number       // BIT팀 누적 (소수점 첫째)
  coinScore: number      // COIN팀 누적 (소수점 둘째)
  winner: "bit" | "coin" | "tie" | null
  lastPrice: number | null
  lastBitDigit: number | null
  lastCoinDigit: number | null
  secondsInRound: number // 라운드 내 경과 초 (0~179)
}

interface ScoreFlashEntry {
  id: number
  bit: number
  coin: number
  price: number
  ts: number
}

// 180초(3분) 라운드 — price-server와 동일
// 페이즈: 0~9초 정산(10s), 10~59초 배팅(50s), 60~179초 게임중(120s)
const ROUND_SEC    = 180
const SETTLE_SEC   = 10   // 0~9초: 정산
const BETTING_SEC  = 60   // 10~59초: 배팅 (50초)
const GAME_END_SEC = 180  // 60~179초: 게임중 (120초)

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

      // 0~9s: result(정산 10s), 10~59s: betting(배팅 50s), 60~179s: racing(게임중 120s)
      const phase: RacePhase =
        sec < SETTLE_SEC    ? "result"
        : sec < BETTING_SEC ? "betting"
        : sec < GAME_END_SEC ? "racing"
        : "result"

      const timeLeft =
        phase === "result" && sec < SETTLE_SEC ? SETTLE_SEC - sec
        : phase === "betting" ? BETTING_SEC - sec
        : phase === "racing"  ? GAME_END_SEC - sec
        : 0

      setState(prev => {
        if (prev.roundId !== roundId) {
          // 새 라운드 진입 → 스코어 + 플래시 초기화
          setFlashes([])
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

  // ── baka:price — 현재가 및 소수점 자리 업데이트 ─────────────────────────
  useEffect(() => {
    const onPrice = (e: Event) => {
      const { price } = (e as CustomEvent<{ price: number }>).detail
      // lastPrice만 업데이트 — lastBitDigit/lastCoinDigit은 baka:race-score에서만 변경
      setState(prev => ({ ...prev, lastPrice: price }))
    }
    window.addEventListener("baka:price", onPrice)
    return () => window.removeEventListener("baka:price", onPrice)
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

        // 플래시: 이전 스코어와 diff로 이번 tick 득점 계산 (영구 기록 — 라운드 초기화 전까지 유지)
        const bitDiff  = bit  - prev.bitScore
        const coinDiff = coin - prev.coinScore
        if (bitDiff > 0 || coinDiff > 0) {
          setFlashes(f => [
            { id: flashId.current++, bit: bitDiff, coin: coinDiff, price: 0, ts: Date.now() },
            ...f.slice(0, 49),  // 최신이 앞, 최대 50개 보관
          ])
        }

        return {
          ...prev,
          bitScore:  bit,
          coinScore: coin,
          // 득점이 있을 때만 DigitFlash 트리거 (없으면 이전 값 유지해 불필요한 리플래시 방지)
          lastBitDigit:  bitDiff  > 0 ? bitDiff  : prev.lastBitDigit,
          lastCoinDigit: coinDiff > 0 ? coinDiff : prev.lastCoinDigit,
        }
      })
    }

    window.addEventListener("baka:race-score", onRaceScore)
    return () => window.removeEventListener("baka:race-score", onRaceScore)
  }, [])

  // ── result 페이즈 진입 시 승자 결정 + DB 저장 ────────────────────
  const resultSavedRef = useRef<number>(-1)
  useEffect(() => {
    if (state.phase === "result" && state.winner === null && (state.bitScore > 0 || state.coinScore > 0)) {
      const winner: "bit" | "coin" | "tie" =
        state.bitScore > state.coinScore ? "bit"
        : state.coinScore > state.bitScore ? "coin"
        : "tie"

      setState(prev => ({ ...prev, winner }))

      // 중복 저장 방지
      if (resultSavedRef.current === state.roundId) return
      resultSavedRef.current = state.roundId

      // 결과 시각: 이 roundId(raceRoundNumber)의 종료 경계
      // state.roundId 가 raceRoundNumber이므로 종료 시각은 (roundId + 1) * 180
      const resultTime = (state.roundId + 1) * 180

      // race:closing 이벤트 발행 (차트 기준가선 업데이트, UI 실시간 반영)
      // DB 저장은 game/settle API(서버)가 담당 — 클라이언트 접속 여부 무관
      const lastPrice = state.lastPrice
      if (lastPrice !== null) {
        window.dispatchEvent(new CustomEvent("race:closing", {
          detail: { price: lastPrice, time: resultTime, bit: state.bitScore, coin: state.coinScore, winner }
        }))
      }
    }
  }, [state.phase, state.winner, state.bitScore, state.coinScore, state.roundId, state.lastPrice])

  return { state, flashes }
}
