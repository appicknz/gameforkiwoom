"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useGatewayOdds } from "@/hooks/use-gateway"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  RefreshCw, Download, TrendingUp, TrendingDown, Activity, Info,
  Play, Square, Wallet, AlertCircle, BarChart3, RotateCcw, Lock,
} from "lucide-react"

// ── 유틸 ──────────────────────────────────────────────────────────────────
const getToken = () => { try { return localStorage.getItem("app_token") } catch { return null } }
const setToken = (t: string) => { try { localStorage.setItem("app_token", t) } catch {} }
const fmt = (n: number) => `₩${n.toLocaleString("ko-KR")}`

// 401 응답 시 /api/auth/refresh 로 토큰 갱신 후 재시도
// 갱신 실패 시 null 반환 → 호출부에서 재로그인 안내
async function fetchWithRefresh(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const authInit: RequestInit = {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  }
  const res = await fetch(input, authInit)
  if (res.status !== 401) return res

  // 토큰 갱신 시도 — 만료된 토큰이어도 refresh 라우트에서 허용
  const refreshRes = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!refreshRes.ok) {
    // 갱신 실패 = refresh_token도 만료 → 재로그인 필요
    alert("세션이 만료되었습니다. 다시 로그인해주세요.")
    window.location.href = "/login"
    return res
  }

  const { token: newToken } = await refreshRes.json()
  if (!newToken) return res

  setToken(newToken)

  // 새 토큰으로 원래 요청 재시도
  return fetch(input, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${newToken}` },
  })
}

// ── 라운드 모니터 타입 ────────────────────────────────────────────────────
interface RoundStats {
  round: string
  gameType: string
  timestamp: string
  pools: Record<string, number>
  userCount: number
  totalBet: number
  lpAmount: number
  fee: number
  feeRate: number
  mode: string
  prediction: Record<string, number>
  odds: Record<string, number> | null
}
interface CombinedStats {
  baccarat: RoundStats
  race: RoundStats
}
interface HouseStat {
  id: number; branch_id: string; game_type: string
  total_bet: number; total_payout: number; total_lp_used: number
  total_fee: number; total_collected: number; updated_at: string
  branches: { name: string; code: string } | null
}
interface FeeCollection {
  id: number; branch_id: string; game_type: string
  collected_amount: number; note: string; created_at: string
  branches: { name: string } | null
}
interface FeeLog {
  id: number; round_number: number; game_type: string
  user_id: string; branch_id: string
  bet_amount: number; fee_amount: number; created_at: string
  profiles: { username: string; nickname: string } | null
  branches: { name: string; code: string } | null
}
interface FeeBranchSummary {
  branchId: string; branchName: string; branchCode: string
  baccarat: number; race: number; total: number
}
interface MasterSummary {
  totalBet: number; totalPayout: number; totalLpUsed: number
  totalFee: number; totalCollected: number; pendingFee: number; houseProfit: number
}
interface LpTx {
  id: number; pool_type: string; side: string; lp_amount: number
  user_amount: number; settled_odds: number | null; round_time: number; created_at: string
}
interface Branch {
  id: string; name: string; lp_enabled: boolean
  lp_amount_baccarat?: number; lp_amount_race?: number
}

// ── 자동배팅 타입 ─────────────────────────────────────────────────────────
interface LastSettled {
  direction: string; betAmount: number; payout: number
  profit: number; result: "win" | "lose" | "tie"; createdAt: string
}
interface UserStats {
  winProfit: number; loss: number; winRate: number
  winCount: number; loseCount: number; tieCount: number; totalBets: number; fee: number
}
interface AutoBetUser {
  id: string; username: string; num: number
  gameType: "baccarat" | "race"
  balance: number; currentRound: number
  currentBet: { side: string; amount: number; odds: number | null } | null
  lastSettled: LastSettled | null; userStats: UserStats | null
}
interface BetResult {
  username: string; gameType: string; side: string
  amount: number; success: boolean; error?: string
  balance: number; round: number; odds: number | null
}
interface BetLog {
  ts: number; results: BetResult[]; totalFee: number; gameType?: string
}
interface BetStats {
  totalWinProfit: number; totalLoss: number; totalBalance: number
  winRate: number; winCount: number; loseCount: number; tieCount: number; totalBets: number
}

const SIDE_LABEL: Record<string, string> = {
  player: "플레이어", banker: "뱅커", tie: "타이",
  bit: "BIT팀", coin: "COIN팀",
}
const SIDE_COLOR: Record<string, string> = {
  player: "text-blue-500", banker: "text-red-500", tie: "text-amber-500",
  bit: "text-blue-500", coin: "text-orange-500",
}


// ── 게임 카드 (바카라 or 레이스) ──────────────────────────�����───────────────
function GameRoundCard({
  stats, title, phase, timeLeft,
}: {
  stats: RoundStats
  title: string
  phase: "정산중" | "배팅가능" | "게임중"
  timeLeft: number
}) {
  const isBaccarat = stats.gameType === "baccarat"
  const sides = isBaccarat
    ? [
        { key: "player", label: "플레이어", color: "bg-blue-500",  textColor: "text-blue-500" },
        { key: "banker", label: "뱅커",     color: "bg-red-500",   textColor: "text-red-500"  },
        { key: "tie",    label: "타이",     color: "bg-amber-500", textColor: "text-amber-500" },
      ]
    : [
        { key: "bit",  label: "BIT팀",  color: "bg-blue-500",  textColor: "text-blue-500"  },
        { key: "coin", label: "COIN팀", color: "bg-red-500",   textColor: "text-red-500"   },
        { key: "tie",  label: "TIE",    color: "bg-amber-500", textColor: "text-amber-500" },
      ]

  const modeLabel =
    stats.mode === "pari"   ? "파리뮤추얼" :
    stats.mode === "hybrid" ? "����이브리드"  : "LP 주도"
  const modeBg =
    stats.mode === "pari"   ? "bg-emerald-500/10 text-emerald-600" :
    stats.mode === "hybrid" ? "bg-amber-500/10 text-amber-600"    :
                              "bg-blue-500/10 text-blue-600"

  const feeAmount = stats.fee > 0 ? stats.fee : Math.floor(stats.totalBet * 0.20)

  const phaseBg =
    phase === "배팅가능" ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30" :
    phase === "정산중"   ? "bg-amber-500/15 text-amber-600 border border-amber-500/30" :
                          "bg-muted text-muted-foreground border border-border"
  const totalSec = isBaccarat ? 30 : 180
  const pct = (timeLeft / totalSec) * 100
  const progressColor =
    phase === "배팅가능" ? "bg-emerald-500" :
    phase === "정산중"   ? "bg-amber-500" : "bg-muted-foreground/40"

  return (
    <div className="flex-1 min-w-0 bg-muted/40 rounded-xl p-4 space-y-3 border border-border">
      {/* 타이머 프로그레스 바 */}
      <div className="h-1 w-full bg-border rounded-full overflow-hidden -mt-1">
        <div
          className={`h-full transition-all duration-200 ${progressColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            라운드 #{stats.round} &middot; {stats.userCount}명 참여
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {/* 페이즈 배지 */}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${phaseBg}`}>
            {phase}
          </span>
          {/* 카운트다운 */}
          <span className={`text-sm font-black tabular-nums w-10 text-right ${
            phase === "배팅가능" ? "text-emerald-500" :
            phase === "정산중"   ? "text-amber-500" : "text-muted-foreground"
          }`}>
            {timeLeft}s
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${modeBg}`}>{modeLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-card rounded-lg p-2">
          <p className="text-muted-foreground">총 배팅</p>
          <p className="font-bold tabular-nums text-foreground">{fmt(stats.totalBet)}</p>
        </div>
        <div className="bg-card rounded-lg p-2">
          <p className="text-muted-foreground">수수료 20%</p>
          <p className="font-bold tabular-nums text-amber-500">{fmt(feeAmount)}</p>
        </div>
        <div className="bg-card rounded-lg p-2">
          <p className="text-muted-foreground">LP 투입</p>
          <p className="font-bold tabular-nums text-blue-500">{fmt(stats.lpAmount)}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {sides.map(({ key, label, color, textColor }) => {
          const bet  = stats.pools[key] ?? 0
          const pct  = stats.totalBet > 0 ? (bet / stats.totalBet) * 100 : 0
          const odds = stats.odds?.[key] ?? null
          return (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span className={`w-14 shrink-0 font-medium ${textColor}`}>{label}</span>
              <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                <div className={`h-full ${color} opacity-60 transition-all duration-300`} style={{ width: `${Math.max(pct, stats.totalBet === 0 ? 33 : 0)}%` }} />
              </div>
              <span className="w-20 tabular-nums text-right text-muted-foreground shrink-0">{fmt(bet)}</span>
              {odds != null && (
                <span className={`w-14 text-right tabular-nums font-bold shrink-0 ${textColor}`}>{odds.toFixed(2)}x</span>
              )}
            </div>
          )
        })}
      </div>

      {stats.totalBet === 0 && (
        <p className="text-xs text-muted-foreground text-center py-1">배팅 대기 중</p>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export function RoundMonitor({
  isSuperAdmin = false,
  branchId,       // 지점관리자: 자기 branch UUID, superadmin: undefined (전체)
  branches = [],
}: {
  isSuperAdmin?: boolean
  branchId?: string
  branches?: Branch[]
}) {
  const isBranchAdmin = !isSuperAdmin && !!branchId

  // ── 라운드 현황 ──────────────────────────────────────────────
  const [combined,     setCombined]     = useState<CombinedStats | null>(null)
  const [roundLoading, setRoundLoading] = useState(false)

  // ── 하우스 손익 ──────────────────────────────────────────────
  const [houseStats,     setHouseStats]     = useState<HouseStat[]>([])
  const [feeCollections, setFeeCollections] = useState<FeeCollection[]>([])
  const [masterSummary,  setMasterSummary]  = useState<MasterSummary | null>(null)
  const [houseLoading,   setHouseLoading]   = useState(false)
  const [collectingId,   setCollectingId]   = useState<string | null>(null)
  const [feeLogs,        setFeeLogs]        = useState<FeeLog[]>([])
  const [feeByBranch,    setFeeByBranch]    = useState<FeeBranchSummary[]>([])
  const [houseTab,       setHouseTab]       = useState<"house" | "fee">("house")

  // ── LP 히스토리 ──────────────────────────────────────────────
  const [lpHistory, setLpHistory] = useState<LpTx[]>([])
  const [lpTotal,   setLpTotal]   = useState(0)
  const [lpLoading, setLpLoading] = useState(false)

  // ── LP 전역 ON/OFF (superadmin 전용) ─────────────────────────
  const [lpGlobal,   setLpGlobal]   = useState<boolean>(true)
  const [lpToggling, setLpToggling] = useState(false)
  const [lpBranches, setLpBranches] = useState<{ id: string; lp_enabled: boolean }[]>([])

  // ── 자동배팅 상태 ─────────────────────────────────────────────
  const [abUsers,          setAbUsers]          = useState<AutoBetUser[]>([])
  const [abLogs,           setAbLogs]           = useState<BetLog[]>([])
  const [accumulatedFee,   setAccumulatedFee]   = useState(0)
  const [baccaratFee,      setBaccaratFee]      = useState(0)
  const [raceFee,          setRaceFee]          = useState(0)
  const [abStats,          setAbStats]          = useState<BetStats | null>(null)
  const [baccaratRunning,  setBaccaratRunning]  = useState(false)
  const [raceRunning,      setRaceRunning]      = useState(false)
  const [baccaratLoading,  setBaccaratLoading]  = useState(false)
  const [raceLoading,      setRaceLoading]      = useState(false)
  const [toppingUp,        setToppingUp]        = useState(false)
  const [lastBetResults,   setLastBetResults]   = useState<BetResult[] | null>(null)
  const [abStatus,         setAbStatus]         = useState<string>("")
  const [showResetDialog,  setShowResetDialog]  = useState(false)
  const [resetGameType,    setResetGameType]    = useState<"baccarat" | "race" | "all">("all")
  const [resetPassword,    setResetPassword]    = useState("")
  const [resetLoading,     setResetLoading]     = useState(false)
  const [resetError,       setResetError]       = useState("")
  const [abUserTab,        setAbUserTab]        = useState<"baccarat" | "race">("baccarat")
  const [baccaratPhase,   setBaccaratPhase]   = useState<"정산중" | "배팅가능" | "게임중">("게임중")
  const [racePhase,       setRacePhase]       = useState<"정산중" | "배팅가능" | "게임중">("게임중")
  const [baccaratTimeLeft, setBaccaratTimeLeft] = useState(30)
  const [raceTimeLeft,     setRaceTimeLeft]     = useState(180)
  // ref로 ��신 페이즈를 추적 — loadRoundStats 콜백 클로저에서 접근용
  const baccaratPhaseRef = useRef<"정산중" | "배팅가능" | "게임중">("게임중")
  const racePhaseRef     = useRef<"정산중" | "배팅가능" | "게임중">("게임중")
  const baccaratIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const raceIntervalRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const baccaratLastBetRound = useRef<number>(-1)
  const raceLastBetRound     = useRef<number>(-1)
  const statsRefreshRef      = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── 데이터 로드 ──────────────��────────────────────────────────
  const loadLpState = useCallback(async () => {
    const token = getToken(); if (!token) return
    try {
      const res = await fetchWithRefresh("/api/admin/branches")
      if (!res.ok) return
      const data = await res.json()
      const list: { id: string; lp_enabled: boolean }[] = data.branches ?? []
      setLpBranches(list)
      setLpGlobal(list.length === 0 || list.some(b => b.lp_enabled !== false))
    } catch {}
  }, [])

  const loadRoundStats = useCallback(async () => {
    const token = getToken(); if (!token) return
    // 게임중 페이즈에는 배당/풀이 변하지 않으므로 폴링 스킵 — 화면 freeze 유지
    if (baccaratPhaseRef.current === "게임중" && racePhaseRef.current === "게임중") return
    setRoundLoading(true)
    try {
      const res = await fetchWithRefresh("/api/admin/round-stats")
      if (res.ok) setCombined(await res.json())
    } catch {}
    setRoundLoading(false)
  }, [])

  const loadHouseStats = useCallback(async () => {
    setHouseLoading(true)
    try {
      const url = branchId ? `/api/admin/house-stats?branchId=${branchId}` : "/api/admin/house-stats"
      const res = await fetchWithRefresh(url)
      if (res.ok) {
        const d = await res.json()
        setHouseStats(d.stats ?? [])
        setFeeCollections(d.collections ?? [])
        setMasterSummary(d.masterSummary ?? null)
        setFeeLogs(d.feeLogs ?? [])
        setFeeByBranch(d.feeByBranch ?? [])
      }
    } catch {}
    setHouseLoading(false)
  }, [branchId])

  const loadLpHistory = useCallback(async () => {
    setLpLoading(true)
    try {
      const url = branchId ? `/api/admin/lp-history?branchId=${branchId}` : "/api/admin/lp-history"
      const res = await fetchWithRefresh(url)
      if (res.ok) { const d = await res.json(); setLpHistory(d.history ?? []); setLpTotal(d.totalLpUsed ?? 0) }
    } catch {}
    setLpLoading(false)
  }, [branchId])

  const loadAbUsers = useCallback(async () => {
    const res = await fetchWithRefresh("/api/admin/auto-bet")
    if (res.ok) {
      const d = await res.json()
      setAbUsers(d.users ?? [])
      if (d.stats) setAbStats(d.stats)
    }
  }, [])

  const loadAbLogs = useCallback(async () => {
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
      setAbLogs(parsed)
      setAccumulatedFee(d.accumulatedFee ?? 0)
      setBaccaratFee(d.baccaratFee ?? 0)
      setRaceFee(d.raceFee ?? 0)
    }
  }, [])

  // ── LP 전역 토글 ──────────────────────────────────────────────
  const handleLpToggle = async () => {
    const token = getToken(); if (!token) return
    const next = !lpGlobal
    setLpToggling(true)
    try {
      const targets = lpBranches.length > 0 ? lpBranches : branches
      await Promise.all(targets.map(b =>
        fetchWithRefresh("/api/admin/branches/betting", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branchId: b.id, lpEnabled: next }),
        })
      ))
      setLpGlobal(next)
    } catch {}
    setLpToggling(false)
  }

  const handleCollect = async (bId: string, gt: string) => {
    const key = `${bId}-${gt}`; setCollectingId(key)
    const res = await fetchWithRefresh("/api/admin/house-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch_id: bId, game_type: gt, note: "수금 처리" }),
    })
    if (res.ok) await loadHouseStats()
    setCollectingId(null)
  }

  // ── 자동배팅 배팅 실행 ────────────────────────────────────────
  const runBaccaratBet = useCallback(async () => {
    const token = getToken(); if (!token) return
    setBaccaratLoading(true)
    try {
      const res = await fetchWithRefresh("/api/admin/auto-bet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "bet_baccarat" }),
      })
      if (res.ok) {
        const d = await res.json()
        if (d.skipped) {
          setAbStatus(`바카라 배팅 건너뜀 — ${d.skipReason ?? "배팅 구간 아님"}`)
        } else {
          setLastBetResults(d.results ?? [])
          setAccumulatedFee(d.accumulatedFee ?? 0)
          setBaccaratFee(d.baccaratFee ?? 0)
          const roundLabel = d.round != null ? `#${d.round}` : "-"
          setAbStatus(`바카라 배팅 완료 (라운드 ${roundLabel}) — 수수료 ${fmt(d.totalFeeThisRound ?? 0)}`)
          loadAbUsers()
        }
      }
    } catch { setAbStatus("바카라 배팅 실패") }
    setBaccaratLoading(false)
  }, [loadAbUsers])

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
        setRaceFee(d.raceFee ?? 0)
        setAbStatus(`레이스 배팅 완료 (라운드 #${d.round}) — 수수료 ${fmt(d.totalFeeThisRound ?? 0)}`)
        loadAbUsers()
      }
    } catch { setAbStatus("레이스 배팅 실패") }
    setRaceLoading(false)
  }, [loadAbUsers])

  // ── 페����� 감지 ───────────────────────────────────────────────
  const getBaccaratPhase = () => {
    const nowSec = Math.floor(Date.now() / 1000)
    const secInRound = nowSec % 30   // 0~29
    const rem = 30 - secInRound      // 30~1
    const round = Math.floor(nowSec / 30)
    // 0~4초: 정산(5초), 5~19초: 배팅가능(15초), 20~29초: 게임중(10초)
    const phase: "정산중" | "배팅가능" | "게임중" =
      secInRound < 5 ? "정산중" : secInRound < 20 ? "배팅가능" : "게임중"
    return { phase, rem, round }
  }
  const getRacePhase = () => {
    const nowSec = Math.floor(Date.now() / 1000)
    const secInRound = nowSec % 180
    const rem = 180 - secInRound
    const round = Math.floor(nowSec / 180)
    const phase: "정산중" | "배팅가능" | "게임중" =
      secInRound < 10 ? "정산중" : secInRound < 60 ? "배팅가능" : "게임중"
    return { phase, rem, round }
  }

  const startBaccarat = () => {
    if (baccaratIntervalRef.current) return
    setBaccaratRunning(true)
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
    setAbStatus("바카라 자동배팅 중지됨")
  }
  const startRace = () => {
    if (raceIntervalRef.current) return
    setRaceRunning(true)
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
    setAbStatus("레이스 자동배팅 중지됨")
  }

  const handleTopUp = async () => {
    setToppingUp(true)
    const res = await fetchWithRefresh("/api/admin/auto-bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "top_up" }),
    })
    if (res.ok) { const d = await res.json(); setAbStatus(`잔고 충전 완료 — ${d.topped}명 충전됨`); loadAbUsers() }
    setToppingUp(false)
  }

  const handleResetFee = async () => {
    const token = getToken(); if (!token) return
    const res = await fetchWithRefresh("/api/admin/auto-bet", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset_fee" }),
    })
    if (res.ok) {
      setAccumulatedFee(0)
      setBaccaratFee(0)
      setRaceFee(0)
      setAbStatus("누적 수수료 초기화 완료")
    }
  }

  const handleFullReset = async () => {
    setResetLoading(true); setResetError("")
    const verifyRes = await fetch("/api/admin/verify-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "역삼1", password: resetPassword }),
    })
    if (!verifyRes.ok) { setResetError("비밀번호가 올바르지 않습니다."); setResetLoading(false); return }
    const resetRes = await fetchWithRefresh("/api/admin/auto-bet", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "full_reset", gameType: resetGameType }),
    })
    if (resetRes.ok) {
      const d = await resetRes.json()
      setShowResetDialog(false); setResetPassword("")
      if (resetGameType === "all" || resetGameType === "baccarat") { setAccumulatedFee(0); setAbStats(null); setAbLogs([]) }
      setLastBetResults(null)
      const label = resetGameType === "all" ? "전체" : resetGameType === "baccarat" ? "바카라" : "레이스"
      setAbStatus(`${label} 초기화 완료 — ${d.reset}명 잔고 1천만원 리셋, 배팅 이력 삭제`)
      loadAbUsers()
    } else { setResetError("초기화 중 오류가 발생했습니다.") }
    setResetLoading(false)
  }

  // ── useEffect ─────────────────────────────────────────────────
  useEffect(() => {
    loadRoundStats(); loadHouseStats(); loadLpHistory()
    if (isSuperAdmin) { loadLpState(); loadAbUsers(); loadAbLogs() }
    statsRefreshRef.current = setInterval(() => {
      loadRoundStats(); loadHouseStats()
      if (isSuperAdmin) loadAbUsers()
    }, 30_000)
    return () => {
      if (baccaratIntervalRef.current) clearInterval(baccaratIntervalRef.current)
      if (raceIntervalRef.current)     clearInterval(raceIntervalRef.current)
      if (statsRefreshRef.current)     clearInterval(statsRefreshRef.current)
    }
  }, [loadRoundStats, loadHouseStats, loadLpHistory, loadLpState, loadAbUsers, loadAbLogs, isSuperAdmin])

  // Railway WS 게이트웨이 구독 — SSE 2개(Vercel Function 2개 점유) 제거
  const applyOddsPayload = useCallback((
    gameType: "baccarat" | "race",
    data: { roundNumber: number; userCount: number; pools: Record<string, number>; odds: Record<string, number> }
  ) => {
    if (gameType === "baccarat" && baccaratPhaseRef.current === "게임중") return
    if (gameType === "race"     && racePhaseRef.current     === "게임중") return

    const totalBet = Object.values(data.pools ?? {}).reduce((a, b) => a + b, 0)
    const stat: RoundStats = {
      round:      String(data.roundNumber),
      gameType,
      timestamp:  new Date().toISOString(),
      pools:      data.pools ?? {},
      userCount:  data.userCount ?? 0,
      totalBet,
      lpAmount:   0,
      fee:        Math.floor(totalBet * 0.2),
      feeRate:    0.2,
      mode:       (data.odds?.mode as string) ?? "pari",
      odds:       data.odds ?? null,
      prediction: {},
    }
    setCombined(prev => prev
      ? { ...prev, [gameType]: stat }
      : { baccarat: stat, race: stat }
    )
  }, [])

  useGatewayOdds("baccarat", (data) => applyOddsPayload("baccarat", data as Parameters<typeof applyOddsPayload>[1]))
  useGatewayOdds("race",     (data) => applyOddsPayload("race",     data as Parameters<typeof applyOddsPayload>[1]))

  // 카운트다운 ticker (200ms) — 페이즈 및 남은 시간 실시간 업데이트
  useEffect(() => {
    const tick = () => {
      const b = getBaccaratPhase()
      setBaccaratPhase(b.phase)
      setBaccaratTimeLeft(b.rem)
      baccaratPhaseRef.current = b.phase
      const r = getRacePhase()
      setRacePhase(r.phase)
      setRaceTimeLeft(r.rem)
      racePhaseRef.current = r.phase
    }
    tick()
    const iv = setInterval(tick, 200)
    return () => clearInterval(iv)
  }, [])

  // ── 플레이스홀더 ─────────────────────────────────────����───────
  const nowSec = Math.floor(Date.now() / 1000)
  const emptyBaccarat: RoundStats = {
    round: String(Math.floor(nowSec / 30)), gameType: "baccarat",
    timestamp: new Date().toISOString(), pools: { player: 0, banker: 0, tie: 0 },
    userCount: 0, totalBet: 0, lpAmount: 0, fee: 0, feeRate: 0.20,
    mode: "lp-dominant", prediction: {}, odds: null,
  }
  const emptyRace: RoundStats = {
      round: String(Math.floor(nowSec / 180)), gameType: "race",
    timestamp: new Date().toISOString(), pools: { bit: 0, coin: 0, tie: 0 },
    userCount: 0, totalBet: 0, lpAmount: 0, fee: 0, feeRate: 0.20,
    mode: "lp-dominant", prediction: {}, odds: null,
  }
  const baccaratStats = combined?.baccarat ?? emptyBaccarat
  const raceStats     = combined?.race     ?? emptyRace
  const totalUsers    = baccaratStats.userCount + raceStats.userCount
  const totalBetAll   = baccaratStats.totalBet  + raceStats.totalBet
  const totalFeeAll   = Math.floor(totalBetAll * 0.20)
  const totalLpAll    = baccaratStats.lpAmount  + raceStats.lpAmount

  const lowBalanceCount = abUsers.filter(u => u.balance < 1_000_000).length
  const baccaratUsers   = abUsers.filter(u => u.gameType === "baccarat")
  const raceUsers       = abUsers.filter(u => u.gameType === "race")

  return (
    <div className="space-y-6">

      {/* ════════════════════════════════════════════════════════
          섹션 1 — 현재 라운드 실시간 현황
      ═════════════════════════���══════════════════════════════ */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">현재 라운드 실시간 현황</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                바카라(30초) + 레이스(3분) &middot; 실시간
                {isBranchAdmin && <span className="ml-1 text-blue-500">· 내 지점</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Button
                variant={lpGlobal ? "outline" : "destructive"} size="sm"
                onClick={handleLpToggle} disabled={lpToggling}
                className="h-7 text-xs gap-1.5"
              >
                {lpToggling
                  ? <RefreshCw className="w-3 h-3 animate-spin" />
                  : <span className={`w-2 h-2 rounded-full inline-block ${lpGlobal ? "bg-emerald-500" : "bg-red-400"}`} />
                }
                LP {lpGlobal ? "활성" : "비활성"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={loadRoundStats} disabled={roundLoading} className="h-7 gap-1 text-xs">
              <RefreshCw className={`w-3 h-3 ${roundLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* 합산 4칸 */}
        <div className="px-5 pt-4 pb-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "전체 참여 유저",    value: `${totalUsers}명`, mono: false },
              { label: "전체 배팅액",       value: fmt(totalBetAll), mono: true  },
              { label: "수수료 20% (현재)", value: fmt(totalFeeAll), mono: true  },
              { label: "총 LP 투입",        value: fmt(totalLpAll),  mono: true  },
            ].map(item => (
              <div key={item.label} className="bg-muted rounded-xl p-3">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={`font-bold text-base text-foreground mt-0.5 ${item.mono ? "tabular-nums" : ""}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 수수료 안내 */}
        <div className="px-5 pb-3">
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/8 border border-amber-500/20 px-3 py-2.5 text-xs text-amber-600">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              배팅 발생 시 <strong>총 배팅액의 20%</strong>가 수수료로 차감됩니다.
              남은 80% + LP 투입액이 배당 풀을 구성합니다.
            </span>
          </div>
        </div>

        {/* 바카라 + 레이스 */}
        <div className="px-5 pb-5 flex flex-col md:flex-row gap-4">
          <GameRoundCard stats={baccaratStats} title="바카라"           phase={baccaratPhase} timeLeft={baccaratTimeLeft} />
          <GameRoundCard stats={raceStats}     title="레이스 (3분 라운드)" phase={racePhase}     timeLeft={raceTimeLeft}     />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          섹션 2 — 자동배팅 (superadmin 전용)
      ════════════════════════════════════════════════════════ */}
      {isSuperAdmin && (
        <>
          {/* 제어 패널 */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-4 h-4 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">자동배팅 제어</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">홀수=바카라(30초), 짝수=레이스(3분) &middot; 게임별 독립 제어</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { loadAbUsers(); loadAbLogs() }}>
                  <RefreshCw className="w-3 h-3" /> 새로고침
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7 text-xs gap-1"
                  onClick={handleTopUp} disabled={toppingUp || lowBalanceCount === 0}
                >
                  <Wallet className="w-3 h-3" />
                  {toppingUp ? "충전 중..." : `잔고 충전${lowBalanceCount > 0 ? ` (${lowBalanceCount}명)` : ""}`}
                </Button>
                {/* 바카라 초기화 + 시작/중지 */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline" size="sm" className="h-7 text-xs gap-1 text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
                    onClick={() => { setResetGameType("baccarat"); setShowResetDialog(true); setResetError(""); setResetPassword("") }}
                  >
                    <RotateCcw className="w-3 h-3" /> 바카라 초기화
                  </Button>
                  {baccaratRunning ? (
                    <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={stopBaccarat}>
                      <Square className="w-3 h-3" /> 중지
                    </Button>
                  ) : (
                    <Button size="sm" className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={startBaccarat} disabled={baccaratLoading}>
                      <Play className="w-3 h-3" /> 바카라 시작
                    </Button>
                  )}
                </div>
                {/* 레이스 초기화 + 시작/중지 */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline" size="sm" className="h-7 text-xs gap-1 text-orange-500 border-orange-500/30 hover:bg-orange-500/10"
                    onClick={() => { setResetGameType("race"); setShowResetDialog(true); setResetError(""); setResetPassword("") }}
                  >
                    <RotateCcw className="w-3 h-3" /> 레이스 초기화
                  </Button>
                  {raceRunning ? (
                    <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={stopRace}>
                      <Square className="w-3 h-3" /> 중지
                    </Button>
                  ) : (
                    <Button size="sm" className="h-7 text-xs gap-1 bg-orange-600 hover:bg-orange-700 text-white" onClick={startRace} disabled={raceLoading}>
                      <Play className="w-3 h-3" /> 레이스 시작
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* 바카라 / 레이스 분리 통계 */}
            <div className="px-5 pt-4 pb-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 바카라 패널 */}
                {(() => {
                  const u = baccaratUsers
                  const totalBalance = u.reduce((s,x) => s+x.balance, 0)
                  const seed = u.length * 10_000_000
                  const delta = totalBalance - seed
                  const winProfit = u.reduce((s,x) => s+(x.userStats?.winProfit??0), 0)
                  const loss = u.reduce((s,x) => s+(x.userStats?.loss??0), 0)
                  const winCount = u.reduce((s,x) => s+(x.userStats?.winCount??0), 0)
                  const loseCount = u.reduce((s,x) => s+(x.userStats?.loseCount??0), 0)
                  const tieCount = u.reduce((s,x) => s+(x.userStats?.tieCount??0), 0)
                  const totalBets = u.reduce((s,x) => s+(x.userStats?.totalBets??0), 0)
                  const lowBalance = u.filter(x => x.balance < 1_000_000).length
                  return (
                    <div className="border border-blue-500/20 bg-blue-500/5 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-blue-500">바카라</p>
                          <span className="text-xs text-muted-foreground">{u.length}명</span>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">누적 수수료</p>
                          <p className="text-sm font-black tabular-nums text-amber-500">{fmt(baccaratFee)}</p>
                        </div>
                      </div>
                      {/* 시드 대비 손익 */}
                      <div className="flex items-center justify-between bg-background/60 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-[10px] text-muted-foreground">총 잔고</p>
                          <p className="text-sm font-black tabular-nums text-foreground">{u.length ? fmt(totalBalance) : "—"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">시드 대비</p>
                          {u.length ? (
                            <p className={`text-sm font-black tabular-nums ${delta >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                              {delta >= 0 ? `+${fmt(delta)}` : `-${fmt(Math.abs(delta))}`}
                            </p>
                          ) : <p className="text-sm text-muted-foreground">—</p>}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">수익 누적</p>
                          <p className="font-bold tabular-nums text-emerald-500">{u.length ? `+${fmt(winProfit)}` : "—"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">손실 누적</p>
                          <p className="font-bold tabular-nums text-red-500">{u.length ? `-${fmt(loss)}` : "—"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">잔고부족</p>
                          <p className={`font-bold tabular-nums ${lowBalance > 0 ? "text-orange-500" : "text-muted-foreground"}`}>{lowBalance}명</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">승률</p>
                          <p className="font-bold tabular-nums text-foreground">{totalBets > 0 ? `${Math.round(winCount/totalBets*100)}%` : "—"}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-muted-foreground">승/패/타이</p>
                          <p className="font-bold tabular-nums text-foreground">{u.length ? `${winCount} / ${loseCount} / ${tieCount}` : "—"}</p>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* 레이스 패널 */}
                {(() => {
                  const u = raceUsers
                  const totalBalance = u.reduce((s,x) => s+x.balance, 0)
                  const seed = u.length * 10_000_000
                  const delta = totalBalance - seed
                  const winProfit = u.reduce((s,x) => s+(x.userStats?.winProfit??0), 0)
                  const loss = u.reduce((s,x) => s+(x.userStats?.loss??0), 0)
                  const winCount = u.reduce((s,x) => s+(x.userStats?.winCount??0), 0)
                  const loseCount = u.reduce((s,x) => s+(x.userStats?.loseCount??0), 0)
                  const tieCount = u.reduce((s,x) => s+(x.userStats?.tieCount??0), 0)
                  const totalBets = u.reduce((s,x) => s+(x.userStats?.totalBets??0), 0)
                  const lowBalance = u.filter(x => x.balance < 1_000_000).length
                  return (
                    <div className="border border-orange-500/20 bg-orange-500/5 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-orange-500">레이스</p>
                          <span className="text-xs text-muted-foreground">{u.length}명</span>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">누적 수수료</p>
                          <p className="text-sm font-black tabular-nums text-amber-500">{fmt(raceFee)}</p>
                        </div>
                      </div>
                      {/* 시드 대비 손익 */}
                      <div className="flex items-center justify-between bg-background/60 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-[10px] text-muted-foreground">총 잔고</p>
                          <p className="text-sm font-black tabular-nums text-foreground">{u.length ? fmt(totalBalance) : "—"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">시드 대비</p>
                          {u.length ? (
                            <p className={`text-sm font-black tabular-nums ${delta >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                              {delta >= 0 ? `+${fmt(delta)}` : `-${fmt(Math.abs(delta))}`}
                            </p>
                          ) : <p className="text-sm text-muted-foreground">—</p>}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">수익 누적</p>
                          <p className="font-bold tabular-nums text-emerald-500">{u.length ? `+${fmt(winProfit)}` : "—"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">손실 누적</p>
                          <p className="font-bold tabular-nums text-red-500">{u.length ? `-${fmt(loss)}` : "—"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">잔고부족</p>
                          <p className={`font-bold tabular-nums ${lowBalance > 0 ? "text-orange-500" : "text-muted-foreground"}`}>{lowBalance}명</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">승률</p>
                          <p className="font-bold tabular-nums text-foreground">{totalBets > 0 ? `${Math.round(winCount/totalBets*100)}%` : "—"}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-muted-foreground">승/패/타이</p>
                          <p className="font-bold tabular-nums text-foreground">{u.length ? `${winCount} / ${loseCount} / ${tieCount}` : "—"}</p>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
              {/* 전체 수수료 합산 + 초기화 */}
              <div className="mt-3 bg-muted rounded-xl px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <p className="text-xs text-muted-foreground">전체 누적 수수료</p>
                  <p className="text-base font-black tabular-nums text-amber-500">{fmt(accumulatedFee)}</p>
                </div>
                <button onClick={handleResetFee} className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2 py-1">전체 초기화</button>
              </div>
            </div>

            {/* 바카라 / 레이스 페이즈 상태 + 1회 버튼 */}
            <div className="px-5 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* 바카라 */}
              <div className="border border-border rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-blue-500">바카라</p>
                  {baccaratRunning && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      baccaratPhase === "배팅가능" ? "bg-emerald-500/15 text-emerald-500"
                      : baccaratPhase === "정산중"  ? "bg-amber-500/15 text-amber-500"
                      : "bg-muted-foreground/15 text-muted-foreground"
                    }`}>{baccaratPhase}</span>
                  )}
                  <p className="text-xs text-muted-foreground">배팅창 5~19초 · {baccaratUsers.length}명</p>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={runBaccaratBet} disabled={baccaratLoading || baccaratRunning}>
                  {baccaratLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : "1회"}
                </Button>
              </div>
              {/* 레이스 */}
              <div className="border border-border rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-orange-500">레이스</p>
                  {raceRunning && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      racePhase === "배팅가능" ? "bg-emerald-500/15 text-emerald-500"
                      : "bg-muted-foreground/15 text-muted-foreground"
                    }`}>{racePhase}</span>
                  )}
                  <p className="text-xs text-muted-foreground">배팅창 0~60초 · {raceUsers.length}명</p>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={runRaceBet} disabled={raceLoading || raceRunning}>
                  {raceLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : "1회"}
                </Button>
              </div>
            </div>

            {abStatus && (
              <div className="px-5 pb-3">
                <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">{abStatus}</p>
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

          {/* 자동배팅 유저 통합 목록 — 최근 배팅 접수 + 누적 통계 */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-foreground">자동배팅 유저 현황</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  이번 라운드 배팅 · 누적 통계 · 잔고 통합
                  {lastBetResults?.[0]?.round && (
                    <span className="ml-2 text-muted-foreground">라운드 #{lastBetResults[0].round}</span>
                  )}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setAbUserTab("baccarat")}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${abUserTab === "baccarat" ? "bg-blue-500 text-white" : "text-muted-foreground hover:text-foreground"}`}
                >
                  바카라 {baccaratUsers.length}명
                </button>
                <button
                  onClick={() => setAbUserTab("race")}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${abUserTab === "race" ? "bg-orange-500 text-white" : "text-muted-foreground hover:text-foreground"}`}
                >
                  레이스 {raceUsers.length}명
                </button>
              </div>
            </div>

            {/* 헤더 — 넓은 그리드로 균형있게 배치 */}
            <div className="px-5 py-2.5 bg-muted/50 grid grid-cols-12 gap-3 text-xs text-muted-foreground font-medium border-b border-border">
              <span className="col-span-2">유저</span>
              <span className="col-span-3">이번 라운드 배팅</span>
              <span className="col-span-1 text-center">결과</span>
              <span className="col-span-2 text-right">배팅/수익/손실 누적</span>
              <span className="col-span-2 text-center">승률 (승/패)</span>
              <span className="col-span-2 text-right">잔고</span>
            </div>

            <div className="divide-y divide-border/50">
              {abUsers.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">유저 목록 로딩 중...</div>
              ) : (abUserTab === "baccarat" ? baccaratUsers : raceUsers).map(u => {
                const us = u.userStats
                const ls = u.lastSettled
                const betResult = lastBetResults?.find(r => r.username === u.username)

                // 현재 라운드 시작 Unix timestamp (초)
                const roundDuration = u.gameType === "baccarat" ? 30 : 180
                const currentRoundStartSec = u.currentRound * roundDuration
                // lastSettled가 현재 라운드 시작 이후에 생성됐는지 확인
                const lsCreatedSec = ls?.createdAt ? Math.floor(new Date(ls.createdAt).getTime() / 1000) : 0
                const isCurrentRoundResult = lsCreatedSec >= currentRoundStartSec

                // 현재 라운드 배팅 중 → 결과 미확정
                // 현재 라운드 정산 완료 → 결과 표시
                // 직전 라운드 이전 → 표시 안 함
                const showResult = isCurrentRoundResult && !u.currentBet
                const resultLabel = showResult
                  ? ls?.result === "win" ? "승리" : ls?.result === "lose" ? "패배" : ls?.result === "tie" ? "타이" : null
                  : null
                const resultColor = ls?.result === "win"
                  ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/30"
                  : ls?.result === "lose" ? "text-red-500 bg-red-500/10 border-red-500/30"
                  : ls?.result === "tie" ? "text-amber-500 bg-amber-500/10 border-amber-500/30" : ""
                const totalBetAmount = us ? us.winProfit + us.loss : 0
                const netPnl = us ? us.winProfit - us.loss : 0
                const winRate = us && us.totalBets > 0 ? us.winRate : 0

                return (
                  <div key={u.id} className="px-5 py-3 grid grid-cols-12 gap-3 items-center hover:bg-muted/30 transition-colors">
                    {/* 유저명 + 라운드 */}
                    <div className="col-span-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold">
                          {u.username.replace("사용자", "")}
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-foreground block">{u.username}</span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">라운드 #{u.currentRound}</span>
                        </div>
                      </div>
                    </div>

                    {/* 이번 배팅 */}
                    <div className="col-span-3">
                      {betResult || u.currentBet ? (
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] px-2 py-1 rounded-md font-semibold border ${
                            (betResult?.gameType ?? u.gameType) === "baccarat"
                              ? "bg-blue-500/10 text-blue-500 border-blue-500/30"
                              : "bg-orange-500/10 text-orange-500 border-orange-500/30"
                          }`}>
                            {(betResult?.gameType ?? u.gameType) === "baccarat" ? "바카라" : "레이스"}
                          </span>
                          <span className={`text-sm font-bold ${SIDE_COLOR[betResult?.side ?? u.currentBet?.side] ?? "text-foreground"}`}>
                            {SIDE_LABEL[betResult?.side ?? u.currentBet?.side] ?? betResult?.side ?? u.currentBet?.side}
                          </span>
                          <span className="text-sm tabular-nums text-foreground font-medium">
                            {fmt(betResult?.amount ?? u.currentBet?.amount ?? 0)}
                          </span>
                          {(betResult?.odds ?? u.currentBet?.odds) && (
                            <span className="text-xs font-bold tabular-nums text-amber-500">
                              {(betResult?.odds ?? u.currentBet?.odds)?.toFixed(2)}x
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">배팅 대기중</span>
                      )}
                    </div>

                    {/* 이번 라운드 결과 */}
                    <div className="col-span-1 text-center">
                      {u.currentBet ? (
                        // 현재 라운드 배팅 접수됨 → 결과 대기
                        <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-md">진행중</span>
                      ) : resultLabel ? (
                        // 현재 라운드 정산 완료
                        <span className={`text-xs font-bold px-2 py-1 rounded-md border ${resultColor}`}>{resultLabel}</span>
                      ) : (
                        // 이번 라운드 배팅 없음
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>

                    {/* 배팅/수익/손실 누적 — 3줄 스택 */}
                    <div className="col-span-2 text-right space-y-0.5">
                      <div className="text-xs tabular-nums text-muted-foreground">
                        배팅 <span className="text-foreground font-medium">{fmt(totalBetAmount)}</span>
                      </div>
                      <div className="text-xs tabular-nums">
                        <span className="text-emerald-500 font-semibold">+{fmt(us?.winProfit ?? 0)}</span>
                        <span className="text-muted-foreground mx-1">/</span>
                        <span className="text-red-500 font-semibold">-{fmt(us?.loss ?? 0)}</span>
                      </div>
                    </div>

                    {/* 승률 + 승/패 횟수 */}
                    <div className="col-span-2 text-center">
                      <div className="text-sm font-bold tabular-nums text-foreground">{winRate}%</div>
                      <div className="text-[11px] tabular-nums">
                        <span className="text-emerald-500 font-semibold">{us?.winCount ?? 0}승</span>
                        <span className="text-muted-foreground mx-1">·</span>
                        <span className="text-red-500 font-semibold">{us?.loseCount ?? 0}패</span>
                      </div>
                    </div>

                    {/* 잔고 + 순손익 */}
                    <div className="col-span-2 text-right">
                      <div className={`text-base font-bold tabular-nums ${u.balance < 1_000_000 ? "text-orange-500" : "text-foreground"}`}>
                        {fmt(u.balance)}
                      </div>
                      <div className={`text-xs font-semibold tabular-nums ${netPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        순손익 {netPnl >= 0 ? "+" : ""}{fmt(netPnl)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 배팅 이력 */}
          {abLogs.length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h4 className="text-sm font-semibold text-foreground">배팅 이력 (최근 20회)</h4>
              </div>
              <div className="divide-y divide-border">
                {abLogs.map((log, i) => {
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
        </>
      )}

      {/* 섹션 3·4 (하우스 손익·LP 히스토리) 제거 — 데이터 미기록으로 불필요 */}
      {false && <><div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingDown className="w-4 h-4 text-primary" />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setHouseTab("house")}
                className={`text-sm font-semibold px-3 py-1 rounded-lg transition-colors ${houseTab === "house" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                하우스 손익 누적
              </button>
              <button
                onClick={() => setHouseTab("fee")}
                className={`text-sm font-semibold px-3 py-1 rounded-lg transition-colors ${houseTab === "fee" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {isBranchAdmin ? "내 ��점 수수료" : "지점별 수수료"}
              </button>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={loadHouseStats} disabled={houseLoading} className="h-7 gap-1 text-xs">
            <RefreshCw className={`w-3 h-3 ${houseLoading ? "animate-spin" : ""}`} /> 새로고침
          </Button>
        </div>

        {/* ── 하우스 손익 탭 ── */}
        {houseTab === "house" && (
          <>
            {masterSummary && (
              <div className="px-5 pt-4 pb-2">
                <p className="text-xs font-semibold text-muted-foreground mb-3">
                  {isBranchAdmin ? "내 지점 합산" : "전체 지점 합산"}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: "총 배팅액",   value: masterSummary.totalBet,    color: "text-foreground" },
                    { label: "총 지급액",   value: masterSummary.totalPayout, color: "text-red-500" },
                    { label: "하우스 손익", value: masterSummary.houseProfit, color: masterSummary.houseProfit >= 0 ? "text-emerald-500" : "text-red-500" },
                    { label: "총 LP 사용",  value: masterSummary.totalLpUsed, color: "text-blue-500" },
                    { label: "누적 수수료", value: masterSummary.totalFee,    color: "text-amber-500" },
                    { label: "미수금",      value: masterSummary.pendingFee,  color: masterSummary.pendingFee > 0 ? "text-orange-500" : "text-muted-foreground" },
                  ].map(item => (
                    <div key={item.label} className="bg-muted rounded-lg p-2.5">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className={`text-sm font-bold tabular-nums mt-0.5 ${item.color}`}>
                        {item.value < 0 ? "-" : ""}{fmt(Math.abs(item.value))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="divide-y divide-border mt-2">
              {houseLoading ? (
                <div className="py-8 flex justify-center"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : houseStats.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  아직 집계 데이터가 없습니다.<br />
                  <span className="text-xs">배팅이 발생하면 자동으로 기록됩니다.</span>
                </div>
              ) : houseStats.map(stat => {
                const pending  = Math.max(0, stat.total_fee - stat.total_collected)
                const housePnl = stat.total_bet - stat.total_payout
                const key      = `${stat.branch_id}-${stat.game_type}`
                return (
                  <div key={stat.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {stat.branches?.name ?? stat.branch_id}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {stat.game_type === "baccarat" ? "바카라" : "레이스"}
                        </span>
                        {stat.branches?.code && (
                          <span className="text-xs text-muted-foreground">({stat.branches.code})</span>
                        )}
                      </div>
                      {isSuperAdmin && pending > 0 && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" disabled={collectingId === key}
                          onClick={() => handleCollect(stat.branch_id, stat.game_type)}>
                          <Download className="w-3 h-3" />
                          {collectingId === key ? "처리 중..." : `${fmt(pending)} 수금`}
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                      <div><p className="text-muted-foreground">총 배팅</p><p className="font-semibold tabular-nums">{fmt(stat.total_bet)}</p></div>
                      <div><p className="text-muted-foreground">총 지급</p><p className="font-semibold text-red-500 tabular-nums">{fmt(stat.total_payout)}</p></div>
                      <div>
                        <p className="text-muted-foreground">하우스 손익</p>
                        <p className={`font-bold tabular-nums ${housePnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {housePnl >= 0 ? "+" : "-"}{fmt(Math.abs(housePnl))}
                        </p>
                      </div>
                      <div><p className="text-muted-foreground">LP 투입</p><p className="font-semibold text-blue-500 tabular-nums">{fmt(stat.total_lp_used)}</p></div>
                      <div>
                        <p className="text-muted-foreground">미수금</p>
                        <p className={`font-bold tabular-nums ${pending > 0 ? "text-orange-500" : "text-muted-foreground"}`}>{fmt(pending)}</p>
                      </div>
                    </div>
                    {stat.total_bet > 0 && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        누적 수수료: {fmt(stat.total_fee)} (배팅액 × 20%)
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {feeCollections.length > 0 && (
              <div className="border-t border-border px-5 py-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">수금 이력 (최근 20건)</p>
                <div className="space-y-2">
                  {feeCollections.map(fc => (
                    <div key={fc.id} className="flex items-center justify-between text-xs">
                      <span className="text-foreground">
                        {fc.branches?.name ?? fc.branch_id} &middot; {fc.game_type === "baccarat" ? "바카라" : "레이스"} &middot; {new Date(fc.created_at).toLocaleString("ko-KR")}
                      </span>
                      <span className="font-bold text-emerald-500 tabular-nums">{fmt(fc.collected_amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── 수수료 현황 탭 ── */}
        {houseTab === "fee" && (
          <>
            {feeByBranch.length > 0 && (
              <div className="px-5 pt-4 pb-3">
                <p className="text-xs font-semibold text-muted-foreground mb-3">
                  {isBranchAdmin ? "수수료 합산" : "지점별 수수료 합산"}
                </p>
                <div className="space-y-2">
                  {feeByBranch.sort((a, b) => b.total - a.total).map(b => (
                    <div key={b.branchId} className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{b.branchName}</span>
                          {b.branchCode && <span className="text-xs text-muted-foreground">({b.branchCode})</span>}
                        </div>
                        <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span>바카라 {fmt(b.baccarat)}</span>
                          <span>레이스 {fmt(b.race)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">누적 수수료</p>
                        <p className="text-base font-black tabular-nums text-amber-500">{fmt(b.total)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-border">
              <div className="px-5 py-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">유저별 수수료 상세 (최근 200건)</p>
              </div>
              {houseLoading ? (
                <div className="py-8 flex justify-center"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : feeLogs.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  수수료 기록이 없습니다.<br />
                  <span className="text-xs">배팅 정산 후 자동으로 기록됩니다.</span>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {feeLogs.map(log => {
                    const displayName = (log.profiles as any)?.nickname || (log.profiles as any)?.username || log.user_id.slice(0, 8)
                    const branchName  = (log.branches as any)?.name ?? log.branch_id.slice(0, 8)
                    const branchCode  = (log.branches as any)?.code
                    return (
                      <div key={log.id} className="px-5 py-3 flex items-center justify-between text-sm">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground truncate">{displayName}</span>
                            {!isBranchAdmin && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                                {branchName}{branchCode ? ` (${branchCode})` : ""}
                              </span>
                            )}
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                              {log.game_type === "baccarat" ? "바카라" : "레이스"}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">#{log.round_number}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            배팅 {fmt(log.bet_amount)} &middot; {new Date(log.created_at).toLocaleString("ko-KR")}
                          </p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-xs text-muted-foreground">수수료</p>
                          <p className="font-bold tabular-nums text-amber-500">+{fmt(log.fee_amount)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════
          섹션 4 — LP 히스토리
      ════════════════════════════════════════════════════════ */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">LP 유동성 히스토리</h3>
              <p className="text-xs text-muted-foreground mt-0.5">라운드별 LP 투입 기록</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">총 LP 사용액</p>
            <p className="text-sm font-bold text-foreground tabular-nums">{fmt(lpTotal)}</p>
          </div>
        </div>
        {lpLoading ? (
          <div className="py-8 flex justify-center"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : lpHistory.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">LP 사용 내역이 없습니다.</div>
        ) : (
          <div className="divide-y divide-border">
            {lpHistory.map(tx => {
              const poolLabel: Record<string, string> = { long_short: "롱/숏", under_over: "언더/오버", odd_even: "홀/짝", baccarat: "바카라", race: "레이스" }
              const sideLabel = tx.side === "a" ? "A" : tx.side === "b" ? "B" : tx.side
              return (
                <div key={tx.id} className="px-5 py-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{poolLabel[tx.pool_type] ?? tx.pool_type}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{sideLabel}</span>
                      {tx.settled_odds != null && <span className="text-xs text-muted-foreground">x{tx.settled_odds.toFixed(2)}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(tx.round_time * 1000).toLocaleString("ko-KR")} &middot; 유저배팅 {fmt(tx.user_amount)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{fmt(tx.lp_amount)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleTimeString("ko-KR")}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div></>}

      {/* ═══════════════��════════════════════���════���══════════════
          섹션 5 — 지점별 LP 설정 (superadmin 전용)
      ══════════��═════════════════��═══════════════════════════ */}


      {/* ��═══════��═══════════════════════════════════════════════
          전체 초기화 다이얼로그
      ══════════���══════���═���════════════════════════════════════ */}
      {showResetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl mx-4">
            <div className="flex items-center gap-2 mb-4">
              <Lock className={`w-4 h-4 ${resetGameType === "baccarat" ? "text-blue-500" : resetGameType === "race" ? "text-orange-500" : "text-red-500"}`} />
              <h3 className="text-sm font-bold text-foreground">
                {resetGameType === "baccarat" ? "바카라" : resetGameType === "race" ? "레이스" : "전체"} 초기화 확인
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-1">다음 항목이 초기화됩니다:</p>
            <ul className="text-xs text-muted-foreground mb-4 space-y-0.5 list-disc list-inside">
              <li>{resetGameType === "all" ? "전체" : resetGameType === "baccarat" ? "바카라" : "레이스"} 자동배팅 유저 잔고 → 1천만원</li>
              <li>해당 게임 배팅 이력(bet_history) 삭제</li>
              <li>누적 수수료, 승률, 수익/손실 통계 초기화</li>
            </ul>
            <p className="text-xs text-muted-foreground mb-2">
              <span className="font-semibold text-foreground">���삼1</span> 계정 비밀번���를 입력하세요.
            </p>
            <Input
              type="password" placeholder="비밀번호"
              value={resetPassword} onChange={e => setResetPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleFullReset()}
              className="h-9 text-sm mb-2" autoFocus
            />
            {resetError && <p className="text-xs text-red-500 mb-2">{resetError}</p>}
            <div className="flex gap-2">
              <Button
                variant="outline" size="sm" className="flex-1 h-8 text-xs"
                onClick={() => { setShowResetDialog(false); setResetPassword(""); setResetError("") }}
                disabled={resetLoading}
              >취소</Button>
              <Button
                size="sm" className="flex-1 h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
                onClick={handleFullReset} disabled={resetLoading || !resetPassword}
              >
                {resetLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : "초기화 실행"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
