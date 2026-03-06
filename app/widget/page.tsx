"use client"

import dynamic from "next/dynamic"
import { BettingGame }          from "@/components/dashboard/betting-game"
import { ClosingPricesBadges }  from "@/components/dashboard/closing-prices-badges"
import { ClosingPrices }        from "@/components/dashboard/closing-prices"
import { TopBar }               from "@/components/dashboard/top-bar"
import { SpaceChart }           from "@/components/widget/space-chart"

// /widget — 우주 전쟁 테마
// 모든 가격/로직 컴포넌트는 원본 그대로 import → 로직 변경 자동 반영
// 디자인만 별도 관리

export default function WidgetPage() {
  return (
    <div
      className="min-h-screen font-mono"
      style={{ background: "#000d00" }}
    >
      {/* 별 배경 */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        {Array.from({ length: 80 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left:    `${Math.random() * 100}%`,
              top:     `${Math.random() * 100}%`,
              width:   Math.random() > 0.9 ? 2 : 1,
              height:  Math.random() > 0.9 ? 2 : 1,
              background: "#ffffff",
              opacity: 0.2 + Math.random() * 0.6,
              animation: `pulse ${2 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {/* 스캔라인 */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.015) 2px, rgba(0,255,65,0.015) 4px)",
        }}
      />

      {/* 탑바 */}
      <div className="relative z-10" style={{ borderBottom: "1px solid #00ff4120" }}>
        <TopBar />
      </div>

      <main className="relative z-10 p-3 md:p-4 mt-2">
        <div className="max-w-7xl mx-auto">

          {/* HUD 타이틀 */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded"
              style={{
                background: "rgba(0,255,65,0.05)",
                border:     "1px solid rgba(0,255,65,0.2)",
                color:      "#00ff41",
              }}
            >
              <span className="text-[10px] tracking-[0.2em] uppercase font-mono">
                ◈ BITBET COMMAND CENTER
              </span>
            </div>
            <div
              className="text-[9px] tracking-widest font-mono animate-pulse"
              style={{ color: "#00ff4166" }}
            >
              LIVE · BTCUSDT FUTURES
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 차트 + 배팅 */}
            <div className="lg:col-span-2 space-y-4">
              <div
                className="rounded overflow-hidden"
                style={{
                  border:     "1px solid #00ff4122",
                  boxShadow:  "0 0 30px rgba(0,255,65,0.05), inset 0 0 30px rgba(0,255,65,0.02)",
                }}
              >
                <SpaceChart />
              </div>
              <div
                className="rounded overflow-hidden"
                style={{
                  border:    "1px solid #00ff4122",
                  boxShadow: "0 0 20px rgba(0,255,65,0.04)",
                }}
              >
                <BettingGame />
              </div>
            </div>

            {/* 끝자리 + 마감가 */}
            <div className="space-y-4">
              <div
                className="rounded overflow-hidden"
                style={{
                  border:    "1px solid #00ff4122",
                  boxShadow: "0 0 20px rgba(0,255,65,0.04)",
                }}
              >
                <ClosingPricesBadges />
              </div>
              <div
                className="rounded overflow-hidden"
                style={{
                  border:    "1px solid #00ff4122",
                  boxShadow: "0 0 20px rgba(0,255,65,0.04)",
                }}
              >
                <ClosingPrices />
              </div>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}
