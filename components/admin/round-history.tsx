"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronDown, ChevronRight, RefreshCw, Trophy, TrendingDown, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"

function getToken(): string | null {
  try { return localStorage.getItem("app_token") } catch { return null }
}

interface RoundRow {
  id: number
  game_type: string
  round_number: number
  result: string
  odds_player: number | null
  odds_banker: number | null
  odds_tie: number | null
  odds_bit: number | null
  odds_coin: number | null
  total_bet: number
  total_payout: number
  participant_count: number
  settled_at: string
}

interface Participant {
  id: number
  user_id: string
  username: string | null
  bet_side: string
  bet_amount: number
  applied_odds: number | null
  payout: number
  profit: number
  result: string
  settled_at: string
}

function fmt(n: number) {
  return "₩" + n.toLocaleString("ko-KR")
}

function ResultBadge({ result, gameType }: { result: string; gameType: string }) {
  const label =
    gameType === "baccarat"
      ? result === "player" ? "PLAYER" : result === "banker" ? "BANKER" : "TIE"
      : result === "bit" ? "BIT" : result === "coin" ? "COIN" : "TIE"

  const cls =
    result === "player" || result === "bit"
      ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
      : result === "banker" || result === "coin"
      ? "bg-red-500/15 text-red-400 border-red-500/30"
      : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"

  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  )
}

function ParticipantResultIcon({ result }: { result: string }) {
  if (result === "win")  return <Trophy className="w-3.5 h-3.5 text-emerald-400" />
  if (result === "lose") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />
  return <Minus className="w-3.5 h-3.5 text-yellow-400" />
}

function RoundRow({ row, gameType }: { row: RoundRow; gameType: string }) {
  const [open, setOpen] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(false)

  const loadParticipants = useCallback(async () => {
    if (participants.length > 0) { setOpen(o => !o); return }
    setLoading(true)
    const token = getToken(); if (!token) return
    const res = await fetch(
      `/api/admin/round-history?gameType=${gameType}&roundNumber=${row.round_number}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (res.ok) {
      const d = await res.json()
      setParticipants(d.participants ?? [])
    }
    setLoading(false)
    setOpen(true)
  }, [row.round_number, gameType, participants.length])

  const toggleOpen = () => {
    if (open) { setOpen(false); return }
    loadParticipants()
  }

  const profit = row.total_bet - row.total_payout
  const settledAt = new Date(row.settled_at).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* 라운드 헤더 */}
      <button
        onClick={toggleOpen}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
      >
        <span className="text-muted-foreground">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>

        <span className="text-xs text-muted-foreground font-mono w-20 shrink-0">
          #{row.round_number}
        </span>

        <ResultBadge result={row.result} gameType={gameType} />

        <span className="text-xs text-muted-foreground ml-auto hidden sm:block">{settledAt}</span>

        <div className="flex gap-4 text-xs shrink-0">
          <div className="text-right">
            <p className="text-muted-foreground text-[10px]">참여</p>
            <p className="font-medium">{row.participant_count}명</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-[10px]">총배팅</p>
            <p className="font-medium">{fmt(row.total_bet)}</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-[10px]">하우스</p>
            <p className={`font-semibold ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {profit >= 0 ? "+" : ""}{fmt(profit)}
            </p>
          </div>
        </div>
      </button>

      {/* 배당 정보 */}
      {open && (
        <div className="border-t border-border bg-muted/20">
          {/* odds row */}
          <div className="flex gap-4 px-4 py-2 text-xs border-b border-border/50">
            {gameType === "baccarat" ? (
              <>
                <span className="text-blue-400">PLAYER {row.odds_player?.toFixed(2) ?? "-"}x</span>
                <span className="text-red-400">BANKER {row.odds_banker?.toFixed(2) ?? "-"}x</span>
                <span className="text-yellow-400">TIE {row.odds_tie?.toFixed(2) ?? "-"}x</span>
              </>
            ) : (
              <>
                <span className="text-orange-400">BIT {row.odds_bit?.toFixed(2) ?? "-"}x</span>
                <span className="text-sky-400">COIN {row.odds_coin?.toFixed(2) ?? "-"}x</span>
                <span className="text-yellow-400">TIE {row.odds_tie?.toFixed(2) ?? "-"}x</span>
              </>
            )}
          </div>

          {/* 참여자 목록 */}
          {loading ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">로딩 중...</div>
          ) : participants.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">참여자 없음</div>
          ) : (
            <div className="divide-y divide-border/40">
              {participants.map((p) => {
                const sideLabel =
                  p.bet_side === "player" ? "PLAYER"
                  : p.bet_side === "banker" ? "BANKER"
                  : p.bet_side === "bit" ? "BIT"
                  : p.bet_side === "coin" ? "COIN"
                  : "TIE"
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                    <ParticipantResultIcon result={p.result} />
                    <span className="font-medium w-24 truncate">{p.username ?? p.user_id.slice(0, 8)}</span>
                    <span className="text-muted-foreground w-12">{sideLabel}</span>
                    <span className="text-muted-foreground">{fmt(p.bet_amount)}</span>
                    <span className="text-muted-foreground">×{p.applied_odds?.toFixed(2) ?? "-"}</span>
                    <span className={`ml-auto font-semibold ${p.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {p.profit >= 0 ? "+" : ""}{fmt(p.profit)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function RoundHistory() {
  const [gameType, setGameType] = useState<"baccarat" | "race">("baccarat")
  const [rounds, setRounds] = useState<RoundRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const LIMIT = 20

  const load = useCallback(async (gt: string, off: number) => {
    setLoading(true)
    const token = getToken(); if (!token) return
    const res = await fetch(
      `/api/admin/round-history?gameType=${gt}&limit=${LIMIT}&offset=${off}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (res.ok) {
      const d = await res.json()
      setRounds(d.rounds ?? [])
      setTotal(d.total ?? 0)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    setOffset(0)
    load(gameType, 0)
  }, [gameType, load])

  const switchType = (t: "baccarat" | "race") => {
    setGameType(t)
    setRounds([])
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-muted rounded-xl">
          {(["baccarat", "race"] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchType(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                gameType === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "baccarat" ? "바카라" : "레이스"}
            </button>
          ))}
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => load(gameType, offset)}
          disabled={loading}
          className="h-8 gap-1.5 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      {/* 총 라운드 수 */}
      <p className="text-xs text-muted-foreground">
        총 {total.toLocaleString()}개 라운드 기록됨
      </p>

      {/* 라운드 목록 */}
      {loading && rounds.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">로딩 중...</div>
      ) : rounds.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          아직 기록된 라운드가 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {rounds.map((r) => (
            <RoundRow key={r.id} row={r} gameType={gameType} />
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {total > LIMIT && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline" size="sm" className="h-8 text-xs"
            disabled={offset === 0 || loading}
            onClick={() => { const o = Math.max(0, offset - LIMIT); setOffset(o); load(gameType, o) }}
          >
            이전
          </Button>
          <span className="text-xs text-muted-foreground">
            {Math.floor(offset / LIMIT) + 1} / {Math.ceil(total / LIMIT)}
          </span>
          <Button
            variant="outline" size="sm" className="h-8 text-xs"
            disabled={offset + LIMIT >= total || loading}
            onClick={() => { const o = offset + LIMIT; setOffset(o); load(gameType, o) }}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  )
}
