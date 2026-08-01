"use client"

import { useState, useEffect, useCallback } from "react"
import {
  getAllRequests, masterSettleRequest,
  getMasterSettingsAction, saveMasterSettings, getAllManagers,
} from "@/lib/pay/actions"
import { RefreshCw, Settings, CheckCircle, Bell, Users, Send } from "lucide-react"

type Request  = Awaited<ReturnType<typeof getAllRequests>>[number]
type Manager  = Awaited<ReturnType<typeof getAllManagers>>[number]
type MasterSettings = Awaited<ReturnType<typeof getMasterSettingsAction>>

type Tab = "requests" | "managers" | "settings" | "telegram"

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:           { label: "대기중",   color: "text-yellow-400" },
  manager_confirmed: { label: "관리자확인", color: "text-blue-400" },
  completed:         { label: "정산완료", color: "text-green-400" },
  rejected:          { label: "거절됨",   color: "text-red-400" },
}

export function MasterDashboard() {
  const [tab,       setTab]       = useState<Tab>("requests")
  const [reqs,      setReqs]      = useState<Request[]>([])
  const [managers,  setManagers]  = useState<Manager[]>([])
  const [settings,  setSettings]  = useState<MasterSettings | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loading,   setLoading]   = useState(false)

  // 설정 폼
  const [botToken,  setBotToken]  = useState("")
  const [chatId,    setChatId]    = useState("")
  const [savingCfg, setSavingCfg] = useState(false)
  const [cfgMsg,    setCfgMsg]    = useState("")

  // 텔레그램 메시지 전송 폼
  const [tgMessage,    setTgMessage]    = useState("")
  const [tgBtnText,    setTgBtnText]    = useState("")
  const [tgBtnUrl,     setTgBtnUrl]     = useState("")
  const [tgSending,    setTgSending]    = useState(false)
  const [tgResult,     setTgResult]     = useState<{ ok: boolean; msg: string } | null>(null)

  // 웹훅 설정
  const [webhookUrl,    setWebhookUrl]    = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [webhookSiteId, setWebhookSiteId] = useState("")
  const [savingWebhook, setSavingWebhook] = useState(false)
  const [webhookCfgMsg, setWebhookCfgMsg] = useState("")

  // 웹훅 테스트
  const [testPayload,   setTestPayload]   = useState("")
  const [testResult,    setTestResult]    = useState<{ ok: boolean; status: number; body: string } | null>(null)
  const [testLoading,   setTestLoading]   = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    const [r, m, s] = await Promise.all([getAllRequests(), getAllManagers(), getMasterSettingsAction()])
    setReqs(r); setManagers(m); setSettings(s)
    if (s) {
      setBotToken(s.telegramBotToken ?? "")
      setChatId(s.telegramChatId ?? "")
      setWebhookUrl(s.webhookUrl ?? "")
      setWebhookSecret(s.webhookSecret ?? "")
      setWebhookSiteId(s.siteId ?? "")
    }
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSettle = async (id: string) => {
    setLoading(true)
    await masterSettleRequest(id)
    await load()
    setLoading(false)
  }

  const handleSave = async () => {
    setSavingCfg(true); setCfgMsg("")
    await saveMasterSettings({ telegramBotToken: botToken, telegramChatId: chatId })
    setCfgMsg("저장되었습니다.")
    setSavingCfg(false)
  }

  const handleSaveWebhook = async () => {
    setSavingWebhook(true); setWebhookCfgMsg("")
    await saveMasterSettings({
      telegramBotToken: botToken,
      telegramChatId:   chatId,
      webhookUrl:       webhookUrl,
      webhookSecret:    webhookSecret,
      siteId:           webhookSiteId,
    })
    setWebhookCfgMsg("저장되었습니다.")
    setSavingWebhook(false)
  }

  const handleTestWebhook = async () => {
    setTestLoading(true); setTestResult(null)
    try {
      // 기본 테스트 payload 자동 생성
      const payload = testPayload.trim()
        ? JSON.parse(testPayload)
        : {
            applyNo:       "TEST-" + Date.now(),
            siteId:        webhookSiteId || "test-site",
            amount:        "10000",
            telegram:      "@test_user",
            applyAt:       new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
            walletAddress: "test_wallet_address",
            chain:         "TRX",
          }
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (webhookSecret) headers["x-webhook-secret"] = webhookSecret

      const res = await fetch("/api/pay-webhook-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl, payload, secret: webhookSecret }),
      })
      const data = await res.json()
      setTestResult({ ok: data.ok, status: data.status, body: data.body })
    } catch (e) {
      setTestResult({ ok: false, status: 0, body: String(e) })
    }
    setTestLoading(false)
  }

  const handleSendTelegram = async () => {
    if (!tgMessage.trim()) return
    setTgSending(true)
    setTgResult(null)
    try {
      const res = await fetch("/api/pay-send-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: tgMessage,
          buttonText: tgBtnText.trim() || undefined,
          buttonUrl:  tgBtnUrl.trim()  || undefined,
        }),
      })
      const data = await res.json()
      setTgResult({ ok: res.ok, msg: res.ok ? "전송 완료!" : (data.error ?? "전송 실패") })
    } catch {
      setTgResult({ ok: false, msg: "네트워크 오류" })
    }
    setTgSending(false)
  }

  const pending    = reqs.filter(r => r.status === "pending")
  const confirmed  = reqs.filter(r => r.status === "manager_confirmed")
  const completed  = reqs.filter(r => r.status === "completed")
  const totalAmount = completed.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-foreground">마스터 패널</h1>
          <p className="text-xs text-muted-foreground mt-0.5">전체 결제 관리</p>
        </div>
        <button onClick={load} disabled={refreshing} className="p-2 rounded-lg hover:bg-secondary transition-colors">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-border">
        {([
          { key: "requests",  label: "신청 목록",   icon: CheckCircle },
          { key: "managers",  label: "관리자",      icon: Users },
          { key: "telegram",  label: "텔레그램",    icon: Send },
          { key: "settings",  label: "설정",        icon: Settings },
        ] as { key: Tab; label: string; icon: React.FC<{ className?: string }> }[]).map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 h-11 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />{t.label}
            </button>
          )
        })}
      </div>

      <div className="px-5 py-5">
        {tab === "requests" && (
          <div className="flex flex-col gap-4">
            {/* 요약 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 rounded-2xl border border-border bg-secondary/20 p-4">
                <p className="text-xs text-muted-foreground">총 정산 완료 금액</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{totalAmount.toLocaleString("ko-KR")}원</p>
              </div>
              {[
                { label: "대기중",    count: pending.length,   color: "text-yellow-400" },
                { label: "관리자확인", count: confirmed.length, color: "text-blue-400" },
                { label: "정산완료",  count: completed.length, color: "text-green-400" },
                { label: "총 신청",   count: reqs.length,      color: "text-foreground" },
              ].map(s => (
                <div key={s.label} className="rounded-2xl border border-border bg-secondary/20 p-3 text-center">
                  <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
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
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-foreground">{req.amount.toLocaleString("ko-KR")}원</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {req.telegramUsername ? `@${req.telegramUsername}` : req.telegramId ?? "-"}
                        </p>
                      </div>
                      <span className={`text-xs font-medium ${st.color}`}>{st.label}</span>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mb-3">
                      <span>사이트 ID: <span className="text-foreground font-mono">{req.siteId}</span></span>
                      <span>추천코드: <span className="text-foreground font-mono">{req.referralCode}</span></span>
                    </div>
                    {req.managerId && (
                      <p className="text-xs text-muted-foreground mb-2">
                        관리자: <span className="text-foreground">{managers.find(m => m.id === req.managerId)?.uniqueCode ?? req.managerId.slice(0, 8)}</span>
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {new Date(req.createdAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {req.status === "manager_confirmed" && (
                        <button
                          onClick={() => handleSettle(req.id)}
                          disabled={loading}
                          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> 정산 완료
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab === "managers" && (
          <div className="flex flex-col gap-3">
            {managers.length === 0 && (
              <div className="text-center py-16 text-muted-foreground text-sm">등록된 관리자가 없습니다.</div>
            )}
            {managers.map(m => {
              const mgrReqs = reqs.filter(r => r.managerId === m.id)
              const mgrTotal = mgrReqs.filter(r => r.status === "completed").reduce((s, r) => s + r.amount, 0)
              return (
                <div key={m.id} className="rounded-2xl border border-border bg-secondary/10 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-sm font-bold text-primary">{m.uniqueCode}</code>
                    <span className="text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>신청 수: <span className="text-foreground">{mgrReqs.length}</span></span>
                    <span>정산 총액: <span className="text-green-400 font-medium">{mgrTotal.toLocaleString("ko-KR")}원</span></span>
                  </div>
                  {m.telegramChatId && (
                    <p className="text-xs text-muted-foreground mt-1">
                      TG: <span className="text-foreground font-mono">{m.telegramChatId}</span>
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {tab === "telegram" && (
          <div className="flex flex-col gap-4 max-w-lg mx-auto">

            {/* ── 섹션 1: 웹훅 설정 ── */}
            <div className="rounded-2xl border border-border bg-secondary/20 p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-foreground">외부 웹훅 설정</p>
              <p className="text-xs text-muted-foreground">충전 신청 시 외부 서버(dissig.com 등)로 전송되는 웹훅을 설정합니다.</p>
              <div className="flex flex-col gap-2">
                <input type="text" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
                  placeholder="웹훅 URL (예: https://www.dissig.com/api/webhooks/order)"
                  className="h-10 px-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <input type="text" value={webhookSecret} onChange={e => setWebhookSecret(e.target.value)}
                  placeholder="x-webhook-secret 헤더 값"
                  className="h-10 px-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <input type="text" value={webhookSiteId} onChange={e => setWebhookSiteId(e.target.value)}
                  placeholder="siteId 필드 값 (payload에 포함)"
                  className="h-10 px-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              {webhookCfgMsg && <p className="text-xs text-green-400">{webhookCfgMsg}</p>}
              <button onClick={handleSaveWebhook} disabled={savingWebhook}
                className="h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50">
                {savingWebhook ? "저장 중..." : "저장"}
              </button>
            </div>

            {/* ── 섹션 2: 웹훅 테스트 ── */}
            <div className="rounded-2xl border border-border bg-secondary/20 p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-foreground">웹훅 테스트</p>
              <p className="text-xs text-muted-foreground">위 URL로 테스트 payload를 전송하고 응답을 확인합니다. 비워두면 기본 payload가 자동 생성됩니다.</p>
              <textarea
                value={testPayload}
                onChange={e => setTestPayload(e.target.value)}
                placeholder={`{\n  "applyNo": "TEST-...",\n  "siteId": "${webhookSiteId || "your-site-id"}",\n  "amount": "10000",\n  "telegram": "@test_user",\n  "chain": "TRX",\n  "walletAddress": "..."\n}`}
                rows={6}
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
              <button onClick={handleTestWebhook} disabled={testLoading || !webhookUrl.trim()}
                className="h-10 rounded-xl border border-border bg-secondary text-foreground font-semibold text-sm disabled:opacity-50 hover:bg-secondary/80 transition-colors">
                {testLoading ? "전송 중..." : "테스트 전송"}
              </button>
              {testResult && (
                <div className={`rounded-xl border p-3 text-xs font-mono ${testResult.ok ? "border-green-500/30 bg-green-500/5 text-green-300" : "border-red-500/30 bg-red-500/5 text-red-300"}`}>
                  <p className="font-semibold mb-1">HTTP {testResult.status} — {testResult.ok ? "성공" : "실패"}</p>
                  <pre className="whitespace-pre-wrap break-all text-[11px] opacity-80">{testResult.body}</pre>
                </div>
              )}
            </div>

            {/* ── 섹션 3: 채널 메시지 전송 ── */}
            <div className="rounded-2xl border border-border bg-secondary/20 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">채널 메시지 전송</p>
              </div>
              <p className="text-xs text-muted-foreground">
                충전 채널 <span className="font-mono text-foreground">-1004471984422</span> 로 메시지를 전송합니다.
              </p>
              <textarea
                value={tgMessage}
                onChange={e => setTgMessage(e.target.value)}
                placeholder="전송할 메시지를 입력하세요."
                rows={4}
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground font-medium">인라인 버튼 (선택)</label>
                <input type="text" value={tgBtnText} onChange={e => setTgBtnText(e.target.value)}
                  placeholder="버튼 텍스트 (예: 지금 확인하기)"
                  className="h-10 px-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <input type="text" value={tgBtnUrl} onChange={e => setTgBtnUrl(e.target.value)}
                  placeholder="버튼 URL (예: https://coinrace.live)"
                  className="h-10 px-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              {tgMessage && (
                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <p className="text-[11px] text-muted-foreground mb-1.5">미리보기</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{tgMessage}</p>
                  {tgBtnText && tgBtnUrl && (
                    <span className="inline-block mt-2 px-3 py-1 rounded-lg bg-primary/20 border border-primary/30 text-primary text-xs font-medium">
                      {tgBtnText}
                    </span>
                  )}
                </div>
              )}
              {tgResult && (
                <p className={`text-sm font-medium ${tgResult.ok ? "text-green-400" : "text-red-400"}`}>{tgResult.msg}</p>
              )}
              <button onClick={handleSendTelegram} disabled={tgSending || !tgMessage.trim()}
                className="h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                <Send className="w-4 h-4" />
                {tgSending ? "전송 중..." : "텔레그램으로 전송"}
              </button>
            </div>

          </div>
        )}

        {tab === "settings" && (
          <div className="flex flex-col gap-4 max-w-lg mx-auto">
            <div className="rounded-2xl border border-border bg-secondary/20 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">마스터 텔레그램 알림</p>
              </div>
              <p className="text-xs text-muted-foreground">관리자 확인 완료 시 마스터에��� 알림을 보냅니다.</p>
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
                placeholder="채팅 ID"
                className="h-11 px-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {cfgMsg && <p className="text-sm text-green-400">{cfgMsg}</p>}
              <button
                onClick={handleSave}
                disabled={savingCfg}
                className="h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50"
              >
                {savingCfg ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
