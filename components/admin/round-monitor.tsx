"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw, Download, TrendingUp, TrendingDown, Activity } from "lucide-react"
import { Input } from "@/components/ui/input"

// ── 타입 ──────────────────────────────────────────────────
interface RoundStats {
  round: string
  gameType: string
  timestamp: string
  pools: Record<string, number>
  userCount: number
  totalBet: number
  lpAmount: number
  mode: string
  prediction: Record<string, number>
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
interface MasterSummary {
  totalBet: number; totalPayout: number; totalLpUsed: number
  totalFee: number; totalCollected: number; pendingFee: number; houseProfit: number
}
interface LpTx {
  id: number; pool_type: string; side: string; lp_amount: number
  user_amount: number; settled_odds: number | null; round_time: number; created_at: string
}
interface Branch { id: string; name: string; lp_enabled: boolean; lp_amount_baccarat?: number; lp_amount_race?: number }

// ── 헬퍼 ──────────────────────────────────────────────────
const getToken = () => { try { return localStorage.getItem("sb-token") } catch { return null } }

// ── LP 설정 행 서브컴포넌트 ───────────────────────────────
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

// ── 메인 컴포넌트 ─────────────────────────────────────────
export function RoundMonitor({ isSuperAdmin = false, branches = [] }: { isSuperAdmin?: boolean; branches?: Branch[] }) {
  const [gameType, setGameType] = useState<"baccarat" | "race">("baccarat")

  // 라운드 현황
  const [roundStats, setRoundStats] = useState<RoundStats | null>(null)
  const [roundLoading, setRoundLoading] = useState(false)

  // 하우스 손익
  const [houseStats, setHouseStats] = useState<HouseStat[]>([])
  const [feeCollections, setFeeCollections] = useState<FeeCollection[]>([])
  const [masterSummary, setMasterSummary] = useState<MasterSummary | null>(null)
  const [houseLoading, setHouseLoading] = useState(false)
  const [collectingId, setCollectingId] = useState<string | null>(null)

  // LP 히스토리
  const [lpHistory, setLpHistory] = useState<LpTx[]>([])
  const [lpTotal, setLpTotal] = useState(0)
  const [lpLoading, setLpLoading] = useState(false)

  const loadRoundStats = useCallback(async () => {
    const token = getToken(); if (!token) return
    setRoundLoading(true)
    try {
      const res = await fetch(`/api/admin/round-stats?type=${gameType}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setRoundStats(await res.json())
    } catch {}
    setRoundLoading(false)
  }, [gameType])

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
    const key = `${branchId}-${gt}`
    setCollectingId(key)
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/house-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ branch_id: branchId, game_type: gt, note: "수금 처리" }),
    })
    if (res.ok) await loadHouseStats()
    setCollectingId(null)
  }

  // 최초 로드
  useEffect(() => {
    loadRoundStats()
    loadHouseStats()
    loadLpHistory()
  }, [loadRoundStats, loadHouseStats, loadLpHistory])

  // 라운드 현황 2초 갱신
  useEffect(() => {
    const iv = setInterval(loadRoundStats, 2000)
    return () => clearInterval(iv)
  }, [loadRoundStats])

  const isBaccarat = gameType === "baccarat"
  const sides = isBaccarat
    ? [{ key: "player", label: "플레이어", color: "text-blue-500" }, { key: "banker", label: "뱅커", color: "text-red-500" }, { key: "타이", label: "타이", color: "text-amber-500" }]
    : [{ key: "bit", label: "BIT팀", color: "text-blue-500" }, { key: "coin", label: "COIN팀", color: "text-red-500" }, { key: "tie", label: "TIE", color: "text-amber-500" }]

  const displayStats = roundStats ?? {
    round: String(Math.floor(Date.now() / 1000 / 30)),
    gameType,
    timestamp: new Date().toISOString(),
    pools: isBaccarat ? { player: 0, banker: 0, tie: 0 } : { bit: 0, coin: 0, tie: 0 },
    userCount: 0, totalBet: 0, lpAmount: 0, mode: "lp-dominant", prediction: {},
  }

  return (
    <div className="space-y-6">

      {/* ── 섹션 1: 현재 라운드 실시간 모니터 ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">현재 라운드 실시간 현황</h3>
              <p className="text-xs text-muted-foreground mt-0.5">2초 간격 자동 갱신</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(["baccarat", "race"] as const).map(t => (
              <button key={t} onClick={() => setGameType(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${gameType === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {t === "baccarat" ? "바카라" : "레이스"}
              </button>
            ))}
            <Button variant="outline" size="sm" onClick={loadRoundStats} disabled={roundLoading} className="h-7 gap-1 text-xs">
              <RefreshCw className={`w-3 h-3 ${roundLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* 라운드 요약 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "라운드", value: `#${displayStats.round}`, mono: false },
              { label: "참여 유저", value: `${displayStats.userCount}명`, mono: false },
              { label: "총 배팅액", value: `₩${displayStats.totalBet.toLocaleString()}`, mono: true },
              { label: "시스템 LP",  value: `₩${displayStats.lpAmount.toLocaleString()}`, mono: true },
            ].map(item => (
              <div key={item.label} className="bg-muted rounded-xl p-3">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={`font-bold text-base text-foreground mt-0.5 ${item.mono ? "tabular-nums" : ""}`}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* 모드 배지 */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">운영 모드:</span>
            <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${
              displayStats.mode === "pari" ? "bg-emerald-500/10 text-emerald-600" :
              displayStats.mode === "hybrid" ? "bg-amber-500/10 text-amber-600" :
              "bg-blue-500/10 text-blue-600"
            }`}>
              {displayStats.mode === "pari" ? "파리뮤추얼" : displayStats.mode === "hybrid" ? "하이브리드" : "LP 주도"}
            </span>
          </div>

          {/* 배팅 방향별 집계 */}
          <div className="space-y-2">
            {(isBaccarat
              ? [{ key: "player", label: "플레이어", color: "bg-blue-500" }, { key: "banker", label: "뱅커", color: "bg-red-500" }, { key: "tie", label: "타이", color: "bg-amber-500" }]
              : [{ key: "bit", label: "BIT팀", color: "bg-blue-500" }, { key: "coin", label: "COIN팀", color: "bg-red-500" }, { key: "tie", label: "TIE", color: "bg-amber-500" }]
            ).map(({ key, label, color }) => {
              const bet = (displayStats.pools as Record<string, number>)[key] || 0
              const pct = displayStats.totalBet > 0 ? (bet / displayStats.totalBet) * 100 : 0
              const profit = (displayStats.prediction as Record<string, number>)[`${key}Profit`] ?? 0
              return (
                <div key={key} className="flex items-center gap-3 text-sm">
                  <span className="w-16 text-xs text-muted-foreground shrink-0">{label}</span>
                  <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${color} opacity-70 transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-28 tabular-nums text-xs text-right text-foreground shrink-0">₩{bet.toLocaleString()}</span>
                  {displayStats.totalBet > 0 && (
                    <span className={`w-20 text-xs text-right tabular-nums shrink-0 ${profit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {profit >= 0 ? "+" : ""}₩{Math.abs(profit).toLocaleString()}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {displayStats.totalBet === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">이번 라운드에 아직 배팅이 없습니다.</p>
          )}
        </div>
      </div>

      {/* ── 섹션 2: 하우스 손익 누적 ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingDown className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">하우스 손익 누적</h3>
              <p className="text-xs text-muted-foreground mt-0.5">지점별 배팅·지급·LP·수수료 집계</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={loadHouseStats} disabled={houseLoading} className="h-7 gap-1 text-xs">
            <RefreshCw className={`w-3 h-3 ${houseLoading ? "animate-spin" : ""}`} /> 새로고침
          </Button>
        </div>

        {/* 마스터 전체 합산 */}
        {masterSummary && (
          <div className="px-5 pt-4 pb-2">
            <p className="text-xs font-semibold text-muted-foreground mb-3">전체 지점 합산</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: "총 배팅액", value: masterSummary.totalBet, color: "text-foreground" },
                { label: "총 지급액", value: masterSummary.totalPayout, color: "text-red-500" },
                { label: "하우스 손익", value: masterSummary.houseProfit, color: masterSummary.houseProfit >= 0 ? "text-emerald-500" : "text-red-500" },
                { label: "총 LP 사용", value: masterSummary.totalLpUsed, color: "text-blue-500" },
                { label: "누적 수수료", value: masterSummary.totalFee, color: "text-amber-500" },
                { label: "미수금", value: masterSummary.pendingFee, color: masterSummary.pendingFee > 0 ? "text-orange-500" : "text-muted-foreground" },
              ].map(item => (
                <div key={item.label} className="bg-muted rounded-lg p-2.5">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className={`text-sm font-bold tabular-nums mt-0.5 ${item.color}`}>
                    {item.value < 0 ? "-" : ""}₩{Math.abs(item.value).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 지점별 상세 */}
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
              const pending = Math.max(0, stat.total_fee - stat.total_collected)
              const housePnl = stat.total_bet - stat.total_payout
              const key = `${stat.branch_id}-${stat.game_type}`
              return (
                <div key={stat.id} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{stat.branches?.name ?? stat.branch_id}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{stat.game_type === "baccarat" ? "바카라" : "레이스"}</span>
                    </div>
                    {isSuperAdmin && pending > 0 && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" disabled={collectingId === key}
                        onClick={() => handleCollect(stat.branch_id, stat.game_type)}>
                        <Download className="w-3 h-3" />
                        {collectingId === key ? "처리 중..." : `₩${pending.toLocaleString()} 수금`}
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                    <div><p className="text-muted-foreground">총 배팅</p><p className="font-semibold tabular-nums">₩{stat.total_bet.toLocaleString()}</p></div>
                    <div><p className="text-muted-foreground">총 지급</p><p className="font-semibold text-red-500 tabular-nums">₩{stat.total_payout.toLocaleString()}</p></div>
                    <div><p className="text-muted-foreground">하우스 손익</p>
                      <p className={`font-bold tabular-nums ${housePnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>{housePnl >= 0 ? "+" : "-"}₩{Math.abs(housePnl).toLocaleString()}</p>
                    </div>
                    <div><p className="text-muted-foreground">LP 투입</p><p className="font-semibold text-blue-500 tabular-nums">₩{stat.total_lp_used.toLocaleString()}</p></div>
                    <div><p className="text-muted-foreground">미수금</p>
                      <p className={`font-bold tabular-nums ${pending > 0 ? "text-orange-500" : "text-muted-foreground"}`}>₩{pending.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* 수금 이력 */}
        {feeCollections.length > 0 && (
          <div className="border-t border-border">
            <div className="px-5 py-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">수금 이력 (최근 20건)</p>
              <div className="space-y-2">
                {feeCollections.map(fc => (
                  <div key={fc.id} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{fc.branches?.name ?? fc.branch_id} · {fc.game_type === "baccarat" ? "바카라" : "레이스"} · {new Date(fc.created_at).toLocaleString("ko-KR")}</span>
                    <span className="font-bold text-emerald-500 tabular-nums">₩{fc.collected_amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 섹션 3: LP 히스토리 ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">LP 유동성 히스토리</h3>
              <p className="text-xs text-muted-foreground mt-0.5">파리뮤추얼 라운드별 LP 투입 기록</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">총 LP 사용액</p>
            <p className="text-sm font-bold text-foreground tabular-nums">₩{lpTotal.toLocaleString()}</p>
          </div>
        </div>
        {lpLoading ? (
          <div className="py-8 flex justify-center"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : lpHistory.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">LP 사용 내역이 없습니다.</div>
        ) : (
          <div className="divide-y divide-border">
            {lpHistory.map(tx => {
              const poolLabel: Record<string, string> = { long_short: "롱/숏", under_over: "언더/오버", odd_even: "홀/짝" }
              const sideLabel = tx.side === "a" ? "A (롱·언더·홀)" : "B (숏·오버·짝)"
              return (
                <div key={tx.id} className="px-5 py-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{poolLabel[tx.pool_type] ?? tx.pool_type}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{sideLabel}</span>
                      {tx.settled_odds != null && <span className="text-xs text-muted-foreground">x{tx.settled_odds.toFixed(2)}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(tx.round_time * 1000).toLocaleString("ko-KR")} · 유저배팅 ₩{tx.user_amount.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">₩{tx.lp_amount.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleTimeString("ko-KR")}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 섹션 4: 지점별 LP 설정 (마스터 전용) ── */}
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
