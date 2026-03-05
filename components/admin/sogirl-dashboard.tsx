"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Users, Building2, TrendingUp, Wallet, CheckCircle,
  XCircle, Clock, ChevronDown, ChevronUp, LogOut, RefreshCw
} from "lucide-react"

interface Branch {
  id: string
  name: string
  code: string
  status: "pending" | "approved" | "rejected"
  owner_email: string
  created_at: string
  member_count?: number
}

interface Member {
  id: string
  username: string
  role: string
  branch_id: string | null
  created_at: string
  email?: string
  balance?: number
  bet_count?: number
  win_count?: number
}

interface Stats {
  totalBranches: number
  pendingBranches: number
  totalMembers: number
  totalBets: number
  totalWins: number
}

type Tab = "branches" | "members" | "bets"

export function SogirlDashboard({ adminName }: { adminName: string }) {
  const router = useRouter()

  const [tab, setTab] = useState<Tab>("branches")
  const [branches, setBranches] = useState<Branch[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [stats, setStats] = useState<Stats>({ totalBranches: 0, pendingBranches: 0, totalMembers: 0, totalBets: 0, totalWins: 0 })
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null)
  const [chargeTarget, setChargeTarget] = useState<string | null>(null)
  const [chargeAmount, setChargeAmount] = useState("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/sogirl/data")
    if (res.ok) {
      const json = await res.json()
      setBranches(json.branches ?? [])
      setMembers(json.members ?? [])
      setStats(json.stats ?? { totalBranches: 0, pendingBranches: 0, totalMembers: 0, totalBets: 0, totalWins: 0 })
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const updateBranchStatus = async (branchId: string, status: "approved" | "rejected") => {
    setActionLoading(branchId)
    await fetch("/api/sogirl/branch-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId, status }),
    })
    await fetchData()
    setActionLoading(null)
  }

  const handleCharge = async (userId: string) => {
    const amount = parseInt(chargeAmount.replace(/,/g, ""))
    if (!amount || amount <= 0) return
    setActionLoading(userId)
    await fetch("/api/balance/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: userId, amount, note: "본사 직접 충전" }),
    })
    setChargeTarget(null)
    setChargeAmount("")
    await fetchData()
    setActionLoading(null)
  }

  const handleLogout = async () => {
    await fetch("/api/sogirl/logout", { method: "POST" })
    router.push("/sogirl/login")
  }

  const fmtBalance = (n: number) =>
    n >= 10000 ? `${(n / 10000).toFixed(0)}만` : n.toLocaleString()

  const statusBadge = (status: string) => {
    if (status === "approved") return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400">승인</span>
    if (status === "rejected") return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400">거부</span>
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400">대기</span>
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      {/* 헤더 */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-sm">S</div>
          <div>
            <p className="text-xs text-white/40">본사 관리자</p>
            <p className="text-sm font-semibold">{adminName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="p-2 rounded-lg hover:bg-white/10 transition text-white/60 hover:text-white">
            <RefreshCw size={16} />
          </button>
          <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm transition">
            <LogOut size={14} /> 로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[
            { icon: Building2, label: "전체 지점", value: stats.totalBranches, color: "text-blue-400" },
            { icon: Clock, label: "승인 대기", value: stats.pendingBranches, color: "text-amber-400" },
            { icon: Users, label: "전체 회원", value: stats.totalMembers, color: "text-emerald-400" },
            { icon: TrendingUp, label: "전체 배팅", value: stats.totalBets, color: "text-purple-400" },
            { icon: Wallet, label: "승리 횟수", value: stats.totalWins, color: "text-pink-400" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
              <Icon size={18} className={color} />
              <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
              <p className="text-xs text-white/50">{label}</p>
            </div>
          ))}
        </div>

        {/* 탭 */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-6 w-fit">
          {(["branches", "members", "bets"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? "bg-primary text-white" : "text-white/50 hover:text-white"}`}
            >
              {t === "branches" ? "지점 관리" : t === "members" ? "회원 관리" : "배팅 기록"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-white/40">불러오는 중...</div>
        ) : (
          <>
            {/* 지점 관리 */}
            {tab === "branches" && (
              <div className="flex flex-col gap-3">
                {branches.length === 0 && <p className="text-white/40 text-sm py-8 text-center">등록된 지점이 없습니다.</p>}
                {branches.map(b => (
                  <div key={b.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition"
                      onClick={() => setExpandedBranch(expandedBranch === b.id ? null : b.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
                          <Building2 size={16} className="text-blue-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{b.name}</p>
                          <p className="text-xs text-white/40">코드: {b.code} · 회원 {b.member_count}명</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {statusBadge(b.status)}
                        {expandedBranch === b.id ? <ChevronUp size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
                      </div>
                    </div>
                    {expandedBranch === b.id && (
                      <div className="border-t border-white/10 p-4 bg-white/[0.02]">
                        <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                          <div><span className="text-white/40">이메일: </span>{b.owner_email}</div>
                          <div><span className="text-white/40">가입일: </span>{new Date(b.created_at).toLocaleDateString("ko-KR")}</div>
                        </div>
                        {b.status === "pending" && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => updateBranchStatus(b.id, "approved")}
                              disabled={actionLoading === b.id}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-sm font-medium transition disabled:opacity-50"
                            >
                              <CheckCircle size={14} /> 승인
                            </button>
                            <button
                              onClick={() => updateBranchStatus(b.id, "rejected")}
                              disabled={actionLoading === b.id}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm font-medium transition disabled:opacity-50"
                            >
                              <XCircle size={14} /> 거부
                            </button>
                          </div>
                        )}
                        {b.status === "approved" && (
                          <button
                            onClick={() => updateBranchStatus(b.id, "rejected")}
                            disabled={actionLoading === b.id}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm font-medium transition disabled:opacity-50"
                          >
                            <XCircle size={14} /> 승인 취소
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 회원 관리 */}
            {tab === "members" && (
              <div className="flex flex-col gap-2">
                {members.length === 0 && <p className="text-white/40 text-sm py-8 text-center">등록된 회원이 없습니다.</p>}
                {members.filter(m => m.role === "user").map(m => (
                  <div key={m.id} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm">
                          {(m.username ?? "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{m.username ?? "미설정"}</p>
                          <p className="text-xs text-white/40">
                            배팅 {m.bet_count}회 · 승리 {m.win_count}회 · 잔고 {fmtBalance(m.balance ?? 0)}원
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {chargeTarget === m.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={chargeAmount}
                              onChange={e => setChargeAmount(e.target.value)}
                              placeholder="금액 입력"
                              className="w-28 px-2 py-1.5 rounded-xl bg-white/10 border border-white/20 text-sm text-white placeholder:text-white/30 focus:outline-none"
                            />
                            <button
                              onClick={() => handleCharge(m.id)}
                              disabled={actionLoading === m.id}
                              className="px-3 py-1.5 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
                            >
                              충전
                            </button>
                            <button
                              onClick={() => { setChargeTarget(null); setChargeAmount("") }}
                              className="px-3 py-1.5 rounded-xl bg-white/10 text-white/60 text-sm hover:bg-white/15 transition"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setChargeTarget(m.id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm transition"
                          >
                            <Wallet size={13} /> 충전
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 배팅 기록 — 추후 구현 */}
            {tab === "bets" && (
              <BetHistoryTable />
            )}
          </>
        )}
      </main>
    </div>
  )
}

function BetHistoryTable() {
  const [bets, setBets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from("bet_history")
      .select("*, profiles(username)")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setBets(data ?? [])
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="py-12 text-center text-white/40">불러오는 중...</div>
  if (bets.length === 0) return <div className="py-12 text-center text-white/40">배팅 기록이 없습니다.</div>

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            {["회원", "방향", "끝자리", "홀짝", "금액", "결과", "일시"].map(h => (
              <th key={h} className="px-4 py-3 text-left text-white/50 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bets.map(b => (
            <tr key={b.id} className="border-b border-white/5 hover:bg-white/5 transition">
              <td className="px-4 py-3">{(b.profiles as any)?.username ?? "—"}</td>
              <td className="px-4 py-3">{b.bet_direction ?? "—"}</td>
              <td className="px-4 py-3">{b.bet_digit ?? "—"}</td>
              <td className="px-4 py-3">{b.bet_parity ?? "—"}</td>
              <td className="px-4 py-3">{b.bet_amount?.toLocaleString()}원</td>
              <td className="px-4 py-3">
                {b.result === "win"
                  ? <span className="text-emerald-400 font-semibold">승리</span>
                  : b.result === "lose"
                  ? <span className="text-red-400">패배</span>
                  : <span className="text-white/40">대기</span>}
              </td>
              <td className="px-4 py-3 text-white/40">
                {new Date(b.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
