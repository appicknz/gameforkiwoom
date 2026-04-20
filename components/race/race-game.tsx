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

// 180초(3분) 라운드 — 서버/Redis와 동일하게 유지 필수
// 페이즈: 0~9초 정산(10s), 10~59초 배팅(50s), 60~179초 게임중(120s)
const ROUND_SEC    = 180
const SETTLE_SEC   = 10   // 0~9초: 정산
const BETTING_SEC  = 60   // 10~59초: 배팅 (50초)
const RACING_END   = 180  // 60~179초: 게임중 (120초) = ROUND_SEC 전체

function getRoundId(nowSec: number) { return Math.floor(nowSec / ROUND_SEC) }
function getSecondsInRound(nowSec: number) { return nowSec % ROUND_SEC }

// 스코어는 price-server가 서버에서 계산해 broadcast — 클라이언트는 받은 값을 그대로 표시
// 기기/접속 시점에 관계없이 모든 클라이언트가 항상 동일한 스코어를 가짐

export function useRaceGame() {
  const [state, setState] = useState<RaceState>(() => {
    // 초기값을 실제 현재 시각 기준으로 계산 → roundId가 0이면 baka:race-score 필터링에서 차단됨
    const nowSec = Math.floor(Date.now() / 1000)
    const roundId = getRoundId(nowSec)
    const sec = getSecondsInRound(nowSec)
    const phase: RacePhase = sec < SETTLE_SEC ? "result" : sec < BETTING_SEC ? "betting" : "racing"
    const timeLeft = phase === "result" ? SETTLE_SEC - sec : phase === "betting" ? BETTING_SEC - sec : RACING_END - sec
    return {
      phase,
      timeLeft: Math.max(0, timeLeft),
      roundId,
      bitScore: 0,
      coinScore: 0,
      winner: null,
      lastPrice: null,
      lastBitDigit: null,
      lastCoinDigit: null,
      secondsInRound: sec,
    }
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
        : "racing"

      const timeLeft =
        phase === "result"  ? SETTLE_SEC - sec
        : phase === "betting" ? BETTING_SEC - sec
        : RACING_END - sec

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
  // roundId도 서버 값으로 덮어쓴다 — 접속 시점과 무관하게 정확한 동기화
  useEffect(() => {
    const onInit = (e: Event) => {
      const { raceScore } = (e as CustomEvent<{ raceScore?: { roundId: number; bit: number; coin: number } }>).detail
      if (!raceScore) return
      setState(prev => ({
        ...prev,
        roundId:   raceScore.roundId,
        bitScore:  raceScore.bit,
        coinScore: raceScore.coin,
      }))
    }
    window.addEventListener("baka:init", onInit)
    return () => window.removeEventListener("baka:init", onInit)
  }, [])

  // ── baka:race-score — 1초 price tick마다 서버가 계산한 스코어 수신 ───────
  // 클라이언트는 계산 없이 서버 값을 그대로 표시 → 모든 기기 항상 동일
  // roundId 필터 제거: 서버가 라운드 전환 시 0으로 리셋하므로 클라이언트 방어 불필요
  // phase 필터 제거: 타이머(500ms poll)와 score(1s push) 타이밍 오차로 racing 진입 전에 차단될 수 있음
  useEffect(() => {
    const onRaceScore = (e: Event) => {
      const { roundId, bit, coin } = (e as CustomEvent<{ roundId: number; bit: number; coin: number }>).detail

      setState(prev => {
        // 새 라운드 전환 감지: roundId가 바뀌면 스코어 초기화
        if (roundId !== prev.roundId) {
          return { ...prev, roundId, bitScore: 0, coinScore: 0, lastBitDigit: null, lastCoinDigit: null }
        }

        // 플래시: 이전 스코어와 diff로 이번 tick 득점 계산
        const bitDiff  = bit  - prev.bitScore
        const coinDiff = coin - prev.coinScore
        if (bitDiff > 0 || coinDiff > 0) {
          setFlashes(f => [
            { id: flashId.current++, bit: bitDiff, coin: coinDiff, price: 0, ts: Date.now() },
            ...f.slice(0, 49),
          ])
        }

        return {
          ...prev,
          bitScore:  bit,
          coinScore: coin,
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

      // 결과 시각: 이 roundId의 종료 경계 = (roundId + 1) * 180
      const resultTime = (state.roundId + 1) * ROUND_SEC

      // 현재가는 baka:price 마지막 수신값 사용
      const lastPrice = state.lastPrice

      // race:closing 이벤트 발행 (차트 기준가선 업데이트)
      if (lastPrice !== null) {
        window.dispatchEvent(new CustomEvent("race:closing", {
          detail: { price: lastPrice, time: resultTime, bit: state.bitScore, coin: state.coinScore, winner }
        }))

        // DB 영구 저장 (ignoreDuplicates: true → 첫 저장값 보존)
        fetch("/api/race-results", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            time: resultTime,
            price: lastPrice,
            bit_score: state.bitScore,
            coin_score: state.coinScore,
            winner,
          }),
        }).catch(() => {})
      }
    }
  }, [state.phase, state.winner, state.bitScore, state.coinScore, state.roundId, state.lastPrice])

  return { state, flashes }
}
