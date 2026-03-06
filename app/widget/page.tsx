"use client"

import { BaseballChart } from "@/components/widget/baseball-chart"
import { BettingGame } from "@/components/dashboard/betting-game"
import { ClosingPricesBadges } from "@/components/dashboard/closing-prices-badges"
import { ClosingPrices } from "@/components/dashboard/closing-prices"
import { TopBar } from "@/components/dashboard/top-bar"

// /widget — 야구장 테마
// 모든 가격/로직 컴포넌트는 원본 그대로 import → 로직 변경 자동 반영
// 디자인만 별도 관리 (야구장 야간 경기 분위기)
export default function WidgetPage() {
  return (
    <div
      className="min-h-screen font-sans"
      style={{
        background: "linear-gradient(160deg, #0a1a08 0%, #0e2a0c 35%, #0d1f0b 70%, #080f06 100%)",
      }}
    >
      {/* 스타디움 조명 효과 */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div className="absolute top-0 left-[8%] w-[180px] h-[60%]"
          style={{ background: "radial-gradient(ellipse 90px 50% at center top, rgba(255,210,60,0.07), transparent)" }} />
        <div className="absolute top-0 right-[8%] w-[180px] h-[60%]"
          style={{ background: "radial-gradient(ellipse 90px 50% at center top, rgba(255,210,60,0.07), transparent)" }} />
        <div className="absolute top-0 left-[30%] w-[200px] h-[40%]"
          style={{ background: "radial-gradient(ellipse 100px 40% at center top, rgba(255,220,80,0.04), transparent)" }} />
        <div className="absolute top-0 right-[30%] w-[200px] h-[40%]"
          style={{ background: "radial-gradient(ellipse 100px 40% at center top, rgba(255,220,80,0.04), transparent)" }} />
      </div>

      {/* 탑바 (원본 로직 그대로) */}
      <div className="relative z-10">
        <TopBar />
      </div>

      <main className="relative z-10 p-3 md:p-5 mt-2">
        <div className="max-w-7xl mx-auto">

          {/* 야구장 타이틀 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <svg width="16" height="16" viewBox="0 0 32 32" className="shrink-0">
                <circle cx="16" cy="16" r="15" fill="#f5f0e8" stroke="#e8dcc8" strokeWidth="1" />
                <path d="M10 7 Q8 12 10 16 Q8 20 10 25" stroke="#cc2200" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                <path d="M22 7 Q24 12 22 16 Q24 20 22 25" stroke="#cc2200" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
              <span className="text-xs font-semibold text-white/70 tracking-widest uppercase">Baseball Stadium</span>
            </div>
            <span className="text-[10px] text-white/30 tracking-wider">거래대금 크기에 따라 플레이가 달라집니다</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* 왼쪽: 야구장 차트 + 배팅 */}
            <div className="lg:col-span-2 space-y-4">
              {/* 야구장 차트 — BitcoinChart 원본 위에 야구 오버레이 */}
              <div className="rounded-2xl overflow-hidden shadow-2xl"
                style={{
                  boxShadow: "0 0 0 1px rgba(255,210,60,0.12), 0 20px 60px rgba(0,0,0,0.5)",
                }}>
                <BaseballChart />
              </div>

              {/* 배팅 게임 원본 */}
              <div className="rounded-2xl overflow-hidden shadow-xl"
                style={{
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 12px 40px rgba(0,0,0,0.4)",
                }}>
                <BettingGame />
              </div>
            </div>

            {/* 오른쪽: 끝자리 + 마감가 */}
            <div className="space-y-4">
              <div className="rounded-2xl overflow-hidden shadow-xl"
                style={{
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 12px 40px rgba(0,0,0,0.4)",
                }}>
                <ClosingPricesBadges />
              </div>
              <div className="rounded-2xl overflow-hidden shadow-xl"
                style={{
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 12px 40px rgba(0,0,0,0.4)",
                }}>
                <ClosingPrices />
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  )
}
