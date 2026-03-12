"use client"

import { useState, useCallback } from "react"
import { GameChart, type ChartInterval } from "@/components/game/game-chart"
import AquariumOverlay from "@/components/widget/aquarium-overlay"

const INTERVALS: { key: ChartInterval; label: string }[] = [
  { key: "1s",  label: "1초" },
  { key: "30s", label: "30초" },
  { key: "1m",  label: "1분" },
  { key: "1h",  label: "1시간" },
  { key: "1d",  label: "1일" },
]

export function NeonChart() {
  const [basePriceCoord, setBasePriceCoord] = useState<{ x: number; y: number } | null>(null)
  const [interval, setInterval] = useState<ChartInterval>("1s")
  const handleCoord = useCallback((c: { x: number; y: number } | null) => setBasePriceCoord(c), [])

  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: "#0d1526",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* 타임프레임 선택 버튼 */}
      <div className="flex items-center gap-1 px-3 pt-2 pb-1">
        {INTERVALS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setInterval(key)}
            className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
            style={{
              background: interval === key ? "rgba(0,255,136,0.18)" : "transparent",
              color: interval === key ? "#00ff88" : "rgba(255,255,255,0.35)",
              border: interval === key ? "1px solid rgba(0,255,136,0.35)" : "1px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 실제 차트 */}
      <div style={{ height: "260px" }}>
        <GameChart interval={interval} onBasePriceCoord={handleCoord} />
      </div>

      {/* 레이더/전투기 오버레이 */}
      <div
        className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none z-10"
        style={{ height: "260px" }}
      >
        <AquariumOverlay basePriceCoord={basePriceCoord} />
      </div>
    </div>
  )
}
