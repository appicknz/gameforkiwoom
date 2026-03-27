"use client"

import { useEffect, useRef } from "react"
import { TopBar } from "@/components/dashboard/top-bar"
import { useRaceGame } from "@/components/race/race-game"
import { RaceScoreboard } from "@/components/race/race-scoreboard"
import { RaceBetting } from "@/components/race/race-betting"
import { RaceClosingPrices } from "@/components/race/race-closing-prices"
import { usePriceWorker } from "@/hooks/use-price-worker"

const BIT_COLOR = "#3b82f6"
const COIN_COLOR = "#f97316"
const GOLD = "#d4af37"

// 현재가 헤더 (baka:price 이벤트로 DOM 직접 업데이트)
function LivePriceHeader() {
  const currentRef = useRef<HTMLSpanElement>(null)
  const baseRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    // 초기값
    const initPrices: Array<{ price: number }> = (window as any).__bitcoinClosingPrices ?? []
    if (initPrices.length > 0 && baseRef.current) {
      const p = initPrices[initPrices.length - 1].price
      baseRef.current.textContent = `$${p.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
    }

    const onPrice = (e: Event) => {
      const { price } = (e as CustomEvent<{ price: number }>).detail
      if (currentRef.current) {
        currentRef.current.textContent = `$${price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
      }
    }
    const onClosing = (e: Event) => {
      const { price } = (e as CustomEvent<{ price: number }>).detail
      if (baseRef.current) {
        baseRef.current.textContent = `$${price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
      }
    }

    window.addEventListener("baka:price", onPrice)
    window.addEventListener("baka:closing", onClosing)
    return () => {
      window.removeEventListener("baka:price", onPrice)
      window.removeEventListener("baka:closing", onClosing)
    }
  }, [])

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 14px",
      background: "rgba(5,15,10,0.92)",
      border: "1px solid rgba(212,175,55,0.15)",
      borderRadius: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "radial-gradient(circle at 35% 35%, #f7931a, #c06000)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 900, color: "#fff", flexShrink: 0,
        }}>₿</div>
        <div>
          <div style={{ fontSize: 9, color: "rgba(232,213,163,0.45)", letterSpacing: "0.06em", marginBottom: 1 }}>배팅 기준가</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: GOLD, fontVariantNumeric: "tabular-nums" }}>
            <span ref={baseRef}>—</span>
          </div>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 9, color: "rgba(232,213,163,0.45)", letterSpacing: "0.06em", marginBottom: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
          현재가
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#10b981", fontVariantNumeric: "tabular-nums" }}>
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

  // Railway WebSocket 연결 유지 (baka:price / baka:closing 이벤트 발행)
  usePriceWorker({})

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #0f1a2a 0%, #080d15 60%, #050a0d 100%)" }}
    >
      <div style={{ background: "rgba(5,10,13,0.95)", borderBottom: "1px solid rgba(212,175,55,0.12)" }}>
        <TopBar />
      </div>

      <main className="max-w-7xl mx-auto p-3 md:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* 왼쪽: 메인 게임 영역 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 현재가 헤더 */}
            <LivePriceHeader />

            {/* 게임 제목 배너 */}
            <div style={{
              padding: "16px 20px",
              background: "rgba(5,13,20,0.92)",
              border: "1px solid rgba(212,175,55,0.2)",
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: GOLD, letterSpacing: "0.06em" }}>BTC RACE</div>
                <div style={{ fontSize: 11, color: "rgba(212,175,55,0.5)", marginTop: 2 }}>
                  소수점 숫자 누적 대결 · 5분 1라운드
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(59,130,246,0.7)" }}>BIT 팀</div>
                  <div style={{ fontSize: 11, color: BIT_COLOR, fontWeight: 700 }}>소수점 첫째</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>VS</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(249,115,22,0.7)" }}>COIN 팀</div>
                  <div style={{ fontSize: 11, color: COIN_COLOR, fontWeight: 700 }}>소수점 둘째</div>
                </div>
              </div>
            </div>

            {/* 레이스 트랙 */}
            <RaceTrack secondsInRound={state.secondsInRound} phase={state.phase} />

            {/* 스코어보드 */}
            <RaceScoreboard state={state} />

            {/* 배팅 */}
            <RaceBetting
              phase={state.phase}
              roundId={state.roundId}
              winner={state.winner}
            />

            {/* 최근 득점 플래시 (레이싱 중) */}
            {state.phase === "racing" && flashes.length > 0 && (
              <div style={{
                background: "rgba(5,13,10,0.9)",
                border: "1px solid rgba(212,175,55,0.15)",
                borderRadius: 12,
                padding: "10px 14px",
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
              }}>
                <span style={{ fontSize: 10, color: "rgba(212,175,55,0.5)", marginRight: 4 }}>최근 득점:</span>
                {flashes.slice(-8).reverse().map(f => (
                  <span key={f.id} style={{
                    fontSize: 11,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6,
                    padding: "2px 8px",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    <span style={{ color: BIT_COLOR }}>+{f.bit}</span>
                    <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 3px" }}>/</span>
                    <span style={{ color: COIN_COLOR }}>+{f.coin}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 오른쪽: 5분 마감 기준가 패널 */}
          <div className="space-y-4">
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
