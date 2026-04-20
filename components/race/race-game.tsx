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

// 180초(3분) 라운드 — 서버(price-server/index.js)와 동일하게 유지 필수
// 페이즈: 0~9초 정산(10s), 10~59초 배팅(50s), 60~179초 게임중(120s)
const ROUND_SEC   = 180
const SETTLE_SEC  = 10  // 0~9초: 정산
const BETTING_SEC = 60  // 10~59초: 배팅 (50초)

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

  // 라운드 종료 직전 스코어를 보존 — result 페이즈에서 bitScore가 0으로 리셋되기 전에 저장
  const lastRoundScoreRef = useRef<{ roundId: number; bit: number; coin: number; price: number | null } | null>(null)

  // ── 서버 UTC 기반 동기화 타이머 ──────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const nowSec  = Math.floor(Date.now() / 1000)
      const sec     = getSecondsInRound(nowSec)
      const roundId = getRoundId(nowSec)

      // 0~9s: result(정산 10s), 10~59s: betting(배팅 50s), 60~179s: racing(게임중 120s)
      const phase: RacePhase =
        sec < SETTLE_SEC    ? "result"
        : sec < BETTING_SEC ? "betting"
        : "racing"

      const timeLeft =
        phase === "result"    ? SETTLE_SEC - sec
        : phase === "betting" ? BETTING_SEC - sec
        : ROUND_SEC - sec

      setState(prev => {
        if (prev.roundId !== roundId) {
          // 새 라운드 진입 직전: 직전 라운드 스코어를 ref에 보존 (result 페이즈 DB 저장용)
          if (prev.phase === "racing" && (prev.bitScore > 0 || prev.coinScore > 0)) {
            lastRoundScoreRef.current = {
              roundId:  prev.roundId,
              bit:      prev.bitScore,
              coin:     prev.coinScore,
              price:    prev.lastPrice,
            }
          }
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
  // roundId를 서버 값으로 무조건 동기화 — 초기값 0과의 불일치 방지
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
  useEffect(() => {
    const onRaceScore = (e: Event) => {
      const { roundId, bit, coin } = (e as CustomEvent<{ roundId: number; bit: number; coin: number }>).detail

      setState(prev => {
        // roundId가 뒤로 가는 경우(stale 메시지)만 무시
        if (roundId < prev.roundId) return prev

        // 게임중 구간이 아니면 스코어 적용 안 함
        if (prev.phase !== "racing") {
          // roundId만 동기화 (baka:init 전에 도착한 경우 대비)
          if (roundId !== prev.roundId) return { ...prev, roundId }
          return prev
        }

        // roundId가 바뀌었다면 (서버/클라이언트 동기화) roundId만 맞추고 스코어 적용
        const nextRoundId = roundId !== prev.roundId ? roundId : prev.roundId

        // 플래시: 이전 스코어와 diff로 이번 tick 득점 계산
        const bitDiff  = bit  - (roundId !== prev.roundId ? 0 : prev.bitScore)
        const coinDiff = coin - (roundId !== prev.roundId ? 0 : prev.coinScore)
        if (bitDiff > 0 || coinDiff > 0) {
          setFlashes(f => [
            { id: flashId.current++, bit: bitDiff, coin: coinDiff, price: 0, ts: Date.now() },
            ...f.slice(0, 49),
          ])
        }

        return {
          ...prev,
          roundId:  nextRoundId,
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
  // state.bitScore는 result 진입과 동시에 0으로 리셋되므로
  // 직전 라운드 스코어는 lastRoundScoreRef에서 읽음
  const resultSavedRef = useRef<number>(-1)
  useEffect(() => {
    if (state.phase !== "result") return
    const saved = lastRoundScoreRef.current
    if (!saved) return
    // 중복 저장 방지
    if (resultSavedRef.current === saved.roundId) return
    resultSavedRef.current = saved.roundId

    const winner: "bit" | "coin" | "tie" =
      saved.bit > saved.coin ? "bit"
      : saved.coin > saved.bit ? "coin"
      : "tie"

    setState(prev => ({ ...prev, winner }))

    // 결과 시각: 직전 라운드 종료 경계 = (roundId + 1) * 180
    const resultTime = (saved.roundId + 1) * ROUND_SEC
    const lastPrice  = saved.price

    // race:closing 이벤트 발행 → race-closing-prices 실시간 목록 업데이트
    window.dispatchEvent(new CustomEvent("race:closing", {
      detail: { price: lastPrice ?? 0, time: resultTime, bit: saved.bit, coin: saved.coin, winner }
    }))

    // DB 저장 (lastPrice 없어도 저장, price=0으로)
    fetch("/api/race-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        time:       resultTime,
        price:      lastPrice ?? 0,
        bit_score:  saved.bit,
        coin_score: saved.coin,
        winner,
      }),
    }).catch(() => {})
  }, [state.phase, state.roundId])

  return { state, flashes }
}
