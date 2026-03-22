"use client"

import useSWR from "swr"

type RoadResult = "player" | "banker" | "tie"

const MAX_ROWS = 6
const CELL = 16
const GAP = 2

interface RoadCell {
  result: RoadResult
  row: number
  col: number
}

function buildBigRoad(history: RoadResult[]): RoadCell[] {
  const cells: RoadCell[] = []
  let col = -1
  let row = 0
  let lastNonTie: RoadResult | null = null

  for (const result of history) {
    if (result === "tie") {
      if (cells.length > 0) {
        const last = cells[cells.length - 1]
        cells.push({ result: "tie", row: last.row, col: last.col })
      }
      continue
    }

    if (result !== lastNonTie) {
      col++
      row = 0
      lastNonTie = result
    } else {
      row++
      if (row >= MAX_ROWS) {
        col++
        row = 0
      }
    }
    cells.push({ result, row, col })
  }
  return cells
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function BaccaratRoadStats() {
  const { data } = useSWR<{
    road: RoadResult[]
    stats: {
      total: number
      player: number
      banker: number
      tie: number
      playerPct: number
      bankerPct: number
      tiePct: number
    }
  }>("/api/baccarat/road", fetcher, { refreshInterval: 15000 })

  const road = data?.road ?? []
  const stats = data?.stats ?? { total: 0, player: 0, banker: 0, tie: 0, playerPct: 0, bankerPct: 0, tiePct: 0 }
  const cells = buildBigRoad(road)
  const maxCol = cells.length > 0 ? Math.max(...cells.map((c) => c.col)) : 0
  const totalCols = Math.max(maxCol + 1, 20)
  const gridW = totalCols * (CELL + GAP)
  const gridH = MAX_ROWS * (CELL + GAP)

  const colorMap: Record<RoadResult, string> = {
    player: "#3b82f6",
    banker: "#ef4444",
    tie: "#22c55e",
  }

  return (
    <div
      style={{
        background: "rgba(8,20,12,0.98)",
        border: "1px solid rgba(212,175,55,0.18)",
        borderRadius: 14,
        padding: "14px 16px",
      }}
    >
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(212,175,55,0.7)", letterSpacing: "0.12em" }}>
          BACCARAT BIG ROAD
        </span>
        <span style={{ fontSize: 10, color: "rgba(212,175,55,0.4)" }}>{stats.total}라운드</span>
      </div>

      {/* 통계 바 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          {(["player", "banker", "tie"] as const).map((r) => (
            <div key={r} style={{ display: "flex", alignItems: "center", gap: 5, flex: 1 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: colorMap[r], flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: "rgba(232,213,163,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {r === "player" ? "P" : r === "banker" ? "B" : "T"}
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(232,213,163,0.9)", marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
                {stats[r]}
              </span>
              <span style={{ fontSize: 9, color: "rgba(232,213,163,0.4)", fontVariantNumeric: "tabular-nums" }}>
                {stats[`${r}Pct` as "playerPct" | "bankerPct" | "tiePct"]}%
              </span>
            </div>
          ))}
        </div>

        {/* 비율 바 */}
        {stats.total > 0 && (
          <div style={{ display: "flex", height: 5, borderRadius: 99, overflow: "hidden", gap: 1 }}>
            <div style={{ width: `${stats.playerPct}%`, background: "#3b82f6", transition: "width 0.4s ease" }} />
            <div style={{ width: `${stats.tiePct}%`, background: "#22c55e", transition: "width 0.4s ease" }} />
            <div style={{ flex: 1, background: "#ef4444" }} />
          </div>
        )}
      </div>

      {/* Big Road 그리드 */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ position: "relative", width: gridW, height: gridH, minWidth: "100%" }}>
          {/* 그리드 선 */}
          <svg
            width={gridW}
            height={gridH}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            {Array.from({ length: MAX_ROWS + 1 }).map((_, i) => (
              <line
                key={`h${i}`}
                x1={0}
                y1={i * (CELL + GAP)}
                x2={gridW}
                y2={i * (CELL + GAP)}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={1}
              />
            ))}
            {Array.from({ length: totalCols + 1 }).map((_, i) => (
              <line
                key={`v${i}`}
                x1={i * (CELL + GAP)}
                y1={0}
                x2={i * (CELL + GAP)}
                y2={gridH}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={1}
              />
            ))}
          </svg>

          {/* 셀 */}
          {cells.map((cell, i) => {
            const x = cell.col * (CELL + GAP)
            const y = cell.row * (CELL + GAP)
            const color = colorMap[cell.result]
            if (cell.result === "tie") {
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: x + CELL / 2 - 1,
                    top: y,
                    width: 2,
                    height: CELL,
                    background: color,
                    opacity: 0.9,
                  }}
                />
              )
            }
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: x + 1,
                  top: y + 1,
                  width: CELL - 2,
                  height: CELL - 2,
                  borderRadius: "50%",
                  border: `2px solid ${color}`,
                  background: "transparent",
                }}
              />
            )
          })}

          {/* 데이터 없음 */}
          {cells.length === 0 && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, color: "rgba(212,175,55,0.3)",
            }}>
              아직 기록된 라운드가 없습니다
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
