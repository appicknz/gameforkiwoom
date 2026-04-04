"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useRaceGame } from "@/components/race/race-game"
import { RaceScoreboard } from "@/components/race/race-scoreboard"
import { RaceBettingGame } from "@/components/race/race-betting-game"
import { RaceClosingPrices } from "@/components/race/race-closing-prices"
import { usePriceWorker } from "@/hooks/use-price-worker"
import { BitcoinChart } from "@/components/dashboard/bitcoin-chart"
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

  // 마운트 시 DB에서 과거 결과 로드 → 누구나 같은 히스토리
  useEffect(() => {
    fetch("/api/race-results")
      .then(r => r.json())
      .then(({ results }) => {
        if (!Array.isArray(results) || results.length === 0) return
        const history: RoadResult[] = results.map((r: { winner: string }) =>
          r.winner === "bit" ? "banker" : r.winner === "coin" ? "player" : "tie"
        )
        setRoadState({ history, round: history.length })
      })
      .catch(() => {})
  }, [])

  // 새 라운드 결과를 실시간으로 추가 + race:closing 이벤트에서도 수신
  useEffect(() => {
    const onClosing = (e: Event) => {
      const { winner } = (e as CustomEvent<{ winner: "bit" | "coin" | "tie" }>).detail
      const mapped: RoadResult = winner === "bit" ? "banker" : winner === "coin" ? "player" : "tie"
      setRoadState(prev => ({ history: [...prev.history, mapped], round: prev.round + 1 }))
    }
    window.addEventListener("race:closing", onClosing)
    return () => window.removeEventListener("race:closing", onClosing)
  }, [])

  useEffect(() => {
    if (state.winner && state.winner !== prevWinnerRef.current) {
      prevWinnerRef.current = state.winner
    }
    if (!state.winner) {
      prevWinnerRef.current = null
    }
  }, [state.winner])

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #0f1a2a 0%, #080d15 60%, #050a0d 100%)" }}
    >
      <main className="max-w-7xl mx-auto p-3 md:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* 왼쪽: 메인 게임 영역 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 헤더: 기준가+현재가 왼쪽 한 줄, 스코어 오른쪽 */}
            <div style={{
              background: "rgba(5,13,10,0.92)",
              border: "1px solid rgba(212,175,55,0.2)",
              borderRadius: 16,
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              {/* 왼쪽: 현재가 + 소수점 뱃지 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "rgba(212,175,55,0.5)", letterSpacing: "0.05em" }}>현재가</span>
                {liveCurrentPrice !== null ? (() => {
                  const fixed = liveCurrentPrice.toFixed(2)
                  const [intPart, decPart] = fixed.split(".")
                  const formatted = `$${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.`
                  const d1 = decPart?.[0] ?? "0"
                  const d2 = decPart?.[1] ?? "0"
                  return (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>{formatted}</span>
                      <span style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: "rgba(212,175,55,0.18)", border: "1px solid rgba(212,175,55,0.45)",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800, color: GOLD,
                      }}>{d1}</span>
                      <span style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: "rgba(212,175,55,0.18)", border: "1px solid rgba(212,175,55,0.45)",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800, color: GOLD,
                      }}>{d2}</span>
                    </span>
                  )
                })() : <span style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>—</span>}
              </div>
              {/* 오른쪽: 현재 라운드 누적 스코어 */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
                <span style={{ color: BIT_COLOR }}>BIT {state.bitScore.toLocaleString()}</span>
                <span style={{ color: "rgba(212,175,55,0.35)" }}>/</span>
                <span style={{ color: COIN_COLOR }}>COIN {state.coinScore.toLocaleString()}</span>
              </div>
            </div>

            {/* 최근 득점 (헤더 아래 ~ 빅로드 위) */}
            {flashes.length > 0 && (
              <div style={{
                background: "rgba(5,13,10,0.9)",
                border: "1px solid rgba(212,175,55,0.15)",
                borderRadius: 12,
                padding: "8px 14px",
                display: "flex",
                gap: 6,
                alignItems: "center",
                overflowX: "auto",
              }}>
                <span style={{ fontSize: 10, color: "rgba(212,175,55,0.5)", whiteSpace: "nowrap", marginRight: 2 }}>최근 득점:</span>
                {flashes.slice(-8).reverse().map(f => (
                  <span key={f.id} style={{
                    fontSize: 11,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6,
                    padding: "2px 8px",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}>
                    <span style={{ color: BIT_COLOR }}>+{f.bit}</span>
                    <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 3px" }}>/</span>
                    <span style={{ color: COIN_COLOR }}>+{f.coin}</span>
                  </span>
                ))}
              </div>
            )}

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
              />
            </div>

            {/* 스코어보드 */}
            <RaceScoreboard state={state} />

            {/* 배팅 — baka와 동일 구조, BIT/COIN팀으로 레이��� 변경 */}
            <RaceBettingGame />


          </div>

          {/* 오른쪽: 차트 + 5분 마감 기준가 */}
          <div className="space-y-4">
            {/* BitcoinChart — baka와 동일 */}
            <div
              className="rounded-2xl overflow-hidden sticky top-4"
              style={{
                border: "1px solid rgba(212,175,55,0.2)",
                boxShadow: "0 0 50px rgba(212,175,55,0.06)",
              }}
            >
                <BitcoinChart mode="race" />
            </div>

            {/* 5분 마감 기준가 + 게임 규칙 */}
            <div style={{
              background: "rgba(5,13,10,0.95)",
              border: "1px solid rgba(212,175,55,0.2)",
              borderRadius: 20,
              overflow: "hidden",
              padding: "16px",
            }}>
              {/* BIT vs COIN 설명 */}
              <div style={{ marginBottom: 16, padding: "12px", background: "rgba(212,175,55,0.04)", borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 8 }}>게임 규칙</div>
                <div style={{ fontSize: 11, color: "rgba(212,175,55,0.6)", lineHeight: 1.6 }}>
                  · 1분 배팅 → 4분 레이싱<br />
                  · 매 초 BTC 현재가 수신<br />
                  · <span style={{ color: BIT_COLOR }}>BIT팀</span>: 소수점 첫째 자리 누적<br />
                  · <span style={{ color: COIN_COLOR }}>COIN팀</span>: 소수점 둘째 자리 누적<br />
                  · 4분 후 더 높은 팀 승리
                </div>
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
