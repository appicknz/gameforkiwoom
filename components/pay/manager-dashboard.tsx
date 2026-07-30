"use client"

import { useState, useEffect, useCallback } from "react"
import {
  getManagerRequests, confirmRequest, getManagerSettings,
  saveManagerSettings,
} from "@/lib/pay/actions"
import { payAuthClient } from "@/lib/pay/auth-client"
import { useRouter } from "next/navigation"
import {
  CheckCircle, Clock, XCircle, Settings, LogOut,
  RefreshCw, Copy, Check, Bell,
} from "lucide-react"

type Request = Awaited<ReturnType<typeof getManagerRequests>>[number]
type ManagerSettings = Awaited<ReturnType<typeof getManagerSettings>>

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:            { label: "대기중",   color: "text-yellow-400" },
  manager_confirmed:  { label: "확인완료", color: "text-blue-400" },
  completed:          { label: "정산완료", color: "text-green-400" },
  rejected:           { label: "거절됨",   color: "text-red-400" },
}

export function ManagerDashboard() {
  const router   = useRouter()
  const [tab,    setTab]    = useState<"requests" | "settings">("requests")
  const [reqs,   setReqs]   = useState<Request[]>([])
  const [mgr,    setMgr]    = useState<ManagerSettings | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // 설정 폼 상태
  const [botToken,  setBotToken]  = useState("")
  const [chatId,    setChatId]    = useState("")
  const [savingCfg, setSavingCfg] = useState(false)
  const [cfgMsg,    setCfgMsg]    = useState("")

  const load = useCallback(async () => {
    setRefreshing(true)
    const [r, m] = await Promise.all([getManagerRequests(), getManagerSettings()])
    setReqs(r); setMgr(m)
    if (m) { setBotToken(m.telegramBotToken ?? ""); setChatId(m.telegramChatId ?? "") }
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleConfirm = async (id: string) => {
    setLoading(true)
    await confirmRequest(id)
    await load()
    setLoading(false)
  }

  const handleSaveSettings = async () => {
    setSavingCfg(true); setCfgMsg("")
    await saveManagerSettings({ telegramBotToken: botToken, telegramChatId: chatId })
    setCfgMsg("저장되었습니다.")
    setSavingCfg(false)
    await load()
  }

  const handleLogout = async () => {
    await payAuthClient.signOut()
    router.push("/payments/panel/sign-in"); router.refresh()
  }

  const copyCode = () => {
    if (!mgr?.uniqueCode) return
    navigator.clipboard.writeText(`${window.location.origin}/payments?code=${mgr.uniqueCode}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const pending   = reqs.filter(r => r.status === "pending")
  const confirmed = reqs.filter(r => r.status === "manager_confirmed")
  const done      = reqs.filter(r => r.status === "completed" || r.status === "rejected")

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-foreground">관리자 패널</h1>
          {mgr && <p className="text-xs text-muted-foreground mt-0.5">코드: {mgr.uniqueCode}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={refreshing} className="p-2 rounded-lg hover:bg-secondary transition-colors">
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setTab(tab === "settings" ? "requests" : "settings")}
            className={`p-2 rounded-lg transition-colors ${tab === "settings" ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground"}`}
          >
            <Settings className="w-4 h-4" />
          </button>
          <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-secondary transition-colors">
            <LogOut className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {tab === "settings" ? (
        <div className="px-5 py-6 flex flex-col gap-5 max-w-lg mx-auto">
          {/* 미니앱 링크 */}
          <div className="rounded-2xl border border-border bg-secondary/20 p-4">
            <p className="text-sm font-semibold text-foreground mb-2">미니앱 링크</p>
            <p className="text-xs text-muted-foreground mb-3">이 링크를 텔레그램 봇 메뉴에 등록하거나 회원들에게 공유하세요.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-secondary px-3 py-2 rounded-lg text-muted-foreground truncate">
                /payments?code={mgr?.uniqueCode ?? "..."}
              </code>
              <button onClick={copyCode} className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors">
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>
          </div>

          {/* 텔레그램 설정 */}
          <div className="rounded-2xl border border-border bg-secondary/20 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">텔레그램 알림 설정</p>
            </div>
            <input
              type="text"
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              placeholder="봇 토큰"
              className="h-11 px-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <input
              type="text"
              value={chatId}
              onChange={e => setChatId(e.target.value)}
              placeholder="채팅 ID (예: -100xxxxxxxxx)"
              className="h-11 px-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {cfgMsg && <p className="text-sm text-green-400">{cfgMsg}</p>}
            <button
              onClick={handleSaveSettings}
              disabled={savingCfg}
              className="h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50"
            >
              {savingCfg ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 py-5 flex flex-col gap-5">
          {/* 요약 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "대기중",   count: pending.length,   color: "text-yellow-400" },
              { label: "확인완료", count: confirmed.length, color: "text-blue-400" },
              { label: "완료/거절", count: done.length,     color: "text-green-400" },
            ].map(s => (
              <div key={s.label} className="rounded-2xl border border-border bg-secondary/20 p-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* 신청 목록 */}
          <div className="flex flex-col gap-3">
            {reqs.length === 0 && (
              <div className="text-center py-16 text-muted-foreground text-sm">신청 내역이 없습니다.</div>
            )}
            {reqs.map(req => {
              const st = STATUS_LABEL[req.status] ?? { label: req.status, color: "text-muted-foreground" }
              return (
                <div key={req.id} className="rounded-2xl border border-border bg-secondary/10 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-foreground">{req.amount.toLocaleString("ko-KR")}원</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {req.telegramUsername ? `@${req.telegramUsername}` : req.telegramId ?? "미니앱"}
                      </p>
                    </div>
                    <span className={`text-xs font-medium ${st.color}`}>{st.label}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground mb-3">
                    <span>사이트 ID: <span className="text-foreground font-mono">{req.siteId}</span></span>
                    <span>추천코드: <span className="text-foreground font-mono">{req.referralCode}</span></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {new Date(req.createdAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {req.status === "pending" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirm(req.id)}
                          disabled={loading}
                          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> 확인
                        </button>
                      </div>
                    )}
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
