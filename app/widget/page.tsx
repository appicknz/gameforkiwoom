"use client"

import { AquariumChart } from "@/components/widget/aquarium-chart"
import { BettingGame } from "@/components/dashboard/betting-game"
import { ClosingPricesBadges } from "@/components/dashboard/closing-prices-badges"
import { ClosingPrices } from "@/components/dashboard/closing-prices"
import { TopBar } from "@/components/dashboard/top-bar"

// /widget 경로
// - 로직(가격 파싱, 인터벌, 배팅 기준가, 거래대금 등)은 원본 컴포넌트를 그대로 import
// - 디자인만 별도 관리: 수족관 오버레이 + 딥씨 테마
export default function WidgetPage() {
  return (
    <div
      className="min-h-screen"
      style={{
        background: "linear-gradient(160deg, #0c1445 0%, #0a3252 40%, #053d5a 70%, #062d42 100%)",
      }}
    >
      <TopBar />

      <main className="p-3 md:p-5 mt-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* 왼쪽: 차트 + 배팅 */}
            <div className="lg:col-span-2 space-y-4">
              {/* 수족관 차트 */}
              <div className="rounded-2xl overflow-hidden ring-1 ring-sky-500/20 shadow-2xl shadow-sky-900/40">
                <AquariumChart />
              </div>

              {/* 배팅 게임 - 딥씨 스타일 */}
              <div className="rounded-2xl overflow-hidden ring-1 ring-sky-500/20 shadow-xl shadow-sky-900/30">
                <BettingGame />
              </div>
            </div>

            {/* 오른쪽: 끝자리 + 마감가 */}
            <div className="space-y-4">
              <div className="rounded-2xl overflow-hidden ring-1 ring-sky-500/20 shadow-xl shadow-sky-900/30">
                <ClosingPricesBadges />
              </div>
              <div className="rounded-2xl overflow-hidden ring-1 ring-sky-500/20 shadow-xl shadow-sky-900/30">
                <ClosingPrices />
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  )
}
