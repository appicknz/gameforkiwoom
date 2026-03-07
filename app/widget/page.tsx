"use client"

import { AquariumChart } from "@/components/widget/aquarium-chart"
import { BettingGame } from "@/components/dashboard/betting-game"
import { ClosingPricesBadges } from "@/components/dashboard/closing-prices-badges"
import { ClosingPrices } from "@/components/dashboard/closing-prices"
import { TopBar } from "@/components/dashboard/top-bar"

// 사이버펑크 네온 테마 CSS 토큰 — /widget 전용 (oklch 포맷)
const CYBER_THEME = `
  :root {
    --background:           oklch(0.08 0.02 220);
    --foreground:           oklch(0.97 0.01 180);
    --card:                 oklch(0.10 0.02 220);
    --card-foreground:      oklch(0.97 0.01 180);
    --popover:              oklch(0.10 0.02 220);
    --popover-foreground:   oklch(0.97 0.01 180);
    --primary:              oklch(0.85 0.22 174);
    --primary-foreground:   oklch(0.08 0.02 220);
    --secondary:            oklch(0.15 0.03 220);
    --secondary-foreground: oklch(0.97 0.01 180);
    --muted:                oklch(0.14 0.03 220);
    --muted-foreground:     oklch(0.92 0.01 180);
    --accent:               oklch(0.85 0.22 174);
    --accent-foreground:    oklch(0.08 0.02 220);
    --destructive:          oklch(0.60 0.22 27);
    --destructive-foreground: oklch(0.97 0.01 0);
    --border:               oklch(0.28 0.05 174);
    --input:                oklch(0.14 0.03 220);
    --ring:                 oklch(0.85 0.22 174);
    --radius:               0.75rem;
    --neon-green:           #00ff88;
    --neon-cyan:            #00e5ff;
  }
`

export default function WidgetPage() {
  return (
    <>
      {/* 사이버펑크 CSS 변수 주입 — 이 페이지 범위에만 적용 */}
      <style>{CYBER_THEME}</style>

      <div
        className="min-h-screen font-mono"
        style={{
          background: "radial-gradient(ellipse at top, #0d1b2a 0%, #050d14 60%, #020912 100%)",
        }}
      >
        {/* 배경 그리드 패턴 */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(0,255,200,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,255,200,0.03) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />

        <TopBar />

        <main className="relative z-10 p-3 md:p-4 pt-2">
          <div className="max-w-2xl mx-auto space-y-3">

            {/* 차트 */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                border: "1px solid rgba(0,255,200,0.2)",
                boxShadow: "0 0 30px rgba(0,255,200,0.05), inset 0 0 30px rgba(0,0,0,0.3)",
                background: "rgba(5,15,25,0.95)",
              }}
            >
              <AquariumChart />
            </div>

            {/* 배팅 게임 */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                border: "1px solid rgba(0,255,200,0.15)",
                boxShadow: "0 0 20px rgba(0,255,200,0.04)",
                background: "rgba(5,15,25,0.95)",
              }}
            >
              <BettingGame />
            </div>

            {/* 끝자리 배지 */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                border: "1px solid rgba(0,255,200,0.15)",
                boxShadow: "0 0 20px rgba(0,255,200,0.04)",
                background: "rgba(5,15,25,0.95)",
              }}
            >
              <ClosingPricesBadges />
            </div>

            {/* 마감 기준가 */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                border: "1px solid rgba(0,255,200,0.15)",
                boxShadow: "0 0 20px rgba(0,255,200,0.04)",
                background: "rgba(5,15,25,0.95)",
              }}
            >
              <ClosingPrices />
            </div>

          </div>
        </main>
      </div>
    </>
  )
}
