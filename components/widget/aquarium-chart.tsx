"use client"

import { BitcoinChart } from "@/components/dashboard/bitcoin-chart"
import { AquariumOverlay } from "@/components/widget/aquarium-overlay"

// BitcoinChart를 그대로 쓰되, 차트 영역 위에 수족관 오버레이를 얹는 래퍼
// 로직(가격 파싱, 소수점 처리, 인터벌 등)은 BitcoinChart 원본에서 그대로 상속됨
export function AquariumChart() {
  return (
    <div className="relative">
      <BitcoinChart />
      {/* 차트 영역(h-[260px] + padding)에 맞춰 오버레이 위치 조정 */}
      <div
        className="absolute pointer-events-none"
        style={{
          // BitcoinChart Card의 padding(p-4 = 16px) + 헤더 영역(약 70px) 아래부터
          top: "86px",
          left: "16px",
          right: "16px",
          height: "260px",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <AquariumOverlay />
      </div>
    </div>
  )
}
