"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { RefreshCw, Send, CheckCircle, XCircle, Clock, Wifi, WifiOff, Copy, ChevronDown, ChevronUp, Trash2 } from "lucide-react"

const SECRET = "tasko-internal"
const GOLD   = "#d4af37"
const UP     = "#22c55e"
const DOWN   = "#ef4444"
const BG     = "#050d0a"
const PANEL  = "rgba(255,255,255,0.03)"
const BORDER = "rgba(212,175,55,0.12)"

interface WebhookLog {
  id:          string
  signal_type: string
  symbol:      string
  direction:   string
  entry_price: number
  size_usd:    number
  leverage:    number
  signal_time: string
  date_label:  string
  is_closed:   boolean
  webhook_raw: Record<string, string> | null
  created_at:  string
}

const DEFAULT_PAYLOAD = JSON.stringify({
  signal_type:       "TRIPLE_COMBO_UP3",
  symbol:            "JCTUSDT.P",
  price:             "0.003091",
  formatted_time_kst: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace("T", " ").slice(0, 19),
}, null, 2)

export default function WebhookMonitorPage() {
  const [logs,       setLogs]       = useState<WebhookLog[]>([])
  const [loading,    setLoading]    = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copied,     setCopied]     = useState(false)

  // 테스트 전송 상태
  const [payload,    setPayload]    = useState(DEFAULT_PAYLOAD)
  const [sending,    setSending]    = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/auto-signal/webhook-logs?limit=50", {
        headers: { "x-internal-secret": SECRET },
      })
      if (!res.ok) return
      const data = await res.json()
      setLogs(data.logs ?? [])
      setLastRefresh(new Date())
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(fetchLogs, 5000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [autoRefresh, fetchLogs])

  const sendTest = async () => {
    setSending(true)
    setSendResult(null)
    try {
      const parsed = JSON.parse(payload)
      const res = await fetch("/api/auto-signal/webhook-logs", {
        method:  "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-internal-secret": SECRET,
        },
        body: JSON.stringify(parsed),
      })
      const data = await res.json()
      if (data.ok) {
        setSendResult({ ok: true,  msg: `포지션 생성 완료 — ID: ${data.id}` })
        setTimeout(fetchLogs, 800)
      } else {
        setSendResult({ ok: false, msg: data.error ?? data.reason ?? "실패" })
      }
    } catch (e: unknown) {
      setSendResult({ ok: false, msg: e instanceof Error ? e.message : "JSON 파싱 오류" })
    } finally { setSending(false) }
  }

  const copyUrl = () => {
    navigator.clipboard.writeText("https://coinrace.live/api/auto-signal/webhook")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString("ko-KR", {
      timeZone:    "Asia/Seoul",
      month:       "2-digit",
      day:         "2-digit",
      hour:        "2-digit",
      minute:      "2-digit",
      second:      "2-digit",
      hour12:      false,
    })

  const elapsed = lastRefresh
    ? Math.round((Date.now() - lastRefresh.getTime()) / 1000)
    : null

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: "rgba(255,255,255,0.85)", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      {/* 헤더 */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: "14px 20px" }}
        className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 11, fontWeight: 800, color: GOLD, letterSpacing: 2 }}>WEBHOOK MONITOR</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>coinrace.live</span>
        </div>
        <div className="flex items-center gap-3">
          {/* 자동갱신 토글 */}
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded"
            style={{
              background: autoRefresh ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.05)",
              border:     `1px solid ${autoRefresh ? "rgba(34,197,94,0.3)" : BORDER}`,
              fontSize:   10, fontWeight: 700,
              color: autoRefresh ? UP : "rgba(255,255,255,0.4)",
              cursor: "pointer",
            }}>
            {autoRefresh ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {autoRefresh ? "LIVE" : "PAUSED"}
          </button>
          {/* 수동 새로고침 */}
          <button onClick={fetchLogs}
            style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
            <RefreshCw className="w-3.5 h-3.5" style={{ color: GOLD }} />
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-4" style={{ gridTemplateColumns: "1fr 1fr", maxWidth: 1200, margin: "0 auto" }}>

        {/* 왼쪽: 웹훅 URL 정보 + 테스트 전송 */}
        <div className="flex flex-col gap-3">

          {/* URL 카드 */}
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", marginBottom: 8, letterSpacing: 2 }}>WEBHOOK ENDPOINT</p>
            <div className="flex items-center gap-2" style={{ background: "rgba(0,0,0,0.4)", borderRadius: 8, padding: "8px 12px" }}>
              <span style={{ fontSize: 11, color: UP, flex: 1, wordBreak: "break-all" }}>
                https://coinrace.live/api/auto-signal/webhook
              </span>
              <button onClick={copyUrl} style={{ cursor: "pointer", flexShrink: 0, color: copied ? UP : "rgba(255,255,255,0.3)" }}>
                {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            {/* 헤더 정보 */}
            <div className="mt-3 space-y-1.5">
              <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 2 }}>REQUIRED HEADERS</p>
              {[
                ["Content-Type",      "application/json"],
                ["x-internal-secret", "tasko-internal"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center gap-2" style={{ background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "5px 10px" }}>
                  <span style={{ fontSize: 10, color: GOLD, minWidth: 140 }}>{k}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{v}</span>
                </div>
              ))}
            </div>
            {/* TradingView 안내 */}
            <div className="mt-3" style={{ background: "rgba(212,175,55,0.05)", borderRadius: 8, padding: "8px 10px", border: `1px solid rgba(212,175,55,0.15)` }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: GOLD, marginBottom: 4, letterSpacing: 1 }}>TRADINGVIEW NOTE</p>
              <p style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
                TradingView는 커스텀 헤더를 지원하지 않습니다.<br />
                아래 payload에 <span style={{ color: GOLD }}>"secret": "tasko-internal"</span> 추가 후<br />
                webhook route에서 body secret도 검증하도록 업데이트 필요.
              </p>
            </div>
          </div>

          {/* 테스트 전송 */}
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", marginBottom: 10, letterSpacing: 2 }}>TEST PAYLOAD</p>
            <textarea
              value={payload}
              onChange={e => { setPayload(e.target.value); setSendResult(null) }}
              rows={12}
              style={{
                width: "100%", background: "rgba(0,0,0,0.5)", border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: "10px 12px",
                fontSize: 10, color: "rgba(255,255,255,0.8)", lineHeight: 1.7,
                fontFamily: "inherit", resize: "vertical", outline: "none",
                boxSizing: "border-box",
              }}
            />
            {/* 전송 버튼 */}
            <button
              onClick={sendTest}
              disabled={sending}
              className="flex items-center justify-center gap-2 w-full mt-2"
              style={{
                padding: "10px 0", borderRadius: 8, fontWeight: 800, fontSize: 11,
                cursor: sending ? "not-allowed" : "pointer",
                background: sending ? "rgba(212,175,55,0.1)" : "rgba(212,175,55,0.15)",
                border: `1px solid rgba(212,175,55,0.35)`,
                color: GOLD, letterSpacing: 1,
              }}>
              {sending
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Send className="w-3.5 h-3.5" />}
              {sending ? "SENDING..." : "SEND TEST WEBHOOK"}
            </button>
            {/* 결과 */}
            {sendResult && (
              <div className="flex items-center gap-2 mt-2" style={{
                padding: "8px 12px", borderRadius: 8, fontSize: 10,
                background: sendResult.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                border: `1px solid ${sendResult.ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                color: sendResult.ok ? UP : DOWN,
              }}>
                {sendResult.ok
                  ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                {sendResult.msg}
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽: 수신 로그 */}
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* 로그 헤더 */}
          <div className="flex items-center justify-between" style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}` }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 2 }}>RECEIVED SIGNALS</span>
              <span style={{
                padding: "1px 6px", borderRadius: 10, fontSize: 9, fontWeight: 800,
                background: "rgba(212,175,55,0.12)", color: GOLD,
              }}>{logs.length}</span>
            </div>
            {elapsed !== null && (
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
                <Clock className="w-2.5 h-2.5 inline mr-1" />
                {elapsed}s ago
              </span>
            )}
          </div>

          {/* 로그 목록 */}
          <div style={{ overflowY: "auto", flex: 1, maxHeight: "calc(100vh - 180px)" }}>
            {loading && (
              <div style={{ padding: 24, textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.2)" }}>로딩 중...</div>
            )}
            {!loading && logs.length === 0 && (
              <div style={{ padding: 40, textAlign: "center" }}>
                <WifiOff className="w-8 h-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.1)" }} />
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>수신된 시그널이 없습니다</p>
                <p style={{ fontSize: 9, color: "rgba(255,255,255,0.15)", marginTop: 6 }}>왼쪽에서 테스트 웹훅을 보내보세요</p>
              </div>
            )}
            {logs.map((log, idx) => {
              const isExpanded = expandedId === log.id
              const dirColor   = log.direction === "long" ? UP : DOWN
              return (
                <div key={log.id} style={{
                  borderBottom: `1px solid rgba(212,175,55,0.05)`,
                  background: idx === 0 ? "rgba(212,175,55,0.03)" : "transparent",
                }}>
                  {/* 메인 행 */}
                  <div
                    className="flex items-center justify-between"
                    style={{ padding: "10px 16px", cursor: "pointer" }}
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}>
                    <div className="flex items-center gap-2">
                      {/* 방향 뱃지 */}
                      <span style={{
                        padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 900,
                        background: log.direction === "long" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                        color: dirColor,
                      }}>{log.direction === "long" ? "LONG" : "SHORT"}</span>
                      {/* 심볼 */}
                      <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.9)" }}>
                        {log.symbol.replace("USDT", "")}/USDT
                      </span>
                      {/* 레버리지 */}
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{log.leverage}x</span>
                      {/* 인덱스 (최신) */}
                      {idx === 0 && (
                        <span style={{
                          padding: "1px 5px", borderRadius: 10, fontSize: 7, fontWeight: 800,
                          background: "rgba(212,175,55,0.15)", color: GOLD,
                        }}>NEW</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 700 }}>
                          ${Number(log.entry_price).toFixed(6).replace(/\.?0+$/, "")}
                        </div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
                          {formatTime(log.created_at)}
                        </div>
                      </div>
                      {isExpanded
                        ? <ChevronUp  className="w-3 h-3" style={{ color: "rgba(255,255,255,0.3)" }} />
                        : <ChevronDown className="w-3 h-3" style={{ color: "rgba(255,255,255,0.3)" }} />}
                    </div>
                  </div>
                  {/* 시그널 타입 */}
                  <div style={{ padding: "0 16px 8px", fontSize: 9, color: "rgba(212,175,55,0.5)" }}>
                    {log.signal_type}
                  </div>
                  {/* 확장: 원본 JSON */}
                  {isExpanded && log.webhook_raw && (
                    <div style={{ margin: "0 16px 12px", background: "rgba(0,0,0,0.5)", borderRadius: 8, overflow: "hidden", border: `1px solid rgba(212,175,55,0.1)` }}>
                      <div className="flex items-center justify-between" style={{ padding: "6px 10px", borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>RAW PAYLOAD</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(JSON.stringify(log.webhook_raw, null, 2))}
                          style={{ cursor: "pointer", color: "rgba(255,255,255,0.3)" }}>
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <pre style={{
                        margin: 0, padding: "10px 12px",
                        fontSize: 9, lineHeight: 1.7,
                        color: "rgba(255,255,255,0.6)",
                        overflowX: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                      }}>
                        {JSON.stringify(log.webhook_raw, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
