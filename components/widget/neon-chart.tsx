"use client"

import { useRef, useState } from "react"
import { BitcoinChart } from "@/components/dashboard/bitcoin-chart"
import AquariumOverlay from "@/components/widget/aquarium-overlay"

// BitcoinChart를 다크 네온 테마로 감싸고 레이더/전투기 오버레이를 얹습니다.
// BitcoinChart 내부의 Card 배경을 네온 다크로 덮어씁니다.
export function NeonChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  // BitcoinChart 내부의 배팅가 수평선 Y좌표를 오버레이로 전달하기 위한 state
  // AquariumOverlay는 basePriceCoord가 null이어도 동작합니다.
  const [basePriceCoord] = useState<{ x: number; y: number } | null>(null)

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      style={{ background: "#0d1526" }}
    >
      {/* BitcoinChart — 다크 네온 테마 오버라이드 */}
      <div
        style={{
          // Card 컴포넌트의 기본 배경/보더를 네온 테마로 덮어씀
          "--background": "13 21 38",           // #0d1526
          "--border": "0 255 136 / 0.12",
          "--foreground": "255 255 255",
          "--muted-foreground": "255 255 255 / 0.4",
          "--card": "13 21 38",
        } as React.CSSProperties}
      >
        <BitcoinChart />
      </div>

      {/* 레이더/전투기 오버레이 — 차트 영역 위에 절대 배치 */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
      >
        <AquariumOverlay basePriceCoord={basePriceCoord} />
      </div>
    </div>
  )
}
