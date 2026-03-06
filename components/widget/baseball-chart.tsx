"use client"

import { BitcoinChart } from "@/components/dashboard/bitcoin-chart"
import { BaseballOverlay } from "@/components/widget/baseball-overlay"

// BitcoinChart 원본 로직 그대로 사용 + 야구장 오버레이만 추가
export function BaseballChart() {
  return (
    <div className="relative">
      <BitcoinChart />
      {/* 차트 캔버스 영역에만 오버레이 적용 (헤더 86px + 패딩 16px 아래) */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "86px",
          left: "16px",
          right: "16px",
          height: "260px",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <BaseballOverlay />
      </div>
    </div>
  )
}
