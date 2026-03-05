"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Users, TrendingUp, Wallet, LogOut, RefreshCw } from "lucide-react"

interface Member {
  id: string
  username: string
  balance?: number
  bet_count?: number
  win_count?: number
  created_at: string
}

interface BranchInfo {
  id: string
  name: string
  code: string
  status: string
}

type Tab = "members" | "bets"

export function BranchDashboard({
  adminName,
  branch,
}: {
  adminName: string
  branch: BranchInfo
}) {
  const router = useRouter()

  const [tab, setTab] = useState<Tab>("members")
  const [members, setMembers] = useState<Member[]>([])
  const [bets, setBets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [chargeTarget, setChargeTarget] = useState<string | null>(null)
  const [chargeAmount, setChargeAmount] = useState("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [totalBets, setTotalBets] = useState(0)
  const [totalWins, setTotalWins] = useState(0)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/branch/data")
    if (res.ok) {
      const json = await res.json()
      setMembers(json.members ?? [])
      setBets(json.bets ?? [])
      setTotalBets(json.bets?.length ?? 0)
      setTotalWins(json.bets?.filter((b: any) => b.result === "win").length ?? 0)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleCharge = async (userId: string) => {
    const amount = parseInt(chargeAmount.replace(/,/g, ""))
    if (!amount || amount <= 0) return
    setActionLoading(userId)
    const res = await fetch("/api/balance/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: userId, amount }),
    })
    if (res.ok) {
      setChargeTarget(null)
      setChargeAmount("")
      await fetchData()
    }
    setActionLoading(null)
  }

  const handleLogout = async () => {
    const { createClient } = await import("@/lib/supabase/client")
    await createClient().auth.signOut()
    router.push("/login")
  }

  const fmtBalance = (n: number) =>
    n >= 10000 ? `${(n / 10000).toFixed(0)}만` : n.toLocaleString()

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      {/* 헤더 */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/30 flex items-center justify-center font-bold text-sm text-blue-400">B</div>
          <div>
            <p className="text-xs text-white/40">{branch.name} · {branch.code}</p>
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

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* 통계 */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { icon: Users, label: "지점 회원", value: members.length, color: "text-blue-400" },
            { icon: TrendingUp, label: "전체 배팅", value: totalBets, color: "text-purple-400" },
            { icon: Wallet, label: "승리 횟수", value: totalWins, color: "text-emerald-400" },
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
          {(["members", "bets"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? "bg-primary text-white" : "text-white/50 hover:text-white"}`}
            >
              {t === "members" ? "회원 관리" : "배팅 기록"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-white/40">불러오는 중...</div>
        ) : (
          <>
            {/* 회원 관리 */}
            {tab === "members" && (
              <div className="flex flex-col gap-2">
                {members.length === 0 && (
                  <p className="text-white/40 text-sm py-8 text-center">이 지점에 가입된 회원이 없습니다.</p>
                )}
                {members.map(m => (
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
                              placeholder="금액"
                              className="w-24 px-2 py-1.5 rounded-xl bg-white/10 border border-white/20 text-sm text-white placeholder:text-white/30 focus:outline-none"
                            />
                            <button
                              onClick={() => handleCharge(m.id)}
                              disabled={actionLoading === m.id}
                              className="px-3 py-1.5 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
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

            {/* 배팅 기록 */}
            {tab === "bets" && (
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                {bets.length === 0 ? (
                  <p className="text-white/40 text-sm py-8 text-center">배팅 기록이 없습니다.</p>
                ) : (
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
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
