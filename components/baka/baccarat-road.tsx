"use client"

import { useMemo, useState } from "react"
import type { BacResult } from "./baccarat-utils"

// ─── 빅로드(대로) 스코어보드 ────────────────────────────────────────────────
// 바카라 결과를 컬럼 방식 동그라미로 표시
// B = 빨강, P = 파랑(비어있음), T = 초록 사선

interface BaccaratRoadProps {
  history: BacResult[]  // 오래된→최신 순
  maxRows?: number      // 표시 행 수 (default 6)
  className?: string
}

const DOT_SIZE = 14
const GAP = 2
const ROWS = 6

// 컬럼 배치 계산 (표준 빅로드 규칙)
// 같은 결과 연속 → 같은 컬럼 아래로, 바뀌면 새 컬럼
function buildGrid(history: BacResult[]): Array<{ col: number; row: number; result: BacResult }> {
  const cells: Array<{ col: number; row: number; result: BacResult }> = []
  let col = 0
  let row = 0
  let prev: BacResult | null = null

  for (const result of history) {
    if (result === "tie" && prev !== null) {
      // Tie는 직전 셀에 사선으로 표시 — 같은 위치 재사용 (별도 처리)
      cells.push({ col: Math.max(0, col - (row === 0 ? 1 : 0)), row: Math.max(0, row - (row === 0 ? 0 : 1) + (row === 0 ? 0 : 1)) - (row > 0 ? 1 : 0), result })
      // 단순 처리: tie도 그냥 같은 자리에 overlay — 여기서는 독립 셀로 그냥 아래에 넣음
      if (row < ROWS - 1) {
        cells.push({ col, row, result })
        row++
      } else {
        col++; row = 0
        cells.push({ col, row, result })
        row++
      }
      prev = result
      continue
    }

    if (prev === null || result !== prev) {
      // 결과 바뀜 → 새 컬럼
      if (prev !== null) { col++; row = 0 }
    }

    if (row < ROWS) {
      cells.push({ col, row, result })
      row++
    } else {
      col++; row = 0
      cells.push({ col, row, result })
      row++
    }

    prev = result === "tie" ? prev : result
  }

  return cells
}

function RoadDot({ result }: { result: BacResult }) {
  if (result === "banker") {
    return (
      <div style={{
        width: DOT_SIZE, height: DOT_SIZE, borderRadius: "50%",
        background: "#ef4444",
        boxShadow: "0 0 4px rgba(239,68,68,0.5)",
        flexShrink: 0,
      }} />
    )
  }
  if (result === "player") {
    return (
      <div style={{
        width: DOT_SIZE, height: DOT_SIZE, borderRadius: "50%",
        border: "2px solid #3b82f6",
        background: "transparent",
        flexShrink: 0,
      }} />
    )
  }
  // tie — 초록 사선 원
  return (
    <div style={{
      width: DOT_SIZE, height: DOT_SIZE, borderRadius: "50%",
      border: "2px solid #22c55e",
      background: "transparent",
      position: "relative",
      flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#22c55e", fontSize: 9, fontWeight: 700, lineHeight: 1,
      }}>T</div>
    </div>
  )
}

export default function BaccaratRoad({ history, className = "" }: BaccaratRoadProps) {
  const [showAll, setShowAll] = useState(false)

  // 최신 50개만 사용
  const recent = history.slice(-50)
  const cells = useMemo(() => buildGrid(recent), [recent])

  // 표시할 컬럼 범위 (오른쪽 최신 컬럼부터)
  const maxCol = cells.length > 0 ? Math.max(...cells.map(c => c.col)) : 0
  const visibleCols = showAll ? maxCol + 1 : Math.min(maxCol + 1, 20)
  const startCol = Math.max(0, maxCol + 1 - visibleCols)

  const visibleCells = cells.filter(c => c.col >= startCol)
  const colOffset = startCol

  const bCount = recent.filter(r => r === "banker").length
  const pCount = recent.filter(r => r === "player").length
  const tCount = recent.filter(r => r === "tie").length

  const cellSize = DOT_SIZE + GAP

  return (
    <div className={className}>
      {/* 헤더 카운터 */}
      <div className="flex items-center gap-3 mb-1.5">
        <span className="text-[10px] font-bold text-muted-foreground">#{recent.length}</span>
        <span className="flex items-center gap-1">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
          <span className="text-[10px] font-bold" style={{ color: "#ef4444" }}>{bCount}</span>
        </span>
        <span className="flex items-center gap-1">
          <span style={{ width: 8, height: 8, borderRadius: "50%", border: "1.5px solid #3b82f6", display: "inline-block" }} />
          <span className="text-[10px] font-bold" style={{ color: "#3b82f6" }}>{pCount}</span>
        </span>
        <span className="flex items-center gap-1">
          <span style={{ width: 8, height: 8, borderRadius: "50%", border: "1.5px solid #22c55e", display: "inline-block" }} />
          <span className="text-[10px] font-bold" style={{ color: "#22c55e" }}>{tCount}</span>
        </span>
        {history.length > 50 && (
          <button
            onClick={() => setShowAll(o => !o)}
            className="ml-auto text-[10px] text-muted-foreground underline"
          >
            {showAll ? "접기" : "더 보기"}
          </button>
        )}
      </div>

      {/* 스코어보드 그리드 */}
      <div
        style={{
          position: "relative",
          height: ROWS * cellSize,
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        {/* 격자 배경 */}
        <svg
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          width={visibleCols * cellSize}
          height={ROWS * cellSize}
        >
          {Array.from({ length: ROWS + 1 }).map((_, r) => (
            <line key={`h${r}`} x1={0} y1={r * cellSize} x2={visibleCols * cellSize} y2={r * cellSize}
              stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
          ))}
          {Array.from({ length: visibleCols + 1 }).map((_, c) => (
            <line key={`v${c}`} x1={c * cellSize} y1={0} x2={c * cellSize} y2={ROWS * cellSize}
              stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
          ))}
        </svg>

        {/* 결과 점 */}
        <div style={{ position: "relative", width: visibleCols * cellSize, height: ROWS * cellSize }}>
          {visibleCells.map((cell, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: (cell.col - colOffset) * cellSize + GAP / 2,
                top: cell.row * cellSize + GAP / 2,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <RoadDot result={cell.result} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
