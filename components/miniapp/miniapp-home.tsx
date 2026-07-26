"use client"

import { useEffect, useState, useCallback } from "react"

const GOLD = "#d4af37"
const BG   = "#0d0d0d"
const CARD = "#141414"
const BORDER = "rgba(212,175,55,0.12)"

interface UserInfo {
  token: string
  username: string
  role: string
  telegramUser: {
    id: number
    first_name: string
    username?: string
    photo_url?: string
  }
}

interface BetRecord {
  id: string
  round_number: number
  game_type: string
  bet_side: string
  bet_amount: number
  applied_odds: number
  payout: number
  profit: number
  result: string
  settled_at: string
}

interface DepositRequest {
  id: string
  amount: number
  status: string
  created_at: string
  memo: string | null
}

type Tab = "home" | "history" | "deposit"

const SIDE_LABEL: Record<string, string> = {
  banker: "뱅커", player: "플레이어", tie: "타이",
  up: "UP", down: "DOWN",
}
const SIDE_COLOR: Record<string, string> = {
  banker: "#ef4444", player: "#3b82f6", tie: GOLD,
  up: "#22c55e", down: "#ef4444",
}
const RESULT_LABEL: Record<string, string> = {
  banker: "뱅커", player: "플레이어", tie: "타이",
  up: "UP", down: "DOWN",
  win: "승", loss: "패", push: "무",
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR")
}

// ── 상단 프로필 헤더 ───────────────────────────────────────────────
function ProfileHeader({ userInfo, balance }: { userInfo: UserInfo; balance: number | null }) {
  const tg = userInfo.telegramUser
  return (
    <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* 아바타 */}
        {tg.photo_url ? (
          <img src={tg.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: "50%", border: `2px solid ${GOLD}` }} />
        ) : (
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(212,175,55,0.15)",
            border: `2px solid ${GOLD}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, color: GOLD,
          }}>
            {tg.first_name.charAt(0).toUpperCase()}
          </div>
        )}

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{tg.first_name}</div>
          {tg.username && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>@{tg.username}</div>
          )}
        </div>

        {/* 잔고 */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 2 }}>잔고</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: GOLD, fontVariantNumeric: "tabular-nums" }}>
            {balance === null ? "—" : `${fmt(balance)}원`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 탭 바 ─────────────────────────────────────────────────────────
function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "home",    label: "홈" },
    { key: "history", label: "배팅기록" },
    { key: "deposit", label: "입금신청" },
  ]
  return (
    <div style={{
      display: "flex", borderBottom: `1px solid ${BORDER}`,
      background: CARD, position: "sticky", top: 0, zIndex: 10,
    }}>
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            flex: 1, padding: "12px 0", fontSize: 13, fontWeight: 600,
            background: "none", border: "none", cursor: "pointer",
            color: active === t.key ? GOLD : "rgba(255,255,255,0.45)",
            borderBottom: active === t.key ? `2px solid ${GOLD}` : "2px solid transparent",
            transition: "all 0.15s",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── 홈 탭 ─────────────────────────────────────────────────────────
function HomeTab({ balance, onRefresh }: { balance: number | null; onRefresh: () => void }) {
  return (
    <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 잔고 카드 */}
      <div style={{
        background: "linear-gradient(135deg, #1a1500 0%, #1e1a00 100%)",
        border: `1px solid ${BORDER}`,
        borderRadius: 16, padding: "20px",
      }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>현재 잔고</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: GOLD, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px" }}>
          {balance === null ? "로딩 중..." : `${fmt(balance)}원`}
        </div>
        <button
          onClick={onRefresh}
          style={{
            marginTop: 14, display: "flex", alignItems: "center", gap: 5,
            background: "rgba(212,175,55,0.08)", border: `1px solid ${BORDER}`,
            borderRadius: 8, padding: "6px 12px",
            color: GOLD, fontSize: 12, fontWeight: 500, cursor: "pointer",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="1 4 1 10 7 10" /><polyline points="23 20 23 14 17 14" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
          새로고침
        </button>
      </div>

      {/* 안내 카드 */}
      <div style={{
        background: CARD, border: `1px solid ${BORDER}`,
        borderRadius: 12, padding: "16px",
        fontSize: 13, color: "rgba(255,255,255,0.55)",
        lineHeight: 1.7,
      }}>
        <div style={{ color: GOLD, fontWeight: 600, marginBottom: 8, fontSize: 14 }}>이용 방법</div>
        <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
          <li>배팅 채널에서 뱅커/타이/플레이어 버튼으로 배팅</li>
          <li>라운드 종료 후 자동 정산 및 잔고 반영</li>
          <li>입금은 아래 &apos;입금신청&apos; 탭에서 요청</li>
          <li>배팅금액은 관리자가 설정합니다</li>
        </ul>
      </div>

      {/* 배당률 안내 */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px" }}>
        <div style={{ color: GOLD, fontWeight: 600, marginBottom: 12, fontSize: 14 }}>배당률</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "뱅커", odds: "1.95x", color: "#ef4444" },
            { label: "플레이어", odds: "1.95x", color: "#3b82f6" },
            { label: "타이", odds: "8.00x", color: GOLD },
          ].map(item => (
            <div key={item.label} style={{
              flex: 1, textAlign: "center",
              background: `${item.color}10`,
              border: `1px solid ${item.color}30`,
              borderRadius: 10, padding: "10px 4px",
            }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: item.color }}>{item.odds}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 배팅 기록 탭 ──────────────────────────────────────────────────
function HistoryTab({ token }: { token: string }) {
  const [records, setRecords] = useState<BetRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<{ total: number; wins: number; totalProfit: number } | null>(null)

  useEffect(() => {
    fetch("/api/miniapp/bet-history", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        setRecords(d.records ?? [])
        setStats(d.stats)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", border: `2px solid ${GOLD}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      </div>
    )
  }

  return (
    <div style={{ padding: "16px" }}>
      {/* 통계 */}
      {stats && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            { label: "총 배팅", value: `${stats.total}회` },
            { label: "승리", value: `${stats.wins}회` },
            { label: "손익", value: `${stats.totalProfit >= 0 ? "+" : ""}${fmt(stats.totalProfit)}원`, color: stats.totalProfit >= 0 ? "#22c55e" : "#ef4444" },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: "10px 8px", textAlign: "center",
            }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: s.color ?? "#fff" }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {records.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
          배팅 기록이 없습니다
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {records.map(r => {
            const won = r.profit > 0
            const push = r.profit === 0 && r.payout > 0
            return (
              <div key={r.id} style={{
                background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: 12, padding: "12px 14px",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                {/* 방향 배지 */}
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: `${SIDE_COLOR[r.bet_side] ?? "#666"}18`,
                  border: `1px solid ${SIDE_COLOR[r.bet_side] ?? "#666"}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 800, color: SIDE_COLOR[r.bet_side] ?? "#fff",
                }}>
                  {SIDE_LABEL[r.bet_side] ?? r.bet_side}
                </div>

                {/* 메인 정보 */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>Round {r.round_number}</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{r.game_type}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    {fmt(r.bet_amount)}원 × {r.applied_odds}x
                  </div>
                </div>

                {/* 손익 */}
                <div style={{ textAlign: "right" }}>
                  <div style={{
                    fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                    color: won ? "#22c55e" : push ? GOLD : "#ef4444",
                  }}>
                    {won ? "+" : push ? "" : "-"}{fmt(Math.abs(r.profit))}원
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                    {new Date(r.settled_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── 입금 신청 탭 ──────────────────────────────────────────────────
function DepositTab({ token }: { token: string }) {
  const [amount,   setAmount]   = useState("")
  const [memo,     setMemo]     = useState("")
  const [sending,  setSending]  = useState(false)
  const [result,   setResult]   = useState<{ ok: boolean; msg: string } | null>(null)
  const [history,  setHistory]  = useState<DepositRequest[]>([])
  const [histLoading, setHistLoading] = useState(true)

  const PRESET_AMOUNTS = [10000, 30000, 50000, 100000]

  const loadHistory = useCallback(async () => {
    setHistLoading(true)
    const res = await fetch("/api/miniapp/deposit-history", {
      headers: { Authorization: `Bearer ${token}` },
    })
    const d = await res.json()
    setHistory(d.requests ?? [])
    setHistLoading(false)
  }, [token])

  useEffect(() => { loadHistory() }, [loadHistory])

  const submit = async () => {
    const amt = parseInt(amount.replace(/,/g, ""), 10)
    if (isNaN(amt) || amt < 1000) {
      setResult({ ok: false, msg: "1,000원 이상 입력하세요." })
      return
    }
    setSending(true)
    setResult(null)
    try {
      const res = await fetch("/api/miniapp/deposit-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: amt, memo }),
      })
      const d = await res.json()
      if (res.ok) {
        setResult({ ok: true, msg: "입금 신청이 접수되었습니다. 관리자 확인 후 충전됩니다." })
        setAmount("")
        setMemo("")
        loadHistory()
      } else {
        setResult({ ok: false, msg: d.error ?? "신청 실패" })
      }
    } catch {
      setResult({ ok: false, msg: "네트워크 오류" })
    }
    setSending(false)
  }

  const STATUS_LABEL: Record<string, string> = {
    pending: "대기 중", approved: "승인됨", rejected: "거절됨",
  }
  const STATUS_COLOR: Record<string, string> = {
    pending: GOLD, approved: "#22c55e", rejected: "#ef4444",
  }

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 입금 신청 폼 */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px" }}>
        <div style={{ color: GOLD, fontWeight: 600, fontSize: 14, marginBottom: 14 }}>입금 신청</div>

        {/* 프리셋 금액 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {PRESET_AMOUNTS.map(p => (
            <button
              key={p}
              onClick={() => setAmount(String(p))}
              style={{
                flex: 1, padding: "7px 4px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                background: amount === String(p) ? `${GOLD}20` : "rgba(255,255,255,0.04)",
                border: `1px solid ${amount === String(p) ? GOLD : BORDER}`,
                color: amount === String(p) ? GOLD : "rgba(255,255,255,0.55)",
                cursor: "pointer",
              }}
            >
              {fmt(p)}
            </button>
          ))}
        </div>

        {/* 금액 직접 입력 */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            type="number"
            placeholder="금액 직접 입력 (원)"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: "10px 14px",
              color: "#fff", fontSize: 15, fontWeight: 600,
              outline: "none",
            }}
          />
        </div>

        {/* 메모 */}
        <input
          type="text"
          placeholder="메모 (선택)"
          value={memo}
          onChange={e => setMemo(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
            borderRadius: 10, padding: "10px 14px",
            color: "rgba(255,255,255,0.7)", fontSize: 13,
            outline: "none", marginBottom: 14,
          }}
        />

        {/* 결과 메시지 */}
        {result && (
          <div style={{
            padding: "10px 12px", borderRadius: 8, marginBottom: 12,
            background: result.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${result.ok ? "#22c55e30" : "#ef444430"}`,
            fontSize: 13, color: result.ok ? "#22c55e" : "#ef4444",
          }}>
            {result.msg}
          </div>
        )}

        <button
          onClick={submit}
          disabled={sending || !amount}
          style={{
            width: "100%", padding: "13px", borderRadius: 11,
            background: sending || !amount ? "rgba(212,175,55,0.2)" : GOLD,
            color: sending || !amount ? "rgba(212,175,55,0.5)" : "#000",
            fontSize: 15, fontWeight: 700, border: "none", cursor: sending || !amount ? "not-allowed" : "pointer",
            transition: "all 0.15s",
          }}
        >
          {sending ? "신청 중..." : "입금 신청"}
        </button>
      </div>

      {/* 입금 신청 내역 */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px" }}>
        <div style={{ color: GOLD, fontWeight: 600, fontSize: 14, marginBottom: 12 }}>신청 내역</div>
        {histLoading ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>로딩 중...</div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>신청 내역이 없습니다</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map(req => (
              <div key={req.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 12px",
                background: "rgba(255,255,255,0.03)", borderRadius: 9,
                border: `1px solid ${BORDER}`,
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{fmt(req.amount)}원</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                    {new Date(req.created_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {req.memo ? ` · ${req.memo}` : ""}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: STATUS_COLOR[req.status] ?? "rgba(255,255,255,0.5)",
                  background: `${STATUS_COLOR[req.status] ?? "#666"}15`,
                  border: `1px solid ${STATUS_COLOR[req.status] ?? "#666"}25`,
                  borderRadius: 6, padding: "3px 8px",
                }}>
                  {STATUS_LABEL[req.status] ?? req.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────
export function MiniAppHome({ userInfo }: { userInfo: UserInfo }) {
  const [tab,     setTab]     = useState<Tab>("home")
  const [balance, setBalance] = useState<number | null>(null)

  const fetchBalance = useCallback(async () => {
    const res = await fetch("/api/miniapp/balance", {
      headers: { Authorization: `Bearer ${userInfo.token}` },
    })
    const d = await res.json()
    if (typeof d.balance === "number") setBalance(d.balance)
  }, [userInfo.token])

  useEffect(() => { fetchBalance() }, [fetchBalance])

  return (
    <div style={{ background: BG, minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <ProfileHeader userInfo={userInfo} balance={balance} />
      <TabBar active={tab} onChange={setTab} />

      <div>
        {tab === "home"    && <HomeTab balance={balance} onRefresh={fetchBalance} />}
        {tab === "history" && <HistoryTab token={userInfo.token} />}
        {tab === "deposit" && <DepositTab token={userInfo.token} />}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
