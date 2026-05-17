"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  RefreshCw, CheckCircle, XCircle, AlertCircle,
  Wifi, WifiOff, Copy, ChevronDown, ChevronUp,
  SkipForward, Send, Lock,
} from "lucide-react"

const SECRET  = "tasko-internal"
const GOLD    = "#d4af37"
const UP      = "#22c55e"
const DOWN    = "#ef4444"
const WARN    = "#f59e0b"
const BG      = "#050d0a"
const PANEL   = "rgba(255,255,255,0.03)"
const BORDER  = "rgba(212,175,55,0.12)"

interface RequestLog {
  id:          string
  received_at: string
  status:      "ok" | "auth_fail" | "duplicate" | "skipped" | "error"
  status_code: number
  symbol:      string | null
  signal_type: string | null
  body_raw:    Record<string, unknown> | null
  error_msg:   string | null
  ip:          string | null
}

const STATUS_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  ok:        { label: "OK",       color: UP,    Icon: CheckCircle  },
  auth_fail: { label: "AUTH",     color: DOWN,  Icon: Lock         },
  duplicate: { label: "DUP",      color: WARN,  Icon: AlertCircle  },
  skipped:   { label: "SKIP",     color: WARN,  Icon: SkipForward  },
  error:     { label: "ERROR",    color: DOWN,  Icon: XCircle      },
}

const DEFAULT_PAYLOAD = `{
  "secret": "tasko-internal",
  "signal_type": "TRIPLE_COMBO_UP3",
  "symbol": "JCTUSDT.P",
  "price": "0.003091",
  "formatted_time_kst": "${new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace("T", " ").slice(0, 19)}"
}`

export default function WebhookMonitorPage() {
  const [logs,        setLogs]        = useState<RequestLog[]>([])
  const [loading,     setLoading]     = useState(true)
  const [live,        setLive]        = useState(true)
  const [expandedId,  setExpandedId]  = useState<string | null>(null)
  const [newIds,      setNewIds]      = useState<Set<string>>(new Set())
  const [lastAt,      setLastAt]      = useState<string | null>(null)
  const [countdown,   setCountdown]   = useState(2)

  // 테스트 전송
  const [payload,    setPayload]    = useState(DEFAULT_PAYLOAD)
  const [sending,    setSending]    = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [copied,     setCopied]     = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cdRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLogs = useCallback(async (since?: string) => {
    try {
      const url = since
        ? `/api/auto-signal/webhook-logs?limit=100&since=${encodeURIComponent(since)}`
        : `/api/auto-signal/webhook-logs?limit=100`
      const res = await fetch(url, { headers: { "x-internal-secret": SECRET } })
      if (!res.ok) return
      const data = await res.json()
      const incoming: RequestLog[] = data.logs ?? []
      if (incoming.length > 0) {
        setNewIds(new Set(incoming.map((l: RequestLog) => l.id)))
        setTimeout(() => setNewIds(new Set()), 2500)
        if (since) {
          // 새 항목만 앞에 추가
          setLogs(prev => [...incoming, ...prev].slice(0, 200))
        } else {
          setLogs(incoming)
        }
        setLastAt(incoming[0].received_at)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  // 초기 전체 로드
  useEffect(() => { fetchLogs() }, [fetchLogs])

  // 2초 폴링
  useEffect(() => {
    if (!live) {
      if (timerRef.current) clearInterval(timerRef.current)
      if (cdRef.current)    clearInterval(cdRef.current)
      return
    }
    setCountdown(2)
    timerRef.current = setInterval(() => {
      setLastAt(prev => { fetchLogs(prev ?? undefined); return prev })
      setCountdown(2)
    }, 2000)
    cdRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (cdRef.current)    clearInterval(cdRef.current)
    }
  }, [live, fetchLogs])

  const sendTest = async () => {
    setSending(true)
    setSendResult(null)
    try {
      const parsed = JSON.parse(payload)
      const res = await fetch("https://coinrace.live/api/auto-signal/webhook", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(parsed),
      })
      const data = await res.json()
      if (data.ok) {
        setSendResult({ ok: true, msg: `포지션 생성 완료 — ID: ${data.id}` })
      } else if (data.skipped) {
        setSendResult({ ok: false, msg: `스킵됨: ${data.reason}` })
      } else {
        setSendResult({ ok: false, msg: data.error ?? "실패" })
      }
      setTimeout(() => fetchLogs(), 500)
    } catch (e: unknown) {
      setSendResult({ ok: false, msg: e instanceof Error ? e.message : "JSON 파싱 오류" })
    } finally { setSending(false) }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    })

  const okCount   = logs.filter(l => l.status === "ok").length
  const failCount = logs.filter(l => l.status !== "ok" && l.status !== "skipped").length
  const skipCount = logs.filter(l => l.status === "skipped").length

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: "rgba(255,255,255,0.85)", fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11 }}>

      {/* 상단 헤더 */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: "12px 20px" }} className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span style={{ fontSize: 12, fontWeight: 900, color: GOLD, letterSpacing: 3 }}>WEBHOOK MONITOR</span>
          {/* 카운터 요약 */}
          <div className="flex items-center gap-3" style={{ fontSize: 10 }}>
            <span><span style={{ color: UP, fontWeight: 700 }}>{okCount}</span> <span style={{ color: "rgba(255,255,255,0.3)" }}>ok</span></span>
            <span><span style={{ color: DOWN, fontWeight: 700 }}>{failCount}</span> <span style={{ color: "rgba(255,255,255,0.3)" }}>fail</span></span>
            <span><span style={{ color: WARN, fontWeight: 700 }}>{skipCount}</span> <span style={{ color: "rgba(255,255,255,0.3)" }}>skip</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {live && (
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
              refresh in {countdown}s
            </span>
          )}
          {/* LIVE 토글 */}
          <button
            onClick={() => setLive(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded"
            style={{
              background: live ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.05)",
              border:     `1px solid ${live ? "rgba(34,197,94,0.3)" : BORDER}`,
              fontSize: 10, fontWeight: 800,
              color: live ? UP : "rgba(255,255,255,0.4)", cursor: "pointer",
            }}>
            {live
              ? <><Wifi className="w-3 h-3" /> LIVE</>
              : <><WifiOff className="w-3 h-3" /> PAUSED</>}
          </button>
          <button
            onClick={() => fetchLogs()}
            style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "7px 10px", cursor: "pointer" }}>
            <RefreshCw className="w-3 h-3" style={{ color: GOLD }} />
          </button>
        </div>
      </div>

      <div className="flex gap-3 p-4" style={{ maxWidth: 1400, margin: "0 auto", alignItems: "flex-start" }}>

        {/* 왼쪽: 설정 + 테스트 */}
        <div className="flex flex-col gap-3" style={{ width: 320, flexShrink: 0 }}>

          {/* 엔드포인트 */}
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.3)", marginBottom: 8, letterSpacing: 2 }}>ENDPOINT</p>
            <div className="flex items-center gap-2" style={{ background: "rgba(0,0,0,0.4)", borderRadius: 8, padding: "8px 10px" }}>
              <span style={{ fontSize: 9, color: UP, flex: 1, wordBreak: "break-all", lineHeight: 1.6 }}>
                https://coinrace.live<br />/api/auto-signal/webhook
              </span>
              <button
                onClick={() => { navigator.clipboard.writeText("https://coinrace.live/api/auto-signal/webhook"); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                style={{ cursor: "pointer", flexShrink: 0, color: copied ? UP : "rgba(255,255,255,0.3)" }}>
                {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="mt-3 space-y-1">
              <p style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.25)", letterSpacing: 2, marginBottom: 6 }}>FLASK에서 보낼 때</p>
              {[
                ["Method",       "POST"],
                ["Content-Type", "application/json"],
                ["body.secret",  "tasko-internal"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center gap-2"
                  style={{ background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "4px 8px" }}>
                  <span style={{ fontSize: 9, color: GOLD, minWidth: 100 }}>{k}</span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 테스트 전송 */}
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.3)", marginBottom: 10, letterSpacing: 2 }}>TEST SEND</p>
            <textarea
              value={payload}
              onChange={e => { setPayload(e.target.value); setSendResult(null) }}
              rows={11}
              spellCheck={false}
              style={{
                width: "100%", background: "rgba(0,0,0,0.5)", border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: "8px 10px",
                fontSize: 9, color: "rgba(255,255,255,0.75)", lineHeight: 1.8,
                fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box",
              }}
            />
            <button
              onClick={sendTest}
              disabled={sending}
              className="flex items-center justify-center gap-2 w-full mt-2"
              style={{
                padding: "9px 0", borderRadius: 8, fontWeight: 800, fontSize: 10,
                cursor: sending ? "not-allowed" : "pointer",
                background: sending ? "rgba(212,175,55,0.06)" : "rgba(212,175,55,0.12)",
                border: `1px solid rgba(212,175,55,0.3)`, color: GOLD, letterSpacing: 1,
              }}>
              {sending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              {sending ? "SENDING..." : "SEND TEST"}
            </button>
            {sendResult && (
              <div className="flex items-start gap-2 mt-2"
                style={{
                  padding: "8px 10px", borderRadius: 8, fontSize: 9, lineHeight: 1.6,
                  background: sendResult.ok ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
                  border: `1px solid ${sendResult.ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                  color: sendResult.ok ? UP : DOWN,
                }}>
                {sendResult.ok
                  ? <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  : <XCircle    className="w-3 h-3 flex-shrink-0 mt-0.5" />}
                {sendResult.msg}
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽: 실시간 로그 */}
        <div style={{ flex: 1, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
          {/* 로그 헤더 */}
          <div className="flex items-center justify-between"
            style={{ padding: "10px 16px", borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 2 }}>
              REQUEST LOG
            </span>
            <div className="flex items-center gap-4" style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
              <span>총 {logs.length}건</span>
              {/* 컬럼 헤더 */}
            </div>
          </div>

          {/* 컬럼 헤더 */}
          <div className="grid" style={{
            gridTemplateColumns: "80px 1fr 1fr 80px 90px 24px",
            padding: "6px 16px",
            borderBottom: `1px solid rgba(212,175,55,0.06)`,
            fontSize: 8, fontWeight: 700, letterSpacing: 1,
            color: "rgba(255,255,255,0.2)",
          }}>
            <span>STATUS</span>
            <span>SYMBOL / SIGNAL</span>
            <span>TIME (KST)</span>
            <span>CODE</span>
            <span>IP</span>
            <span />
          </div>

          {/* 로그 목록 */}
          <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 160px)" }}>
            {loading && (
              <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.2)" }}>로딩 중...</div>
            )}
            {!loading && logs.length === 0 && (
              <div style={{ padding: 48, textAlign: "center" }}>
                <WifiOff className="w-10 h-10 mx-auto mb-4" style={{ color: "rgba(255,255,255,0.08)" }} />
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>수신된 요청이 없습니다</p>
                <p style={{ fontSize: 9, color: "rgba(255,255,255,0.12)", marginTop: 4 }}>
                  Flask에서 웹훅을 보내거나 왼쪽 TEST SEND 를 사용하세요
                </p>
              </div>
            )}
            {logs.map(log => {
              const isExpanded = expandedId === log.id
              const isNew      = newIds.has(log.id)
              const meta       = STATUS_META[log.status] ?? STATUS_META.error
              const { Icon }   = meta

              return (
                <div key={log.id}
                  style={{
                    borderBottom: `1px solid rgba(212,175,55,0.04)`,
                    transition: "background 0.6s",
                    background: isNew
                      ? `rgba(212,175,55,0.07)`
                      : log.status !== "ok" && log.status !== "skipped"
                        ? "rgba(239,68,68,0.03)"
                        : "transparent",
                  }}>
                  {/* 메인 행 */}
                  <div
                    className="grid items-center"
                    style={{
                      gridTemplateColumns: "80px 1fr 1fr 80px 90px 24px",
                      padding: "9px 16px", cursor: "pointer",
                    }}
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}>

                    {/* 상태 뱃지 */}
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3 h-3 flex-shrink-0" style={{ color: meta.color }} />
                      <span style={{ fontSize: 9, fontWeight: 800, color: meta.color }}>{meta.label}</span>
                    </div>

                    {/* 심볼 / 시그널 */}
                    <div>
                      {log.symbol
                        ? <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
                            {log.symbol.replace("USDT", "")}/USDT
                          </span>
                        : <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
                      {log.signal_type && (
                        <span style={{ marginLeft: 6, fontSize: 8, color: "rgba(212,175,55,0.5)" }}>
                          {log.signal_type}
                        </span>
                      )}
                      {log.error_msg && log.status !== "ok" && (
                        <span style={{ marginLeft: 6, fontSize: 8, color: DOWN }}>
                          {log.error_msg}
                        </span>
                      )}
                    </div>

                    {/* 시간 */}
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                      {fmt(log.received_at)}
                    </span>

                    {/* HTTP 코드 */}
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: log.status_code === 200 ? UP : log.status_code === 401 ? WARN : DOWN,
                    }}>
                      {log.status_code}
                    </span>

                    {/* IP */}
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.ip ?? "—"}
                    </span>

                    {/* 펼치기 아이콘 */}
                    <span style={{ color: "rgba(255,255,255,0.2)" }}>
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </span>
                  </div>

                  {/* 확장 패널: raw payload */}
                  {isExpanded && (
                    <div style={{ margin: "0 16px 12px", background: "rgba(0,0,0,0.55)", borderRadius: 8, border: `1px solid rgba(212,175,55,0.1)`, overflow: "hidden" }}>
                      <div className="flex items-center justify-between"
                        style={{ padding: "5px 10px", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.25)", letterSpacing: 1 }}>RAW PAYLOAD</span>
                        {log.body_raw && (
                          <button
                            onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(JSON.stringify(log.body_raw, null, 2)) }}
                            style={{ cursor: "pointer", color: "rgba(255,255,255,0.3)" }}>
                            <Copy className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <pre style={{
                        margin: 0, padding: "10px 12px",
                        fontSize: 9, lineHeight: 1.7,
                        color: "rgba(255,255,255,0.55)",
                        overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
                      }}>
                        {log.body_raw
                          ? JSON.stringify(log.body_raw, null, 2)
                          : "(payload not captured)"}
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
