"use client"

import { GameChart } from "@/components/game/game-chart"

// GameChart(로직)를 그대로 쓰되, 네온 테마 컨테이너로 감쌈
// 차트 배경은 game-chart 내부에서 #0a0e1a로 이미 설정되어 있음
export function NeonChart() {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: "#0d1526",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* 레이더 글로우 오버레이 — 포인터 이벤트 없음 */}
      <div
        className="absolute pointer-events-none z-10"
        style={{
          bottom: "40px",
          left: "50%",
          transform: "translateX(-20%)",
          width: "180px",
          height: "180px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,255,136,0.07) 0%, rgba(0,255,136,0.03) 40%, transparent 70%)",
        }}
      />
      {/* 두 번째 레이더 링 */}
      <div
        className="absolute pointer-events-none z-10"
        style={{
          bottom: "30px",
          left: "50%",
          transform: "translateX(-20%)",
          width: "120px",
          height: "120px",
          borderRadius: "50%",
          border: "1px solid rgba(0,255,136,0.08)",
          boxShadow: "0 0 20px rgba(0,255,136,0.05)",
        }}
      />

      {/* 실제 차트 */}
      <div style={{ height: "260px" }}>
        <GameChart />
      </div>
    </div>
  )
}
