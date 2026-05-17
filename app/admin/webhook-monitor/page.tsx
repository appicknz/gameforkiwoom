"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  RefreshCw, Send, CheckCircle, XCircle, Clock,
  Wifi, WifiOff, Copy, ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react"

const SECRET = "tasko-internal"
const GOLD   = "#d4af37"
const UP     = "#22c55e"
const DOWN   = "#ef4444"
const WARN   = "#f59e0b"
const BG     = "#050d0a"
const PANEL  = "rgba(255,255,255,0.03)"
const BORDER = "rgba(212,175,55,0.12)"

interface RequestLog {
  id:          string
  received_at: string
  status:      string  // 'ok' | 'auth_fail' | 'missing_fields' | 'disabled' | 'error'
  ip:          string
  headers:     Record<string, string> | null
  body_raw:    Record<string, unknown> | null
  response:    Record<string, unknown> | null
  error_msg:   string | null
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  ok:             { label: "OK",           color: UP,   bg: "rgba(34,197,94,0.12)"  },
  auth_fail:      { label: "AUTH FAIL",    color: DOWN, bg: "rgba(239,68,68,0.12)"  },
  missing_fields: { label: "BAD PAYLOAD",  color: WARN, bg: "rgba(245,158,11,0.12)" },
  disabled:       { label: "DISABLED",     color: WARN, bg: "rgba(245,158,11,0.12)" },
  error:          { label: "ERROR",        color: DOWN, bg: "rgba(239,68,68,0.12)"  },
}

const DEFAULT_PAYLOAD = JSON.stringify({
  signal_type:        "TRIPLE_COMBO_UP3",
  symbol:             "JCTUSDT.P",
  price:              "0.003091",
  formatted_time_kst: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace("T", " ").slice(0, 19),
}, null, 2)

export default function WebhookMonitorPage() {
  const [logs,        setLogs]        = useState<RequestLog[]>([])
  const [loading,     setLoading]     = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastAt,      setLastAt]      = useState<Date | null>(null)
  const [expandedId,  setExpandedId]  = useState<string | null>(null)
  const [newIds,      setNewIds]      = useState<Set<string>>(new Set())
  const [elapsed,     setElapsed]     = useState(0)

  const [payload,    setPayload]    = useState(DEFAULT_PAYLOAD)
  const [sending,    setSending]    = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [copied,     setCopied]     = useState(false)

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const latestIdRef = useRef<string | null>(null)

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/auto-signal/webhook-logs?limit=100", {
        headers: { "x-internal-secret": SECRET },
        cache: "no-store",
      })
      if (!res.ok) return
      const data = await res.json()
      const incoming: RequestLog[] = data.logs ?? []

      setLogs(prev => {
        // 새로 들어온 항목 감지
        const prevIds = new Set(prev.map(l => l.id))
        const fresh   = incoming.filter(l => !prevIds.has(l.id))
        if (fresh.length > 0) {
          setNewIds(ids => new Set([...ids, ...fresh.map(l => l.id)]))
          setTimeout(() => setNewIds(ids => {
            const next = new Set(ids)
            fresh.forEach(l => next.delete(l.id))
            return next
          }), 3000)
          latestIdRef.current = fresh[0]?.id ?? latestIdRef.current
          // 최신 항목 자동 펼치기
          setExpandedId(fresh[0]?.id ?? null)
        }
        return incoming
      })
      setLastAt(new Date())
      setElapsed(0)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(fetchLogs, 2000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [autoRefresh, fetchLogs])

  // elapsed 카운터
  useEffect(() => {
    elapsedRef.current = setInterval(() => setElapsed(n => n + 1), 1000)
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current) }
  }, [])

  const sendTest = async () => {
    setSending(true)
    setSendResult(null)
    try {
      const parsed = JSON.parse(payload)
      const res = await fetch("/api/auto-signal/webhook-logs", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": SECRET },
        body:    JSON.stringify(parsed),
      })
      const data = await res.json()
      if (data.ok) {
        setSendResult({ ok: true, msg: `포지션 생성 완료 — ID: ${data.id}` })
        setTimeout(fetchLogs, 500)
      } else {
        setSendResult({ ok: false, msg: data.error ?? data.reason ?? JSON.stringify(data) })
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

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    })

  const okCount   = logs.filter(l => l.status === "ok").length
  const failCount = logs.filter(l => l.status !== "ok").length

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: "rgba(255,255,255,0.85)", fontFamily: "'JetBrains Mono', monospace" }}>

      {/* 상단 헤더 */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: "12px 20px" }}
        className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span style={{ fontSize: 12, fontWeight: 900, color: GOLD, letterSpacing: 3 }}>WEBHOOK MONITOR</span>
          {/* 수신 통계 */}
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>수신</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: UP }}>{okCount}건 성공</span>
            {failCount > 0 && <span style={{ fontSize: 13, fontWeight: 800, color: DOWN }}>{failCount}건 실패</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
            <Clock className="w-2.5 h-2.5 inline mr-1" />{elapsed}s ago
          </span>
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded"
            style={{
              background: autoRefresh ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${autoRefresh ? "rgba(34,197,94,0.3)" : BORDER}`,
              fontSize: 10, fontWeight: 700,
              color: autoRefresh ? UP : "rgba(255,255,255,0.4)", cursor: "pointer",
            }}>
            {autoRefresh
              ? <><Wifi className="w-3 h-3" /> LIVE</>
              : <><WifiOff className="w-3 h-3" /> PAUSED</>}
          </button>
          <button onClick={fetchLogs}
            style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
            <RefreshCw className="w-3.5 h-3.5" style={{ color: GOLD }} />
          </button>
        </div>
      </div>

      <div className="flex gap-0" style={{ height: "calc(100dvh - 53px)" }}>

        {/* ── 왼쪽: URL 정보 + 테스트 ── */}
        <div style={{ width: 360, flexShrink: 0, borderRight: `1px solid ${BORDER}`, overflowY: "auto", padding: 16 }}
          className="flex flex-col gap-4">

          {/* URL 카드 */}
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", marginBottom: 8, letterSpacing: 2 }}>WEBHOOK ENDPOINT</p>
            <div className="flex items-center gap-2"
              style={{ background: "rgba(0,0,0,0.5)", borderRadius: 8, padding: "8px 12px" }}>
              <span style={{ fontSize: 10, color: UP, flex: 1, wordBreak: "break-all", lineHeight: 1.5 }}>
                https://coinrace.live/api/auto-signal/webhook
              </span>
              <button onClick={copyUrl} style={{ cursor: "pointer", color: copied ? UP : "rgba(255,255,255,0.3)", flexShrink: 0 }}>
                {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="mt-3 space-y-1.5">
              <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 2, marginBottom: 6 }}>REQUIRED HEADERS</p>
              {[["Content-Type", "application/json"], ["x-internal-secret", "tasko-internal"]].map(([k, v]) => (
                <div key={k} className="flex items-center gap-2"
                  style={{ background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "5px 10px" }}>
                  <span style={{ fontSize: 9, color: GOLD, minWidth: 130 }}>{k}</span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-3" style={{ background: "rgba(212,175,55,0.05)", borderRadius: 8, padding: "8px 10px", border: `1px solid rgba(212,175,55,0.15)` }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: GOLD, marginBottom: 4 }}>플라스크에서 보낼 때</p>
              <pre style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{`headers = {
  "Content-Type": "application/json",
  "x-internal-secret": "tasko-internal"
}`}</pre>
            </div>
          </div>

          {/* 테스트 전송 */}
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", marginBottom: 10, letterSpacing: 2 }}>TEST PAYLOAD</p>
            <textarea
              value={payload}
              onChange={e => { setPayload(e.target.value); setSendResult(null) }}
              rows={10}
              style={{
                width: "100%", background: "rgba(0,0,0,0.5)", border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: "10px 12px", fontSize: 10,
                color: "rgba(255,255,255,0.8)", lineHeight: 1.7,
                fontFamily: "inherit", resize: "vertical", outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={sendTest}
              disabled={sending}
              className="flex items-center justify-center gap-2 w-full mt-2"
              style={{
                padding: "9px 0", borderRadius: 8, fontWeight: 800, fontSize: 10,
                cursor: sending ? "not-allowed" : "pointer",
                background: "rgba(212,175,55,0.12)",
                border: `1px solid rgba(212,175,55,0.3)`,
                color: GOLD, letterSpacing: 1,
              }}>
              {sending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {sending ? "SENDING..." : "SEND TEST"}
            </button>
            {sendResult && (
              <div className="flex items-start gap-2 mt-2"
                style={{
                  padding: "8px 10px", borderRadius: 8, fontSize: 10, lineHeight: 1.5,
                  background: sendResult.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                  border: `1px solid ${sendResult.ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                  color: sendResult.ok ? UP : DOWN,
                }}>
                {sendResult.ok
                  ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  : <XCircle    className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                {sendResult.msg}
              </div>
            )}
          </div>
        </div>

        {/* ── 오른쪽: 수신 로그 ── */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* 컬럼 헤더 */}
          <div className="flex items-center"
            style={{ padding: "8px 16px", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: BG, zIndex: 10 }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.2)", letterSpacing: 2, flex: 1 }}>RECEIVED SIGNALS</span>
            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginLeft: "auto" }}>
              총 {logs.length}건 · 2초마다 자동 갱신
            </span>
          </div>

          {loading && (
            <div style={{ padding: 40, textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-3" style={{ color: GOLD }} />
              로딩 중...
            </div>
          )}
          {!loading && logs.length === 0 && (
            <div style={{ padding: 60, textAlign: "center" }}>
              <WifiOff className="w-10 h-10 mx-auto mb-4" style={{ color: "rgba(255,255,255,0.08)" }} />
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>수신된 웹훅이 없습니다</p>
              <p style={{ fontSize: 9, color: "rgba(255,255,255,0.12)", marginTop: 8, lineHeight: 1.7 }}>
                플라스크에서 웹훅을 보내거나<br />왼쪽 TEST PAYLOAD로 테스트해보세요
              </p>
            </div>
          )}

          {logs.map((log, idx) => {
            const isNew      = newIds.has(log.id)
            const isExpanded = expandedId === log.id
            const meta       = STATUS_META[log.status] ?? { label: log.status.toUpperCase(), color: WARN, bg: "rgba(245,158,11,0.1)" }
            const isOk       = log.status === "ok"
            const bodyRaw    = log.body_raw as Record<string, unknown> | null
            const symbol     = (bodyRaw?.symbol as string | undefined)?.replace(/\.P$/, "").replace("USDT", "") ?? "—"
            const price      = bodyRaw?.price ?? "—"
            const signalType = bodyRaw?.signal_type ?? bodyRaw?.alert_type ?? "—"

            return (
              <div key={log.id} style={{
                borderBottom: `1px solid rgba(212,175,55,0.05)`,
                background: isNew ? "rgba(212,175,55,0.04)" : "transparent",
                transition: "background 0.5s",
              }}>
                {/* 메인 행 */}
                <div
                  className="flex items-center gap-3"
                  style={{ padding: "10px 16px", cursor: "pointer" }}
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}>

                  {/* 상태 뱃지 */}
                  <span style={{
                    padding: "2px 7px", borderRadius: 5, fontSize: 8, fontWeight: 900,
                    background: meta.bg, color: meta.color, letterSpacing: 0.5, flexShrink: 0,
                  }}>{meta.label}</span>

                  {/* 심볼 + 시그널 타입 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-2">
                      {isOk && (
                        <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.9)" }}>
                          {symbol}/USDT
                        </span>
                      )}
                      {!isOk && log.error_msg && (
                        <span className="flex items-center gap-1" style={{ fontSize: 10, color: meta.color }}>
                          <AlertTriangle className="w-3 h-3" />{log.error_msg.slice(0, 60)}
                        </span>
                      )}
                      {isOk && (
                        <span style={{ fontSize: 9, color: "rgba(212,175,55,0.5)" }}>{String(signalType)}</span>
                      )}
                    </div>
                    {isOk && (
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>
                        진입가 ${String(price)}
                      </div>
                    )}
                  </div>

                  {/* IP + 시각 + 펼치기 */}
                  <div className="text-right flex-shrink-0 flex items-center gap-3">
                    <div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{log.ip}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{fmtTime(log.received_at)}</div>
                    </div>
                    {isExpanded
                      ? <ChevronUp  className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
                      : <ChevronDown className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />}
                  </div>
                </div>

                {/* 확장: 원본 JSON */}
                {isExpanded && (
                  <div style={{ margin: "0 16px 12px" }}>
                    <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                      {/* BODY */}
                      {log.body_raw && (
                        <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: 8, overflow: "hidden", border: `1px solid rgba(255,255,255,0.07)` }}>
                          <div style={{ padding: "5px 10px", borderBottom: `1px solid rgba(255,255,255,0.05)`, fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>
                            REQUEST BODY
                          </div>
                          <pre style={{ margin: 0, padding: "8px 10px", fontSize: 9, color: "rgba(255,255,255,0.6)", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.6 }}>
                            {JSON.stringify(log.body_raw, null, 2)}
                          </pre>
                        </div>
                      )}
                      {/* RESPONSE */}
                      {log.response && (
                        <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: 8, overflow: "hidden", border: `1px solid ${isOk ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}` }}>
                          <div style={{ padding: "5px 10px", borderBottom: `1px solid rgba(255,255,255,0.05)`, fontSize: 8, fontWeight: 700, color: isOk ? UP : DOWN, letterSpacing: 1 }}>
                            RESPONSE
                          </div>
                          <pre style={{ margin: 0, padding: "8px 10px", fontSize: 9, color: isOk ? "rgba(34,197,94,0.8)" : "rgba(239,68,68,0.8)", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.6 }}>
                            {JSON.stringify(log.response, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
