"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw, Play, Square, Wallet, TrendingUp, AlertCircle, TrendingDown, BarChart3 } from "lucide-react"

const getToken = () => { try { return localStorage.getItem("app_token") } catch { return null } }
const fmt = (n: number) => `₩${n.toLocaleString("ko-KR")}`

interface LastSettled {
  direction: string
  betAmount: number
  payout: number
  profit: number
  result: "win" | "lose" | "tie"
  createdAt: string
}

interface AutoBetUser {
  id: string
  username: string
  num: number
  gameType: "baccarat" | "race"
  balance: number
  currentRound: number
  currentBet: { side: string; amount: number; odds: number | null } | null
  lastSettled: LastSettled | null
}

interface BetResult {
  username: string
  gameType: string
  side: string
  amount: number
  success: boolean
  error?: string
  balance: number
  round: number
  odds: number | null
}

interface BetLog {
  ts: number
  results: BetResult[]
  totalFee: number
  gameType?: string
}

interface BetStats {
  totalWinProfit: number
  totalLoss: number
  totalBalance: number
  winRate: number
  winCount: number
  loseCount: number
  tieCount: number
  totalBets: number
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
  const [stats, setStats] = useState<BetStats | null>(null)
  // 바카라/레이스 각각 독립 실행 상태
  const [baccaratRunning, setBaccaratRunning] = useState(false)
  const [raceRunning, setRaceRunning] = useState(false)
  const [baccaratLoading, setBaccaratLoading] = useState(false)
  const [raceLoading, setRaceLoading] = useState(false)
  const [toppingUp, setToppingUp] = useState(false)
  const [lastBetResults, setLastBetResults] = useState<BetResult[] | null>(null)
  const [status, setStatus] = useState<string>("")
  const baccaratIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const raceIntervalRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  // 페이즈 추적: 마지막으로 배팅 가능 구간을 감지한 라운드
  const baccaratLastBetRound  = useRef<number>(-1)
  const raceLastBetRound      = useRef<number>(-1)
  // 현재 페이즈 상태 (UI 표시용)
  const [baccaratPhase, setBaccaratPhase] = useState<"정산중" | "배팅가능" | "게임중">("게임중")
  const [racePhase, setRacePhase]         = useState<"배팅가능" | "게임중">("게임중")

  const loadUsers = useCallback(async () => {
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/auto-bet", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      setUsers(d.users ?? [])
      if (d.stats) setStats(d.stats)
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

  // 바카라 배팅 1회 실행
  const runBaccaratBet = useCallback(async () => {
    const token = getToken(); if (!token) return
    setBaccaratLoading(true)
    try {
      const res = await fetch("/api/admin/auto-bet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "bet_baccarat" }),
      })
      if (res.ok) {
        const d = await res.json()
        setLastBetResults(d.results ?? [])
        setAccumulatedFee(d.accumulatedFee ?? 0)
        setStatus(`바카라 배팅 완료 (라운드 #${d.round}) — 수수료 ${fmt(d.totalFeeThisRound ?? 0)}`)
        loadUsers()
      }
    } catch { setStatus("바카라 배팅 실패") }
    setBaccaratLoading(false)
  }, [loadUsers])

  // 레이스 배팅 1회 실행
  const runRaceBet = useCallback(async () => {
    const token = getToken(); if (!token) return
    setRaceLoading(true)
    try {
      const res = await fetch("/api/admin/auto-bet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "bet_race" }),
      })
      if (res.ok) {
        const d = await res.json()
        setLastBetResults(d.results ?? [])
        setAccumulatedFee(d.accumulatedFee ?? 0)
        setStatus(`레이스 배팅 완료 (라운드 #${d.round}) — 수수료 ${fmt(d.totalFeeThisRound ?? 0)}`)
        loadUsers()
      }
    } catch { setStatus("레이스 배팅 실패") }
    setRaceLoading(false)
  }, [loadUsers])

  // ── 페이즈 감지 헬퍼 ──────────────────────────────────────────
  const getBaccaratPhase = (): { phase: "정산중" | "배팅가능" | "게임중"; rem: number; round: number } => {
    const nowSec = Math.floor(Date.now() / 1000)
    const rem = 30 - (nowSec % 30)   // 30~1
    const round = Math.floor(nowSec / 30)
    const phase = rem > 25 ? "정산중" : rem > 13 ? "배팅가능" : "게임중"
    return { phase, rem, round }
  }
  const getRacePhase = (): { phase: "배팅가능" | "게임중"; rem: number; round: number } => {
    const nowSec = Math.floor(Date.now() / 1000)
    const secInRound = nowSec % 300
    const rem = 300 - secInRound
    const round = Math.floor(nowSec / 300)
    const phase = secInRound < 60 ? "배팅가능" : "게임중"
    return { phase, rem, round }
  }

  const startBaccarat = () => {
    if (baccaratIntervalRef.current) return
    setBaccaratRunning(true)
    // 500ms 간격으로 페이즈 감지 — 배팅 가능 구간 진입 시 라운드당 1회만 배팅
    baccaratIntervalRef.current = setInterval(() => {
      const { phase, round } = getBaccaratPhase()
      setBaccaratPhase(phase)
      if (phase === "배팅가능" && baccaratLastBetRound.current !== round) {
        baccaratLastBetRound.current = round
        runBaccaratBet()
      }
    }, 500)
  }
  const stopBaccarat = () => {
    if (baccaratIntervalRef.current) { clearInterval(baccaratIntervalRef.current); baccaratIntervalRef.current = null }
    setBaccaratRunning(false)
    setStatus("바카라 자동배팅 중지됨")
  }

  const startRace = () => {
    if (raceIntervalRef.current) return
    setRaceRunning(true)
    // 1초 간격으로 페이즈 감지 — 배팅 가능 구간(첫 60초) 진입 시 라운드당 1회만 배팅
    raceIntervalRef.current = setInterval(() => {
      const { phase, round } = getRacePhase()
      setRacePhase(phase)
      if (phase === "배팅가능" && raceLastBetRound.current !== round) {
        raceLastBetRound.current = round
        runRaceBet()
      }
    }, 1_000)
  }
  const stopRace = () => {
    if (raceIntervalRef.current) { clearInterval(raceIntervalRef.current); raceIntervalRef.current = null }
    setRaceRunning(false)
    setStatus("레이스 자동배팅 중지됨")
  }

  const handleTopUp = async () => {
    const token = getToken(); if (!token) return
    setToppingUp(true)
    const res = await fetch("/api/admin/auto-bet", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "top_up" }),
    })
    if (res.ok) { const d = await res.json(); setStatus(`잔고 충전 완료 — ${d.topped}명 충전됨`); loadUsers() }
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

  useEffect(() => {
    loadUsers(); loadLogs()
    return () => {
      if (baccaratIntervalRef.current) clearInterval(baccaratIntervalRef.current)
      if (raceIntervalRef.current) clearInterval(raceIntervalRef.current)
    }
  }, [loadUsers, loadLogs])

  const lowBalanceCount = users.filter(u => u.balance < 1000000).length
  const baccaratUsers = users.filter(u => u.gameType === "baccarat")
  const raceUsers = users.filter(u => u.gameType === "race")

  return (
    <div className="space-y-5">

      {/* ── 상단 헤더 + 공통 제어 ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">자동배팅 모니터</h3>
              <p className="text-xs text-muted-foreground mt-0.5">홀수=바카라(30초), 짝수=레이스(5분) &middot; 게임별 독립 제어</p>
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
          </div>
        </div>

        {/* ── 1행: 수수료 + 유저 수 ── */}
        <div className="px-5 pt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
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

        {/* ── 2행: 수익/손실/충전/승률 통계 ── */}
        <div className="px-5 py-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* 수익 누적 */}
          <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              <p className="text-xs text-muted-foreground">수익 누적</p>
            </div>
            <p className="text-lg font-black tabular-nums text-emerald-500">
              {stats ? `+${fmt(stats.totalWinProfit)}` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{stats ? `${stats.winCount}회 승` : ""}</p>
          </div>
          {/* 손실 누적 */}
          <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="w-3 h-3 text-red-500" />
              <p className="text-xs text-muted-foreground">손실 누적</p>
            </div>
            <p className="text-lg font-black tabular-nums text-red-500">
              {stats ? `-${fmt(stats.totalLoss)}` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{stats ? `${stats.loseCount}회 패` : ""}</p>
          </div>
          {/* 총 보유 잔고 */}
          <div className="bg-muted rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className="w-3 h-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">총 보유 잔고</p>
            </div>
            <p className="text-lg font-black tabular-nums text-foreground">
              {stats ? fmt(stats.totalBalance) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{users.length}명 합산</p>
          </div>
          {/* 승률 */}
          <div className="bg-muted rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart3 className="w-3 h-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">승률</p>
            </div>
            <p className="text-lg font-black tabular-nums text-foreground">
              {stats ? `${stats.winRate}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats ? `${stats.winCount}승 ${stats.loseCount}패 ${stats.tieCount}타이 / 총 ${stats.totalBets}판` : ""}
            </p>
          </div>
        </div>

        {/* 바카라 / 레이스 독립 제어 패널 */}
        <div className="px-5 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 바카라 */}
          <div className="border border-border rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-blue-500">바카라 자동배팅</p>
                {baccaratRunning && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    baccaratPhase === "배팅가능" ? "bg-emerald-500/15 text-emerald-500"
                    : baccaratPhase === "정산중"  ? "bg-amber-500/15 text-amber-500"
                    : "bg-muted-foreground/15 text-muted-foreground"
                  }`}>{baccaratPhase}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">배팅창 25~13초 · {baccaratUsers.length}명</p>
            </div>
            <div className="flex items-center gap-2">
              {baccaratRunning ? (
                <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={stopBaccarat}>
                  <Square className="w-3 h-3" /> 중지
                </Button>
              ) : (
                <Button size="sm" className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={startBaccarat} disabled={baccaratLoading}>
                  <Play className="w-3 h-3" /> 시작
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={runBaccaratBet} disabled={baccaratLoading || baccaratRunning}>
                {baccaratLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : "1회"}
              </Button>
            </div>
          </div>
          {/* 레이스 */}
          <div className="border border-border rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-orange-500">레이스 자동배팅</p>
                {raceRunning && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    racePhase === "배팅가능"
                      ? "bg-emerald-500/15 text-emerald-500"
                      : "bg-muted-foreground/15 text-muted-foreground"
                  }`}>{racePhase}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">배팅창 0~60초 · {raceUsers.length}명</p>
            </div>
            <div className="flex items-center gap-2">
              {raceRunning ? (
                <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={stopRace}>
                  <Square className="w-3 h-3" /> 중지
                </Button>
              ) : (
                <Button size="sm" className="h-7 text-xs gap-1 bg-orange-600 hover:bg-orange-700 text-white" onClick={startRace} disabled={raceLoading}>
                  <Play className="w-3 h-3" /> 시작
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={runRaceBet} disabled={raceLoading || raceRunning}>
                {raceLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : "1회"}
              </Button>
            </div>
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

      {/* ── 최근 배팅 결과 (1줄=1유저, 배팅 완료 시점 — 승패는 라운드 종료 후 확정) ── */}
      {lastBetResults && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-foreground">최근 배팅 접수</h4>
              <p className="text-xs text-muted-foreground mt-0.5">승패는 라운드 종료 후 유저 목록에서 확인</p>
            </div>
            <span className="text-xs text-muted-foreground">라운드 #{lastBetResults[0]?.round ?? "-"}</span>
          </div>
          {/* 헤더 */}
          <div className="px-5 py-1.5 bg-muted/40 grid grid-cols-[5rem_4.5rem_5rem_5rem_4rem_4rem_5.5rem] gap-2 text-xs text-muted-foreground font-medium">
            <span>유저</span><span>게임</span><span>side</span><span>배팅금액</span>
            <span className="text-right">배당</span><span>상태</span><span className="text-right">잔고</span>
          </div>
          <div className="divide-y divide-border">
            {lastBetResults.map((r, i) => (
              <div key={i} className="px-5 py-2 grid grid-cols-[5rem_4.5rem_5rem_5rem_4rem_4rem_5.5rem] gap-2 items-center">
                <span className="text-xs font-medium text-foreground truncate">{r.username}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full w-fit ${r.gameType === "baccarat" ? "bg-blue-500/10 text-blue-600" : "bg-orange-500/10 text-orange-600"}`}>
                  {r.gameType === "baccarat" ? "바카라" : "레이스"}
                </span>
                <span className={`text-xs font-semibold ${SIDE_COLOR[r.side] ?? "text-foreground"}`}>
                  {SIDE_LABEL[r.side] ?? r.side}
                </span>
                <span className="text-xs tabular-nums text-foreground">{fmt(r.amount)}</span>
                <span className="text-xs font-bold tabular-nums text-amber-500 text-right">
                  {r.success && r.odds != null ? `${r.odds.toFixed(2)}x` : "—"}
                </span>
                {r.success ? (
                  <span className="text-xs text-emerald-500 font-medium">접수</span>
                ) : (
                  <span className="text-xs text-red-500 truncate">{r.error}</span>
                )}
                <span className="text-xs tabular-nums text-muted-foreground text-right">{fmt(r.balance)}</span>
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
        {/* 헤더 */}
        <div className="px-4 py-2 bg-muted/50 grid grid-cols-[4.5rem_4.5rem_5rem_5rem_4rem_4.5rem_4rem_5.5rem] gap-2 text-xs text-muted-foreground font-medium">
          <span>유저</span>
          <span>게임</span>
          <span>라운드</span>
          <span>배팅 side</span>
          <span className="text-right">배당</span>
          <span className="text-center">최근결과</span>
          <span className="text-right">순수익</span>
          <span className="text-right">잔고</span>
        </div>
        <div className="divide-y divide-border">
          {users.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">유저 목록 로딩 중...</div>
          ) : users.map(u => {
            const ls = u.lastSettled
            const resultLabel = ls?.result === "win" ? "승" : ls?.result === "lose" ? "패" : ls?.result === "tie" ? "타이" : null
            const resultColor = ls?.result === "win" ? "text-emerald-500 bg-emerald-500/10" : ls?.result === "lose" ? "text-red-500 bg-red-500/10" : "text-amber-500 bg-amber-500/10"
            const profitColor = (ls?.profit ?? 0) > 0 ? "text-emerald-500" : (ls?.profit ?? 0) < 0 ? "text-red-500" : "text-muted-foreground"
            return (
              <div key={u.id} className="px-4 py-2.5 grid grid-cols-[4.5rem_4.5rem_5rem_5rem_4rem_4.5rem_4rem_5.5rem] gap-2 items-center text-sm">
                <span className="font-medium text-foreground truncate text-xs">{u.username}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full w-fit ${u.gameType === "baccarat" ? "bg-blue-500/10 text-blue-600" : "bg-orange-500/10 text-orange-600"}`}>
                  {u.gameType === "baccarat" ? "바카라" : "레이스"}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">#{u.currentRound}</span>
                {u.currentBet ? (
                  <span className={`text-xs font-semibold ${SIDE_COLOR[u.currentBet.side] ?? "text-foreground"}`}>
                    {SIDE_LABEL[u.currentBet.side] ?? u.currentBet.side}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">없음</span>
                )}
                <span className="text-xs font-bold tabular-nums text-amber-500 text-right">
                  {u.currentBet?.odds != null ? `${u.currentBet.odds.toFixed(2)}x` : "—"}
                </span>
                {/* 최근 정산 결과 */}
                {resultLabel ? (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded text-center ${resultColor}`}>
                    {resultLabel}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground text-center">—</span>
                )}
                {/* 순수익 */}
                <span className={`text-xs font-bold tabular-nums text-right ${profitColor}`}>
                  {ls ? (ls.profit >= 0 ? "+" : "") + fmt(ls.profit) : "—"}
                </span>
                <span className={`text-xs font-bold tabular-nums text-right ${u.balance < 1000000 ? "text-orange-500" : "text-foreground"}`}>
                  {fmt(u.balance)}
                </span>
              </div>
            )
          })}
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
