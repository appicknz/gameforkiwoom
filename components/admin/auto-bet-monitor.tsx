"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw, Play, Square, Wallet, TrendingUp, AlertCircle } from "lucide-react"

const getToken = () => { try { return localStorage.getItem("app_token") } catch { return null } }
const fmt = (n: number) => `₩${n.toLocaleString("ko-KR")}`

interface AutoBetUser {
  id: string
  username: string
  num: number
  gameType: "baccarat" | "race"
  balance: number
}

interface BetResult {
  username: string
  gameType: string
  side: string
  amount: number
  success: boolean
  error?: string
  balance: number
}

interface BetLog {
  ts: number
  results: BetResult[]
  totalFee: number
}

const SIDE_LABEL: Record<string, string> = {
  player: "플레이어", banker: "뱅커", tie: "타이",
  bit: "BIT팀", coin: "COIN팀",
}

const SIDE_COLOR: Record<string, string> = {
  player: "text-blue-500", banker: "text-red-500", tie: "text-amber-500",
  bit: "text-blue-500", coin: "text-orange-500",
}

export function AutoBetMonitor() {
  const [users, setUsers] = useState<AutoBetUser[]>([])
  const [logs, setLogs] = useState<BetLog[]>([])
  const [accumulatedFee, setAccumulatedFee] = useState(0)
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [toppingUp, setToppingUp] = useState(false)
  const [lastBetResults, setLastBetResults] = useState<BetResult[] | null>(null)
  const [status, setStatus] = useState<string>("")
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadUsers = useCallback(async () => {
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/auto-bet", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      setUsers(d.users ?? [])
    }
  }, [])

  const loadLogs = useCallback(async () => {
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/auto-bet", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "get_logs" }),
    })
    if (res.ok) {
      const d = await res.json()
      const parsed: BetLog[] = (d.logs ?? []).map((l: string) => {
        try { return JSON.parse(l) } catch { return null }
      }).filter(Boolean)
      setLogs(parsed)
      setAccumulatedFee(d.accumulatedFee ?? 0)
    }
  }, [])

  const runBet = useCallback(async () => {
    const token = getToken(); if (!token) return
    setLoading(true)
    setStatus("배팅 실행 중...")
    try {
      const res = await fetch("/api/admin/auto-bet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "bet" }),
      })
      if (res.ok) {
        const d = await res.json()
        setLastBetResults(d.results ?? [])
        setAccumulatedFee(d.accumulatedFee ?? 0)
        setStatus(`배팅 완료 — 이번 라운드 수수료 ${fmt(d.totalFeeThisRound ?? 0)}`)
        await loadUsers()
        await loadLogs()
      }
    } catch (e) {
      setStatus("배팅 실패")
    }
    setLoading(false)
  }, [loadUsers, loadLogs])

  const handleTopUp = async () => {
    const token = getToken(); if (!token) return
    setToppingUp(true)
    const res = await fetch("/api/admin/auto-bet", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "top_up" }),
    })
    if (res.ok) {
      const d = await res.json()
      setStatus(`잔고 충전 완료 — ${d.topped}명 충전됨`)
      await loadUsers()
    }
    setToppingUp(false)
  }

  const handleResetFee = async () => {
    const token = getToken(); if (!token) return
    await fetch("/api/admin/auto-bet", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "reset_fee" }),
    })
    setAccumulatedFee(0)
  }

  const startAuto = () => {
    if (intervalRef.current) return
    setRunning(true)
    runBet()
    // 바카라 라운드(30초)마다 자동 배팅
    intervalRef.current = setInterval(() => { runBet() }, 30000)
  }

  const stopAuto = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setRunning(false)
    setStatus("자동배팅 중지됨")
  }

  useEffect(() => {
    loadUsers()
    loadLogs()
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [loadUsers, loadLogs])

  const lowBalanceCount = users.filter(u => u.balance < 1000000).length
  const baccaratUsers = users.filter(u => u.gameType === "baccarat")
  const raceUsers = users.filter(u => u.gameType === "race")

  return (
    <div className="space-y-5">

      {/* ── 상단: 수수료 누적 + 제어 ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">자동배팅 모니터</h3>
              <p className="text-xs text-muted-foreground mt-0.5">홀수=바카라, 짝수=레이스 &middot; 30초마다 자동 배팅</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { loadUsers(); loadLogs() }}>
              <RefreshCw className="w-3 h-3" /> 새로고침
            </Button>
            <Button
              variant="outline" size="sm" className="h-7 text-xs gap-1"
              onClick={handleTopUp} disabled={toppingUp || lowBalanceCount === 0}
            >
              <Wallet className="w-3 h-3" />
              {toppingUp ? "충전 중..." : `잔고 충전${lowBalanceCount > 0 ? ` (${lowBalanceCount}명)` : ""}`}
            </Button>
            {running ? (
              <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={stopAuto}>
                <Square className="w-3 h-3" /> 자동 중지
              </Button>
            ) : (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={startAuto} disabled={loading}>
                <Play className="w-3 h-3" /> 자동 시작
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={runBet} disabled={loading || running}>
              {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : "1회 실행"}
            </Button>
          </div>
        </div>

        {/* 누적 수수료 + 상태 */}
        <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-muted rounded-xl p-3 col-span-2 md:col-span-2">
            <p className="text-xs text-muted-foreground">자동배팅 누적 수수료 (20%)</p>
            <p className="text-2xl font-black tabular-nums text-amber-500 mt-0.5">{fmt(accumulatedFee)}</p>
            <button onClick={handleResetFee} className="text-xs text-muted-foreground hover:text-foreground mt-1">초기화</button>
          </div>
          <div className="bg-muted rounded-xl p-3">
            <p className="text-xs text-muted-foreground">바카라 유저</p>
            <p className="text-lg font-bold text-blue-500">{baccaratUsers.length}명</p>
          </div>
          <div className="bg-muted rounded-xl p-3">
            <p className="text-xs text-muted-foreground">레이스 유저</p>
            <p className="text-lg font-bold text-orange-500">{raceUsers.length}명</p>
          </div>
        </div>

        {status && (
          <div className="px-5 pb-3">
            <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">{status}</p>
          </div>
        )}

        {lowBalanceCount > 0 && (
          <div className="px-5 pb-4">
            <div className="flex items-center gap-2 rounded-lg bg-orange-500/8 border border-orange-500/20 px-3 py-2 text-xs text-orange-600">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              잔고 부족 유저 {lowBalanceCount}명 — 충전 버튼을 눌러 1천만원씩 충전하세요.
            </div>
          </div>
        )}
      </div>

      {/* ── 최근 배팅 결과 (1줄=1유저) ── */}
      {lastBetResults && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h4 className="text-sm font-semibold text-foreground">최근 배팅 결과</h4>
          </div>
          <div className="divide-y divide-border">
            {lastBetResults.map((r, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-foreground w-16 shrink-0">{r.username}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${r.gameType === "baccarat" ? "bg-blue-500/10 text-blue-600" : "bg-orange-500/10 text-orange-600"}`}>
                    {r.gameType === "baccarat" ? "바카라" : "레이스"}
                  </span>
                  <span className={`text-xs font-semibold ${SIDE_COLOR[r.side] ?? "text-foreground"}`}>
                    {SIDE_LABEL[r.side] ?? r.side}
                  </span>
                  <span className="text-xs tabular-nums text-foreground font-medium">{fmt(r.amount)}</span>
                </div>
                <div className="flex items-center gap-3">
                  {r.success ? (
                    <>
                      <span className="text-xs text-amber-500">수수료 {fmt(Math.floor(r.amount * 0.2))}</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-red-500">{r.error}</span>
                      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    </>
                  )}
                  <span className="text-xs tabular-nums text-muted-foreground w-24 text-right">{fmt(r.balance)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 유저별 상태 테이블 ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h4 className="text-sm font-semibold text-foreground">자동배팅 유저 목록</h4>
        </div>
        <div className="divide-y divide-border">
          {users.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">유저 목록 로딩 중...</div>
          ) : users.map(u => (
            <div key={u.id} className="px-5 py-2.5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <span className="font-medium text-foreground w-16 shrink-0">{u.username}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${u.gameType === "baccarat" ? "bg-blue-500/10 text-blue-600" : "bg-orange-500/10 text-orange-600"}`}>
                  {u.gameType === "baccarat" ? "바카라" : "레이스"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {u.balance < 1000000 && (
                  <span className="text-xs text-orange-500 font-medium">잔고 부족</span>
                )}
                <span className={`text-sm font-bold tabular-nums ${u.balance < 1000000 ? "text-orange-500" : "text-foreground"}`}>
                  {fmt(u.balance)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 배팅 로그 히스토리 ── */}
      {logs.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h4 className="text-sm font-semibold text-foreground">배팅 이력 (최근 20회)</h4>
          </div>
          <div className="divide-y divide-border">
            {logs.map((log, i) => {
              const successCount = log.results.filter(r => r.success).length
              return (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{new Date(log.ts).toLocaleString("ko-KR")}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-foreground">{successCount}/{log.results.length}명 성공</span>
                      <span className="text-amber-500 font-semibold">+{fmt(log.totalFee)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {log.results.map((r, j) => (
                      <span key={j} className={`text-xs px-1.5 py-0.5 rounded ${r.success ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"}`}>
                        {r.username.replace("사용자", "#")} {r.success ? `${SIDE_LABEL[r.side] ?? r.side} ${fmt(r.amount)}` : r.error}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
