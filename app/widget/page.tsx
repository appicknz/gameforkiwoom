"use client"

import { AquariumChart } from "@/components/widget/aquarium-chart"
import { BettingGame } from "@/components/dashboard/betting-game"
import { ClosingPricesBadges } from "@/components/dashboard/closing-prices-badges"
import { ClosingPrices } from "@/components/dashboard/closing-prices"
import { TopBar } from "@/components/dashboard/top-bar"

// 사이버펑크 네온 테마 CSS 토큰 — /widget 전용
const CYBER_THEME = `
  :root {
    --background: 222 47% 5%;
    --foreground: 180 100% 90%;
    --card: 220 40% 8%;
    --card-foreground: 180 100% 90%;
    --popover: 220 40% 8%;
    --popover-foreground: 180 100% 90%;
    --primary: 174 100% 50%;
    --primary-foreground: 222 47% 5%;
    --secondary: 220 30% 14%;
    --secondary-foreground: 174 80% 70%;
    --muted: 220 35% 12%;
    --muted-foreground: 210 30% 55%;
    --accent: 174 100% 50%;
    --accent-foreground: 222 47% 5%;
    --destructive: 0 85% 55%;
    --destructive-foreground: 0 0% 100%;
    --border: 174 40% 18%;
    --input: 220 35% 12%;
    --ring: 174 100% 50%;
    --radius: 0.75rem;
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
