"use client"

import { NeonBettingGame } from "@/components/widget/neon-betting-game"
import { NeonChart } from "@/components/widget/neon-chart"
import { NeonClosingPricesBadges } from "@/components/widget/neon-closing-prices-badges"
import { NeonClosingPrices } from "@/components/widget/neon-closing-prices"
import { TopBar } from "@/components/dashboard/top-bar"

// /widget — 네온 사이버펑크 테마
// 로직: 원본 컴포넌트(BettingGame 로직) 그대로 NeonBettingGame으로 이식
// 디자인: 완전히 새로운 다크 네온 테마, 원본 / (메인 페이지) 유지
export default function WidgetPage() {
  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "#080c18" }}
    >
      {/* 네온 TopBar — 배경 오버라이드 */}
      <div style={{ background: "#0d1526", borderBottom: "1px solid rgba(0,255,136,0.1)" }}>
        <TopBar />
      </div>

      <main className="max-w-7xl mx-auto p-3 md:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

          {/* 왼쪽: 차트 + 배팅 패널 */}
          <div className="lg:col-span-2 space-y-3">
            {/* 네온 차트 */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: "1px solid rgba(0,255,136,0.12)", boxShadow: "0 0 40px rgba(0,255,136,0.06)" }}
            >
              <NeonChart />
            </div>

            {/* 네온 배팅 게임 */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: "1px solid rgba(0,255,136,0.12)", boxShadow: "0 0 40px rgba(0,255,136,0.05)" }}
            >
              <NeonBettingGame />
            </div>
          </div>

          {/* 오른쪽: 끝자리 + 마감가 */}
          <div className="space-y-3">
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: "#0d1526", border: "1px solid rgba(0,255,136,0.12)", boxShadow: "0 0 30px rgba(0,255,136,0.05)" }}
            >
              <NeonClosingPricesBadges />
            </div>
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: "#0d1526", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 0 20px rgba(0,0,0,0.3)" }}
            >
              <NeonClosingPrices />
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
