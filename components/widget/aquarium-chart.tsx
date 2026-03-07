"use client"

import { useState, useCallback } from "react"
import { BitcoinChart, type BasePriceCoord } from "@/components/dashboard/bitcoin-chart"
import { AquariumOverlay } from "@/components/widget/aquarium-overlay"

// BitcoinChart를 그대로 쓰되, 차트 영역 위에 수족관 오버레이를 얹는 래퍼
// 배팅 기준가의 차트 픽셀 좌표를 오버레이로 전달하여 레이더 타겟 위치에 사용
export function AquariumChart() {
  const [basePriceCoord, setBasePriceCoord] = useState<BasePriceCoord | null>(null)
  const handleCoord = useCallback((c: BasePriceCoord | null) => setBasePriceCoord(c), [])

  return (
    <div className="relative">
      <BitcoinChart onBasePriceCoord={handleCoord} />
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
        <AquariumOverlay basePriceCoord={basePriceCoord} />
      </div>
    </div>
  )
}
