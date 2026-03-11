"use client"

import { useState, useCallback } from "react"
import { GameChart } from "@/components/game/game-chart"
import BaccaratGame from "@/components/baka/baccarat-game"
import { TopBar } from "@/components/dashboard/top-bar"

export default function BakaPage() {
  const [basePriceCoord, setBasePriceCoord] = useState<{ x: number; y: number } | null>(null)
  const handleCoord = useCallback((c: { x: number; y: number } | null) => setBasePriceCoord(c), [])

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "#09080a" }}
    >
      {/* TopBar */}
      <div style={{ background: "#0d0b0e", borderBottom: "1px solid rgba(212,175,55,0.1)" }}>
        <TopBar />
      </div>

      <main className="max-w-7xl mx-auto p-3 md:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* 왼쪽: 차트 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 타이틀 */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h1
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#d4af37",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Baccarat
              </h1>
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(212,175,55,0.5)",
                  border: "1px solid rgba(212,175,55,0.2)",
                  padding: "2px 8px",
                  borderRadius: 4,
                  letterSpacing: "0.1em",
                }}
              >
                BTC 끝자리 기반
              </div>
            </div>

            {/* 차트 */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                border: "1px solid rgba(212,175,55,0.15)",
                boxShadow: "0 0 40px rgba(212,175,55,0.04)",
              }}
            >
              {/* 차트 헤더 */}
              <div
                style={{
                  padding: "10px 14px",
                  background: "rgba(212,175,55,0.04)",
                  borderBottom: "1px solid rgba(212,175,55,0.08)",
                  fontSize: 11,
                  color: "rgba(212,175,55,0.6)",
                  letterSpacing: "0.08em",
                }}
              >
                BTC/USDT · 1초봉
              </div>
              <div style={{ height: 260 }}>
                <GameChart interval="1s" onBasePriceCoord={handleCoord} />
              </div>
            </div>

            {/* 게임 규칙 요약 */}
            <div
              className="rounded-2xl"
              style={{
                border: "1px solid rgba(212,175,55,0.1)",
                background: "rgba(212,175,55,0.03)",
                padding: "14px 16px",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(212,175,55,0.7)", letterSpacing: "0.1em", marginBottom: 10 }}>
                게임 방식
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    title: "카드 생성",
                    desc: "비트코인 실시간 가격의 1의 자리 숫자가 카드 값으로 사용됩니다. (예: 68944.31 → 4)",
                  },
                  {
                    title: "바카라 규칙",
                    desc: "9에 가까운 쪽이 승리. 10·J·Q·K = 0점, A = 1점. 합산은 10으로 나눈 나머지.",
                  },
                  {
                    title: "배당",
                    desc: "Player 1:1 · Banker 1:0.95 (5% 커미션) · Tie 8:1",
                  },
                ].map(({ title, desc }) => (
                  <div
                    key={title}
                    style={{
                      background: "rgba(212,175,55,0.04)",
                      border: "1px solid rgba(212,175,55,0.1)",
                      borderRadius: 8,
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#d4af37", marginBottom: 5 }}>{title}</div>
                    <div style={{ fontSize: 11, color: "rgba(232,213,163,0.5)", lineHeight: 1.6 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 오른쪽: 바카라 게임 */}
          <div>
            <div
              className="rounded-2xl overflow-hidden sticky top-4"
              style={{
                border: "1px solid rgba(212,175,55,0.2)",
                boxShadow: "0 0 50px rgba(212,175,55,0.06)",
              }}
            >
              <BaccaratGame />
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
