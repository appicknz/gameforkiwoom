"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useRaceGame } from "@/components/race/race-game"
import { RaceScoreboard } from "@/components/race/race-scoreboard"
import { RaceBettingGame } from "@/components/race/race-betting-game"
import { RaceClosingPrices } from "@/components/race/race-closing-prices"
import { usePriceWorker } from "@/hooks/use-price-worker"
import { BigRoad, type RoadResult } from "@/components/baka/baccarat-game"

const BIT_COLOR = "#3b82f6"
const COIN_COLOR = "#f97316"
const GOLD = "#d4af37"

// 현재가 헤더 (baka:price 이벤트로 DOM 직접 업데이트)
function LivePriceHeader() {
  const currentRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    // 상단 기준가 = 현재가 (매 틱 업데이트)
    const onPrice = (e: Event) => {
      const { price } = (e as CustomEvent<{ price: number }>).detail
      if (currentRef.current) {
        currentRef.current.textContent = `$${price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
      }
    }
    window.addEventListener("baka:price", onPrice)
    return () => {
      window.removeEventListener("baka:price", onPrice)
    }
  }, [])

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 14px",
      background: "rgba(5,15,10,0.92)",
      border: "1px solid rgba(212,175,55,0.15)",
      borderRadius: 12,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "radial-gradient(circle at 35% 35%, #f7931a, #c06000)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, fontWeight: 900, color: "#fff", flexShrink: 0,
      }}>₿</div>
      <div>
        <div style={{ fontSize: 9, color: "rgba(232,213,163,0.45)", letterSpacing: "0.06em", marginBottom: 1 }}>기준가</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: GOLD, fontVariantNumeric: "tabular-nums" }}>
          <span ref={currentRef}>—</span>
        </div>
      </div>
    </div>
  )
}

// 레이싱 트랙 시각화 (4분 진행 바)
function RaceTrack({ secondsInRound, phase }: { secondsInRound: number; phase: string }) {
  const raceSec = Math.max(0, secondsInRound - 60) // 60초 이후 레이싱 시작
  const totalRaceSec = 240
  const pct = phase === "racing" ? Math.min(raceSec / totalRaceSec, 1) : phase === "result" ? 1 : 0

  return (
    <div style={{
      background: "rgba(5,13,10,0.92)",
      border: "1px solid rgba(212,175,55,0.15)",
      borderRadius: 12,
      padding: "12px 16px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 11 }}>
        <span style={{ color: BIT_COLOR, fontWeight: 700 }}>BIT 팀 출발</span>
        <span style={{ color: "rgba(255,255,255,0.4)" }}>
          {phase === "betting" ? "레이스 준비 중" : phase === "racing" ? `${Math.floor(raceSec)}초 경과` : "레이스 완료"}
        </span>
        <span style={{ color: COIN_COLOR, fontWeight: 700 }}>COIN 팀 결승</span>
      </div>
      {/* 트랙 */}
      <div style={{ position: "relative", height: 20, borderRadius: 10, background: "rgba(255,255,255,0.05)", overflow: "visible" }}>
        {/* 진행 채우기 */}
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${pct * 100}%`,
          background: `linear-gradient(90deg, ${BIT_COLOR}, ${COIN_COLOR})`,
          borderRadius: 10,
          transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)",
          minWidth: pct > 0 ? 20 : 0,
        }} />
        {/* 이동 마커 */}
        {pct > 0 && (
          <div style={{
            position: "absolute",
            left: `calc(${pct * 100}% - 12px)`,
            top: "50%",
            transform: "translateY(-50%)",
            width: 24, height: 24,
            borderRadius: "50%",
            background: "#fff",
            border: `3px solid ${pct > 0.5 ? COIN_COLOR : BIT_COLOR}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 900,
            boxShadow: `0 0 12px ${pct > 0.5 ? COIN_COLOR : BIT_COLOR}`,
            transition: "left 0.8s cubic-bezier(0.34,1.56,0.64,1)",
            zIndex: 1,
          }}>
            ₿
          </div>
        )}
      </div>
    </div>
  )
}

export default function RacePage() {
  const { state, flashes } = useRaceGame()
  // 현재가 (baka:price 이벤트로 매 틱 업데이트)
  const [liveCurrentPrice, setLiveCurrentPrice] = useState<number | null>(null)

  // Railway WebSocket 연결 유지 (baka:price / baka:closing 이벤트 발행)
  usePriceWorker({})

  // baka:price 이벤트에서 실시간 현재가 수신
  useEffect(() => {
    const onPrice = (e: Event) => {
      const { price } = (e as CustomEvent<{ price: number }>).detail
      setLiveCurrentPrice(price)
    }
    window.addEventListener("baka:price", onPrice)
    return () => window.removeEventListener("baka:price", onPrice)
  }, [])

  // BigRoad: race winner를 road history로 기록 (BIT=banker, COIN=player, TIE=tie)
  const [roadState, setRoadState] = useState<{ history: RoadResult[]; round: number }>({ history: [], round: 0 })
  const prevWinnerRef = useRef<string | null>(null)

  // 마운트 시: DB에서 최근 50라운드 로드 → 빅로드 초기화
  useEffect(() => {
    fetch("/api/race-results?limit=50")
      .then(r => r.json())
      .then(({ results }) => {
        if (!Array.isArray(results) || results.length === 0) return
        // API는 최신순(DESC) → 빅로드는 오래된 순(ASC) 필요
        const sorted = [...results].reverse()
        const history: RoadResult[] = sorted.map((r: { winner: string }) =>
          r.winner === "bit" ? "banker" : r.winner === "coin" ? "player" : "tie"
        )
        // round는 DB 총 누적 라운드 수 기준 (race_results 전체 카운트 대신 time 기반)
        const totalRound = results.length > 0
          ? Math.floor(results[0].time / 300) // 가장 최신 라운드 번호
          : history.length
        setRoadState({ history, round: totalRound })
      })
      .catch(() => {})
  }, [])

  // 새 라운드 결과를 실시간으로 추가 + race:closing 이벤트에서도 수신
  useEffect(() => {
    const onClosing = (e: Event) => {
      const { winner } = (e as CustomEvent<{ winner: "bit" | "coin" | "tie" }>).detail
      const mapped: RoadResult = winner === "bit" ? "banker" : winner === "coin" ? "player" : "tie"
      setRoadState(prev => {
        const next = [...prev.history, mapped].slice(-50)  // 최근 50개 유지 (카운트+빅로드)
        return { history: next, round: prev.round + 1 }
      })
    }
    window.addEventListener("race:closing", onClosing)
    return () => window.removeEventListener("race:closing", onClosing)
  }, [])

  useEffect(() => {
    if (state.winner && state.winner !== prevWinnerRef.current) {
      prevWinnerRef.current = state.winner

      // 라운드 종료 시 클라이언트 직접 정산 — Railway 없이도 잔고 반영
      const token = typeof window !== "undefined"
        ? localStorage.getItem("app_token")
        : null
      if (token) {
        const raceRoundNumber = Math.floor(Date.now() / 1000 / 300)
        fetch("/api/game/settle-me", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            closePrice: state.lastPrice ?? 0,
            roundNumber: raceRoundNumber,
            gameType: "race",
          }),
        })
          .then(r => r.json())
          .then(d => {
            if (typeof d.balance === "number") {
              window.dispatchEvent(new CustomEvent("balance:update", { detail: d.balance }))
            }
          })
          .catch(() => {})
      }
    }
    if (!state.winner) {
      prevWinnerRef.current = null
    }
  }, [state.winner, state.lastPrice])

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #0f1a2a 0%, #080d15 60%, #050a0d 100%)" }}
    >
      <main className="max-w-7xl mx-auto p-3 md:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* 왼쪽: 메인 게임 영역 */}
          <div className="lg:col-span-2 space-y-4">
            {/* BigRoad */}
            <div style={{
              background: "rgba(5,15,10,0.92)",
              border: "1px solid rgba(212,175,55,0.2)",
              borderRadius: 16,
              padding: "12px",
            }}>
              <BigRoad
                history={roadState.history}
                round={roadState.round}
                colorMap={{ banker: BIT_COLOR, player: COIN_COLOR }}
                mode="race"
                playerLabel="코인팀"
                bankerLabel="비트팀"
                tieLabel="타이"
              />
            </div>

            {/* 스코어보드 */}
            <RaceScoreboard state={state} flashes={flashes} />

            {/* 배팅 — baka와 동일 구조, BIT/COIN팀으로 레이블 변경 */}
            <RaceBettingGame />


          </div>

          {/* 오른쪽: 현재가 요약 + 3분 마감 기준가 */}
          <div className="space-y-4">
            <div style={{
              minHeight: 72,
              background: "rgba(5,13,10,0.92)",
              border: "1px solid rgba(212,175,55,0.2)",
              borderRadius: 16,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "rgba(212,175,55,0.5)", letterSpacing: "0.05em" }}>현재가</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: GOLD, fontVariantNumeric: "tabular-nums" }}>
                  {liveCurrentPrice === null ? "—" : `$${liveCurrentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
              </div>
              {liveCurrentPrice !== null && (() => {
                const [d1 = "0", d2 = "0"] = (liveCurrentPrice.toFixed(2).split(".")[1] ?? "00").split("")
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: `${BIT_COLOR}99`, fontWeight: 700 }}>BIT</span>
                    <span style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.45)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: BIT_COLOR }}>{d1}</span>
                    <span style={{ color: "rgba(212,175,55,0.3)" }}>/</span>
                    <span style={{ fontSize: 10, color: `${COIN_COLOR}99`, fontWeight: 700 }}>COIN</span>
                    <span style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.45)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: COIN_COLOR }}>{d2}</span>
                  </div>
                )
              })()}
            </div>

            {/* BITTOTO 헤더 + 3분 마감 기준가 */}
            <div style={{
              background: "rgba(5,13,10,0.95)",
              border: "1px solid rgba(212,175,55,0.2)",
              borderRadius: 20,
              overflow: "hidden",
              padding: "16px",
            }}>
              {/* BITTOTO 타이틀 — /baka의 BACCARAT 뱃지 스타일 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{
                  fontSize: 20, fontWeight: 900, color: GOLD,
                  letterSpacing: "0.08em", fontFamily: "monospace",
                }}>BITTOTO</span>
                <span style={{
                  fontSize: 11, color: "rgba(212,175,55,0.7)", fontWeight: 600,
                  padding: "3px 10px", borderRadius: 6,
                  border: "1px solid rgba(212,175,55,0.3)",
                  background: "rgba(212,175,55,0.06)",
                  letterSpacing: "0.04em",
                }}>비트토토 레이싱</span>
              </div>

              <RaceClosingPrices />
            </div>

          </div>

        </div>
      </main>

      <style>{`
        @keyframes scoreFlash {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-20px) scale(1.3); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
