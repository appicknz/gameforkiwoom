"use client"

import { useState, useCallback } from "react"
import { GameChart } from "@/components/game/game-chart"
import AquariumOverlay from "@/components/widget/aquarium-overlay"

// GameChart(로직)를 그대로 쓰되, 네온 테마 컨테이너로 감싸고
// 레이더/전투기 오버레이를 추가
export function NeonChart() {
  const [basePriceCoord, setBasePriceCoord] = useState<{ x: number; y: number } | null>(null)
  const handleCoord = useCallback((c: { x: number; y: number } | null) => setBasePriceCoord(c), [])

  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: "#0d1526",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* 실제 차트 */}
      <div style={{ height: "260px" }}>
        <GameChart onBasePriceCoord={handleCoord} />
      </div>

      {/* 레이더/전투기 오버레이 — 오른쪽 price scale(약 65px)은 제외해 라벨을 가리지 않음 */}
      <div
        className="absolute top-0 left-0 bottom-0 pointer-events-none z-10"
        style={{ height: "260px", right: "65px", overflow: "hidden" }}
      >
        <AquariumOverlay basePriceCoord={basePriceCoord} />
      </div>
    </div>
  )
}
