"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, BarChart2, Calendar, RefreshCw } from "lucide-react"

const GOLD       = "#d4af37"
const UP_COLOR   = "#00e676"
const DOWN_COLOR = "#ff3d57"
const PANEL_BG   = "rgba(5,13,10,0.95)"
const BORDER     = "rgba(212,175,55,0.15)"

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"]

interface TradeRow {
  id: string
  symbol: string
  direction: "long" | "short"
  leverage: number
  entry_price: number
  exit_price: number
  bet_amount: number
  payout: number
  pnl: number
  result: string
  created_at: string
}

interface DayStat {
  count: number
  pnl: number
  bet: number
}

interface Props {
  getToken: () => string | null
}

function toKSTDateStr(d: Date) {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) // "2026-05-09"
}

function getMonthDays(year: number, month: number) {
  // month: 0-based
  const firstDay = new Date(year, month, 1).getDay()   // 0=일
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return { firstDay, daysInMonth }
}

export default function TradeHistoryPanel({ getToken }: Props) {
  const todayKST   = toKSTDateStr(new Date())
  const [viewYear, setViewYear]     = useState(() => parseInt(todayKST.slice(0, 4)))
  const [viewMonth, setViewMonth]   = useState(() => parseInt(todayKST.slice(5, 7)) - 1)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [byDate, setByDate]         = useState<Record<string, DayStat>>({})
  const [rows, setRows]             = useState<TradeRow[]>([])
  const [loading, setLoading]       = useState(false)
  const fetchedRef                  = useRef(false)

  // 전체 통계 (월별 집계용) — 최초 1회만
  const fetchAll = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch("/api/user/trade/history", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setByDate(data.byDate ?? {})
    } finally {
      setLoading(false)
    }
  }, [getToken])

  // 선택 날짜 상세
  const fetchDay = useCallback(async (date: string) => {
    const token = getToken()
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`/api/user/trade/history?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setRows(data.rows ?? [])
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true
      fetchAll()
    }
  }, [fetchAll])

  useEffect(() => {
    if (selectedDate) fetchDay(selectedDate)
    else setRows([])
  }, [selectedDate, fetchDay])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const { firstDay, daysInMonth } = getMonthDays(viewYear, viewMonth)

  // 달력 셀 배열 (빈칸 + 날짜)
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // 7열 맞추기
  while (cells.length % 7 !== 0) cells.push(null)

  // 전체 통계
  const totalCount  = Object.values(byDate).reduce((s, d) => s + d.count, 0)
  const totalPnl    = Object.values(byDate).reduce((s, d) => s + d.pnl, 0)
  const totalBet    = Object.values(byDate).reduce((s, d) => s + d.bet, 0)
  const totalRoi    = totalBet > 0 ? (totalPnl / totalBet) * 100 : 0
  const winDays     = Object.values(byDate).filter(d => d.pnl > 0).length
  const totalDays   = Object.keys(byDate).length

  // 선택 날짜 통계
  const selStat  = selectedDate ? byDate[selectedDate] : null
  const selRoi   = selStat && selStat.bet > 0 ? (selStat.pnl / selStat.bet) * 100 : 0

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* 전체 요약 통계 */}
      <div style={{
        background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "12px 16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <BarChart2 style={{ width: 13, height: 13, color: GOLD, opacity: 0.7 }} />
            <span style={{ fontSize: 11, color: "rgba(212,175,55,0.6)", fontWeight: 600, letterSpacing: "0.05em" }}>
              전체 매매 통계
            </span>
          </div>
          <button onClick={() => { fetchedRef.current = false; fetchAll() }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 2 }}>
            <RefreshCw style={{ width: 11, height: 11 }} />
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          {[
            { label: "총 매매", value: `${totalCount}회` },
            { label: "총 수익", value: `${totalPnl >= 0 ? "+" : ""}${Math.floor(totalPnl).toLocaleString("ko-KR")}원`, color: totalPnl >= 0 ? UP_COLOR : DOWN_COLOR },
            { label: "총 수익률", value: `${totalRoi >= 0 ? "+" : ""}${totalRoi.toFixed(1)}%`, color: totalRoi >= 0 ? UP_COLOR : DOWN_COLOR },
            { label: "승률(일)", value: `${totalDays > 0 ? Math.round((winDays / totalDays) * 100) : 0}%` },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "7px 10px" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: color ?? "rgba(255,255,255,0.75)", fontVariantNumeric: "tabular-nums" }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 캘린더 */}
      <div style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "12px 14px" }}>
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Calendar style={{ width: 12, height: 12, color: GOLD, opacity: 0.7 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>
              {viewYear}년 {viewMonth + 1}월
            </span>
            {toKSTDateStr(new Date()).startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`) && (
              <span style={{ fontSize: 9, color: GOLD, background: "rgba(212,175,55,0.12)", borderRadius: 4, padding: "1px 5px" }}>오늘</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={prevMonth} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, cursor: "pointer", color: "rgba(255,255,255,0.5)", padding: "2px 5px" }}>
              <ChevronLeft style={{ width: 11, height: 11 }} />
            </button>
            <button onClick={nextMonth} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, cursor: "pointer", color: "rgba(255,255,255,0.5)", padding: "2px 5px" }}>
              <ChevronRight style={{ width: 11, height: 11 }} />
            </button>
          </div>
        </div>

        {/* 요일 헤더 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
          {DAY_LABELS.map((d, i) => (
            <div key={d} style={{
              textAlign: "center", fontSize: 9, fontWeight: 600, paddingBottom: 4,
              color: i === 0 ? "#ff6b6b" : i === 6 ? "#6bb5ff" : "rgba(255,255,255,0.3)",
            }}>{d}</div>
          ))}
        </div>

        {/* 날짜 셀 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {cells.map((day, idx) => {
            if (day === null) return <div key={idx} />
            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
            const isToday = dateStr === todayKST
            const isSel   = dateStr === selectedDate
            const stat    = byDate[dateStr]
            const hasTrade = !!stat
            const dayPnl  = stat?.pnl ?? 0
            const isWin   = dayPnl > 0
            const isLose  = dayPnl < 0
            const colIdx  = idx % 7

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(isSel ? null : dateStr)}
                style={{
                  position: "relative",
                  padding: "5px 2px 4px",
                  borderRadius: 6,
                  border: isSel
                    ? `1px solid ${GOLD}`
                    : isToday
                      ? "1px solid rgba(212,175,55,0.4)"
                      : "1px solid transparent",
                  background: isSel
                    ? "rgba(212,175,55,0.12)"
                    : hasTrade
                      ? isWin ? "rgba(0,230,118,0.06)" : "rgba(255,61,87,0.06)"
                      : "rgba(255,255,255,0.02)",
                  cursor: "pointer",
                  textAlign: "center",
                  transition: "all 0.12s",
                }}
              >
                <div style={{
                  fontSize: 11, fontWeight: isToday ? 800 : 500,
                  color: isToday
                    ? GOLD
                    : colIdx === 0 ? "#ff6b6b" : colIdx === 6 ? "#6bb5ff" : "rgba(255,255,255,0.7)",
                  lineHeight: 1,
                  marginBottom: hasTrade ? 2 : 0,
                }}>{day}</div>
                {hasTrade && (
                  <div style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: isWin ? UP_COLOR : DOWN_COLOR,
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1,
                  }}>
                    {isWin ? "+" : ""}{Math.abs(dayPnl) >= 10000
                      ? `${(dayPnl / 10000).toFixed(0)}만`
                      : Math.floor(dayPnl).toLocaleString("ko-KR")}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 선택 날짜 상세 */}
      {selectedDate && (
        <div style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
          {/* 날짜 요약 */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid rgba(212,175,55,0.08)` }}>
            <div style={{ fontSize: 11, color: "rgba(212,175,55,0.55)", marginBottom: 6 }}>
              {selectedDate.replace(/-/g, ".")} 매매 결과
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {[
                { label: "매매 횟수", value: `${selStat?.count ?? 0}회` },
                { label: "당일 손익", value: `${(selStat?.pnl ?? 0) >= 0 ? "+" : ""}${Math.floor(selStat?.pnl ?? 0).toLocaleString("ko-KR")}원`, color: (selStat?.pnl ?? 0) >= 0 ? UP_COLOR : DOWN_COLOR },
                { label: "당일 수익률", value: `${selRoi >= 0 ? "+" : ""}${selRoi.toFixed(2)}%`, color: selRoi >= 0 ? UP_COLOR : DOWN_COLOR },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 7, padding: "6px 8px" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: color ?? "rgba(255,255,255,0.75)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 거래 목록 */}
          {loading ? (
            <div style={{ padding: "16px", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 11 }}>로딩 중...</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: "16px", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 11 }}>거래 내역 없음</div>
          ) : (
            <div>
              {rows.map((row) => {
                const isLong = row.direction === "long"
                const pnlColor = row.pnl >= 0 ? UP_COLOR : DOWN_COLOR
                const time = new Date(row.created_at).toLocaleTimeString("ko-KR", {
                  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit",
                })
                return (
                  <div key={row.id} style={{
                    padding: "8px 14px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{
                        padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 800,
                        background: isLong ? "rgba(0,230,118,0.12)" : "rgba(255,61,87,0.12)",
                        color: isLong ? UP_COLOR : DOWN_COLOR,
                        border: `1px solid ${isLong ? "rgba(0,230,118,0.25)" : "rgba(255,61,87,0.25)"}`,
                      }}>
                        {isLong ? "L" : "S"}
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
                          {row.symbol.replace("USDT", "")} <span style={{ color: "rgba(212,175,55,0.5)", fontWeight: 400 }}>{row.leverage}x</span>
                        </div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{time}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: pnlColor, fontVariantNumeric: "tabular-nums" }}>
                        {row.pnl >= 0 ? "+" : ""}₩{Math.floor(row.pnl).toLocaleString("ko-KR")}
                      </div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontVariantNumeric: "tabular-nums" }}>
                        투자 ₩{row.bet_amount.toLocaleString("ko-KR")}
                      </div>
                    </div>
                    <div style={{
                      padding: "2px 8px", borderRadius: 5, fontSize: 9, fontWeight: 700,
                      background: row.result === "win" ? "rgba(0,230,118,0.1)" : "rgba(255,61,87,0.1)",
                      color: row.result === "win" ? UP_COLOR : DOWN_COLOR,
                    }}>
                      {row.result === "win" ? "수익" : "손실"}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
