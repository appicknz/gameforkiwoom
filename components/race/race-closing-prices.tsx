"use client"

import { useEffect, useState } from "react"

const GOLD = "#d4af37"
const GOLD_DIM = "rgba(212,175,55,0.5)"
const ROW_BG = "rgba(212,175,55,0.04)"
const ROW_BORDER = "rgba(212,175,55,0.1)"
const CARD_BG = "rgba(5,13,10,0.85)"
const GOLD_BORDER = "rgba(212,175,55,0.18)"
const BIT_COLOR = "#3b82f6"
const COIN_COLOR = "#f97316"

// race:closing 이벤트에서 오는 라운드 결과 (토탈 누적 스코어)
interface RaceEntry {
  time: number
  price: number
  bit: number   // BIT팀 라운드 토탈 스코어
  coin: number  // COIN팀 라운드 토탈 스코어
  winner: "bit" | "coin" | "tie"
}

function fmtTime(ts: number) {
  if (!ts || isNaN(ts)) return "—"
  return new Date(ts * 1000).toLocaleTimeString("ko-KR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  })
}

function fmtPrice(p: number) {
  return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function RaceClosingPrices() {
  const [entries, setEntries] = useState<RaceEntry[]>([])
  const [expanded, setExpanded] = useState(false)

  // 마운트 시: 백필 먼저 → 최근 결과 로드
  useEffect(() => {
    const loadResults = () =>
      fetch("/api/race-results?limit=20")
        .then(r => r.json())
        .then(({ results }) => {
          if (!Array.isArray(results)) return
          const mapped: RaceEntry[] = results.map((r: any) => ({
            time:   r.time,
            price:  typeof r.price === "string" ? parseFloat(r.price) : r.price,
            bit:    r.bit_score ?? r.bit ?? 0,
            coin:   r.coin_score ?? r.coin ?? 0,
            winner: r.winner ?? "tie",
          }))
          setEntries(mapped)
        })
        .catch(() => {})

    // 백필 후 결과 로드 (백필 실패해도 results는 로드)
    fetch("/api/cron/race-backfill")
      .catch(() => {})
      .finally(loadResults)
  }, [])

  // race:closing 이벤트 구독 — 라운드 종료 시 실시간 추가
  useEffect(() => {
    const onClosing = (e: Event) => {
      const d = (e as CustomEvent<any>).detail
      const entry: RaceEntry = {
        time:   d.time,
        price:  typeof d.price === "string" ? parseFloat(d.price) : d.price,
        bit:    d.bit ?? d.bit_score ?? 0,
        coin:   d.coin ?? d.coin_score ?? 0,
        winner: d.winner ?? "tie",
      }
      setEntries(prev => {
        if (prev.find(p => p.time === entry.time)) return prev
        // 최신순 정렬 후 20개 보관 (display는 상위 10개만 표시)
        return [...prev, entry].sort((a, b) => b.time - a.time).slice(0, 50)
      })
    }
    window.addEventListener("race:closing", onClosing)
    return () => window.removeEventListener("race:closing", onClosing)
  }, [])

  const sorted = [...entries].sort((a, b) => b.time - a.time)
  const display = sorted.slice(0, expanded ? 20 : 10)

  return (
    <div style={{
      background: CARD_BG,
      border: `1px solid ${GOLD_BORDER}`,
      borderRadius: 16,
      padding: "16px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: GOLD, letterSpacing: "0.04em" }}>
          5분 레이스 결과 (최근 {expanded ? "20" : "10"}라운드)
        </h3>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            background: "rgba(212,175,55,0.08)", border: `1px solid rgba(212,175,55,0.18)`,
            color: "rgba(212,175,55,0.6)", fontSize: 11, fontWeight: 700, padding: "3px 10px",
            borderRadius: 6, cursor: "pointer",
          }}
        >
          {expanded ? "접기" : "전체보기"}
        </button>
      </div>

      {display.length === 0 && (
        <div style={{ textAlign: "center", color: GOLD_DIM, fontSize: 12, padding: "20px 0" }}>
          라운드 기록 대기 중...
        </div>
      )}

      {display.map((entry, i) => {
        const isLatest = i === 0
        return (
          <div key={entry.time} style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 8,
            background: isLatest ? "rgba(212,175,55,0.08)" : ROW_BG,
            border: `1px solid ${isLatest ? "rgba(212,175,55,0.3)" : ROW_BORDER}`,
          }}>
            <span style={{ fontSize: 11, color: GOLD_DIM, fontVariantNumeric: "tabular-nums", minWidth: 58 }}>
              {fmtTime(entry.time)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: GOLD, flex: 1, fontVariantNumeric: "tabular-nums" }}>
              {fmtPrice(entry.price)}
            </span>
            {/* BIT 점수 — 이기면 채움 사각 라운드 */}
            <span style={{
              fontSize: 11, fontWeight: 800,
              color: entry.winner === "bit" ? "#fff" : BIT_COLOR,
              background: entry.winner === "bit" ? BIT_COLOR : entry.winner === "tie" ? "rgba(59,130,246,0.12)" : "transparent",
              border: `1.5px solid ${entry.winner === "bit" ? BIT_COLOR : "rgba(59,130,246,0.35)"}`,
              padding: "2px 7px", borderRadius: 6,
              minWidth: 36, textAlign: "center",
              letterSpacing: "0.02em",
            }}>
              B{entry.bit}
            </span>
            {/* COIN 점수 — 이기면 채움 사각 라운드 */}
            <span style={{
              fontSize: 11, fontWeight: 800,
              color: entry.winner === "coin" ? "#fff" : COIN_COLOR,
              background: entry.winner === "coin" ? COIN_COLOR : entry.winner === "tie" ? "rgba(249,115,22,0.12)" : "transparent",
              border: `1.5px solid ${entry.winner === "coin" ? COIN_COLOR : "rgba(249,115,22,0.35)"}`,
              padding: "2px 7px", borderRadius: 6,
              minWidth: 36, textAlign: "center",
              letterSpacing: "0.02em",
            }}>
              C{entry.coin}
            </span>
          </div>
        )
      })}
    </div>
  )
}
