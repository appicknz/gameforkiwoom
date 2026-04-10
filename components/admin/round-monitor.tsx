"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw, Download, TrendingUp, TrendingDown, Activity, Info } from "lucide-react"
import { Input } from "@/components/ui/input"

// ── 타입 ──────────────────────────────────────────────────────────────────
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

const getToken = () => { try { return localStorage.getItem("app_token") } catch { return null } }
const fmt = (n: number) => `₩${n.toLocaleString("ko-KR")}`

// ── LP 설정 행 ────────────────────────────────────────────────────────────
function LpBranchRow({ branch, onSaved }: { branch: Branch; onSaved: () => void }) {
  const [baccaratLp, setBaccaratLp] = useState(String(branch.lp_amount_baccarat ?? 50000))
  const [raceLp, setRaceLp] = useState(String(branch.lp_amount_race ?? 50000))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const handleSave = async () => {
    setSaving(true); setMsg(null)
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/branches/betting", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ branchId: branch.id, lpAmountBaccarat: parseInt(baccaratLp) || 0, lpAmountRace: parseInt(raceLp) || 0 }),
    })
    if (res.ok) { setMsg({ text: "저장됨", ok: true }); onSaved() }
    else setMsg({ text: "저장 실패", ok: false })
    setSaving(false)
    setTimeout(() => setMsg(null), 2000)
  }

  return (
    <div className="px-5 py-4">
      <p className="text-sm font-semibold text-foreground mb-3">{branch.name}</p>
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <p className="text-xs text-muted-foreground mb-1">바카라 LP</p>
          <Input type="number" value={baccaratLp} onChange={e => setBaccaratLp(e.target.value)} className="h-8 w-32 text-sm" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">레이스 LP</p>
          <Input type="number" value={raceLp} onChange={e => setRaceLp(e.target.value)} className="h-8 w-32 text-sm" />
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </Button>
        {msg && <span className={`text-xs font-medium ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</span>}
      </div>
    </div>
  )
}

// ── 게임 카드 (바카라 or 레이스) ──────────────────────────────────────────
function GameRoundCard({ stats, title }: { stats: RoundStats; title: string }) {
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
    stats.mode === "hybrid" ? "하이브리드"  : "LP 주도"
  const modeBg =
    stats.mode === "pari"   ? "bg-emerald-500/10 text-emerald-600" :
    stats.mode === "hybrid" ? "bg-amber-500/10 text-amber-600"    :
                              "bg-blue-500/10 text-blue-600"

  // 수수료 = 총 배팅 × 20% (배팅 있을 때만)
  const feeAmount = stats.fee > 0 ? stats.fee : Math.floor(stats.totalBet * 0.20)

  return (
    <div className="flex-1 min-w-0 bg-muted/40 rounded-xl p-4 space-y-3 border border-border">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            라운드 #{stats.round} &middot; {stats.userCount}명 참여
          </p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${modeBg}`}>{modeLabel}</span>
      </div>

      {/* 총 배팅 / 수수료(20%) / LP */}
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

      {/* 사이드별 풀 + 배당 */}
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
export function RoundMonitor({ isSuperAdmin = false, branches = [] }: { isSuperAdmin?: boolean; branches?: Branch[] }) {

  // 라운드 현황 (바카라 + 레이스 동시)
  const [combined, setCombined] = useState<CombinedStats | null>(null)
  const [roundLoading, setRoundLoading] = useState(false)

  // 하우스 손익
  const [houseStats, setHouseStats] = useState<HouseStat[]>([])
  const [feeCollections, setFeeCollections] = useState<FeeCollection[]>([])
  const [masterSummary, setMasterSummary] = useState<MasterSummary | null>(null)
  const [houseLoading, setHouseLoading] = useState(false)
  const [collectingId, setCollectingId] = useState<string | null>(null)

  // 수수료 상세
  const [feeLogs, setFeeLogs] = useState<FeeLog[]>([])
  const [feeByBranch, setFeeByBranch] = useState<FeeBranchSummary[]>([])

  // 섹션 2 탭 (하우스 손익 / 지점별 수수료)
  const [houseTab, setHouseTab] = useState<"house" | "fee">("house")

  // LP 히스토리
  const [lpHistory, setLpHistory] = useState<LpTx[]>([])
  const [lpTotal, setLpTotal] = useState(0)
  const [lpLoading, setLpLoading] = useState(false)

  // LP 전역 ON/OFF
  const [lpGlobal, setLpGlobal] = useState<boolean>(true)
  const [lpToggling, setLpToggling] = useState(false)
  const [lpBranches, setLpBranches] = useState<{ id: string; lp_enabled: boolean }[]>([])

  const loadLpState = useCallback(async () => {
    const token = getToken(); if (!token) return
    try {
      const res = await fetch("/api/admin/branches", { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      const list: { id: string; lp_enabled: boolean }[] = data.branches ?? []
      setLpBranches(list)
      setLpGlobal(list.length === 0 || list.some((b) => b.lp_enabled !== false))
    } catch {}
  }, [])

  const handleLpToggle = async () => {
    const token = getToken(); if (!token) return
    const next = !lpGlobal
    setLpToggling(true)
    try {
      const targets = lpBranches.length > 0 ? lpBranches : branches
      await Promise.all(targets.map(b =>
        fetch("/api/admin/branches/betting", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ branchId: b.id, lpEnabled: next }),
        })
      ))
      setLpGlobal(next)
    } catch {}
    setLpToggling(false)
  }

  const loadRoundStats = useCallback(async () => {
    const token = getToken(); if (!token) return
    setRoundLoading(true)
    try {
      const res = await fetch("/api/admin/round-stats", { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setCombined(await res.json())
    } catch {}
    setRoundLoading(false)
  }, [])

  const loadHouseStats = useCallback(async () => {
    const token = getToken(); if (!token) return
    setHouseLoading(true)
    try {
      const res = await fetch("/api/admin/house-stats", { headers: { Authorization: `Bearer ${token}` } })
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
  }, [])

  const loadLpHistory = useCallback(async () => {
    const token = getToken(); if (!token) return
    setLpLoading(true)
    try {
      const res = await fetch("/api/admin/lp-history", { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) { const d = await res.json(); setLpHistory(d.history ?? []); setLpTotal(d.totalLpUsed ?? 0) }
    } catch {}
    setLpLoading(false)
  }, [])

  const handleCollect = async (branchId: string, gt: string) => {
    const key = `${branchId}-${gt}`; setCollectingId(key)
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/house-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ branch_id: branchId, game_type: gt, note: "수금 처리" }),
    })
    if (res.ok) await loadHouseStats()
    setCollectingId(null)
  }

  useEffect(() => {
    loadRoundStats(); loadHouseStats(); loadLpHistory(); loadLpState()
  }, [loadRoundStats, loadHouseStats, loadLpHistory, loadLpState])

  useEffect(() => {
    const iv = setInterval(loadRoundStats, 2000)
    return () => clearInterval(iv)
  }, [loadRoundStats])

  // 기본 플레이스홀더
  const nowSec  = Math.floor(Date.now() / 1000)
  const emptyBaccarat: RoundStats = {
    round: String(Math.floor(nowSec / 30)), gameType: "baccarat",
    timestamp: new Date().toISOString(), pools: { player: 0, banker: 0, tie: 0 },
    userCount: 0, totalBet: 0, lpAmount: 0, fee: 0, feeRate: 0.20,
    mode: "lp-dominant", prediction: {}, odds: null,
  }
  const emptyRace: RoundStats = {
    round: String(Math.floor(nowSec / 300)), gameType: "race",
    timestamp: new Date().toISOString(), pools: { bit: 0, coin: 0, tie: 0 },
    userCount: 0, totalBet: 0, lpAmount: 0, fee: 0, feeRate: 0.20,
    mode: "lp-dominant", prediction: {}, odds: null,
  }
  const baccaratStats = combined?.baccarat ?? emptyBaccarat
  const raceStats     = combined?.race     ?? emptyRace

  // 두 게임 합산 현황
  const totalUsers = baccaratStats.userCount + raceStats.userCount
  const totalBetAll = baccaratStats.totalBet + raceStats.totalBet
  const totalFeeAll = Math.floor(totalBetAll * 0.20)
  const totalLpAll  = baccaratStats.lpAmount + raceStats.lpAmount

  return (
    <div className="space-y-6">

      {/* ── 섹션 1: 통합 라운드 모니터 ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">현재 라운드 실시간 현황</h3>
              <p className="text-xs text-muted-foreground mt-0.5">바카라(30초) + 레이스(5분) 동시 표시 &middot; 2초 갱신</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Button
                variant={lpGlobal ? "outline" : "destructive"}
                size="sm"
                onClick={handleLpToggle}
                disabled={lpToggling}
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

        {/* 전체 합산 4칸 */}
        <div className="px-5 pt-4 pb-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "전체 참여 유저",  value: `${totalUsers}명`,          mono: false },
              { label: "전체 배팅액",     value: fmt(totalBetAll),            mono: true  },
              { label: "수수료 20% (누적)", value: fmt(totalFeeAll),          mono: true  },
              { label: "총 LP 투입",      value: fmt(totalLpAll),             mono: true  },
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
              1명이 배팅할 경우 LP가 반대편을 채워 배당이 성립됩니다.
            </span>
          </div>
        </div>

        {/* 바카라 + 레이스 나란히 */}
        <div className="px-5 pb-5 flex flex-col md:flex-row gap-4">
          <GameRoundCard stats={baccaratStats} title="바카라" />
          <GameRoundCard stats={raceStats}     title="레이스 (5분 라운드)" />
        </div>
      </div>

      {/* ── ���션 2: 하우스 손익 누적 ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingDown className="w-4 h-4 text-primary" />
            <div className="flex items-center gap-2">
              {/* 탭 */}
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
                지점별 수수료 현황
              </button>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={loadHouseStats} disabled={houseLoading} className="h-7 gap-1 text-xs">
            <RefreshCw className={`w-3 h-3 ${houseLoading ? "animate-spin" : ""}`} /> 새로고침
          </Button>
        </div>

        {/* ── 탭: 하우스 손익 누적 ── */}
        {houseTab === "house" && (
          <>
            {masterSummary && (
              <div className="px-5 pt-4 pb-2">
                <p className="text-xs font-semibold text-muted-foreground mb-3">전체 지점 합산</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: "총 배팅액",   value: masterSummary.totalBet,      color: "text-foreground"  },
                    { label: "총 지급액",   value: masterSummary.totalPayout,   color: "text-red-500"     },
                    { label: "하우스 손익", value: masterSummary.houseProfit,   color: masterSummary.houseProfit >= 0 ? "text-emerald-500" : "text-red-500" },
                    { label: "총 LP 사용",  value: masterSummary.totalLpUsed,   color: "text-blue-500"    },
                    { label: "누적 수수료", value: masterSummary.totalFee,      color: "text-amber-500"   },
                    { label: "미수금",      value: masterSummary.pendingFee,    color: masterSummary.pendingFee > 0 ? "text-orange-500" : "text-muted-foreground" },
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
              ) : (
                houseStats.map(stat => {
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
                })
              )}
            </div>

            {feeCollections.length > 0 && (
              <div className="border-t border-border">
                <div className="px-5 py-3">
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
              </div>
            )}
          </>
        )}

        {/* ── 탭: 지점별 수수료 현황 ── */}
        {houseTab === "fee" && (
          <>
            {/* 지점별 요약 카드 */}
            {feeByBranch.length > 0 && (
              <div className="px-5 pt-4 pb-3">
                <p className="text-xs font-semibold text-muted-foreground mb-3">지점별 수수료 합산</p>
                <div className="space-y-2">
                  {feeByBranch
                    .sort((a, b) => b.total - a.total)
                    .map(b => (
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

            {/* 유저별 수수료 상세 로그 */}
            <div className="border-t border-border">
              <div className="px-5 py-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  유저별 수수료 상세 (최근 200건)
                </p>
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
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                              {branchName}{branchCode ? ` (${branchCode})` : ""}
                            </span>
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

      {/* ── 섹션 3: LP 히스토리 ── */}
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
      </div>

      {/* ── 섹션 4: 지점별 LP 금액 설정 (마스터 전용) ── */}
      {isSuperAdmin && branches.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">지점별 LP 금액 설정</h3>
            <p className="text-xs text-muted-foreground mt-0.5">바카라 / 레이스 게임별 LP 유동성 금액 (마스터 전용)</p>
          </div>
          <div className="divide-y divide-border">
            {branches.map(branch => (
              <LpBranchRow key={branch.id} branch={branch} onSaved={loadHouseStats} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
