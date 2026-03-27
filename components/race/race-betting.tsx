"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import type { RacePhase } from "./race-game"

const BIT_COLOR = "#3b82f6"
const COIN_COLOR = "#f97316"
const GOLD = "#d4af37"
const GOLD_DIM = "rgba(212,175,55,0.5)"
const GOLD_FAINT = "rgba(212,175,55,0.08)"
const GOLD_BORDER = "rgba(212,175,55,0.2)"

const CHIPS = [
  { label: "1만", value: 10_000 },
  { label: "5만", value: 50_000 },
  { label: "10만", value: 100_000 },
  { label: "50만", value: 500_000 },
  { label: "100만", value: 1_000_000 },
]

type BetSide = "bit" | "coin" | null

interface Props {
  phase: RacePhase
  roundId: number
  winner: "bit" | "coin" | "tie" | null
}

export function RaceBetting({ phase, roundId, winner }: Props) {
  const [balance, setBalance] = useState(0)
  const [betSide, setBetSide] = useState<BetSide>(null)
  const [betAmount, setBetAmount] = useState(0)
  const [chipAmount, setChipAmount] = useState(CHIPS[1].value)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [settled, setSettled] = useState(false)

  // 잔액 조회
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("app_token") : null
    if (!token) return
    fetch("/api/user/balance", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.balance != null) setBalance(d.balance) }).catch(() => {})
  }, [])

  // 라운드 변경 → 초기화
  useEffect(() => {
    setBetSide(null)
    setBetAmount(0)
    setSettled(false)
  }, [roundId])

  // 결과 정산
  useEffect(() => {
    if (phase !== "result" || !winner || settled || !betSide || betAmount === 0) return
    setSettled(true)

    const won = betSide === winner || winner === "tie"
    const profit = winner === "tie" ? 0 : won ? Math.floor(betAmount * 0.95) : -betAmount

    if (won && winner !== "tie") setWins(w => w + 1)
    else if (!won) setLosses(l => l + 1)

    const token = typeof window !== "undefined" ? localStorage.getItem("app_token") : null
    if (token && profit !== 0) {
      fetch("/api/bets/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: profit, gameType: "race", roundId }),
      }).catch(() => {})
    }
    setBalance(b => b + profit)
  }, [phase, winner, settled, betSide, betAmount, roundId])

  const handleBet = useCallback((side: BetSide) => {
    if (phase !== "betting") return
    if (betAmount + chipAmount > balance) return
    setBetSide(side)
    setBetAmount(a => a + chipAmount)
    setBalance(b => b - chipAmount)
  }, [phase, betAmount, chipAmount, balance])

  const handleReset = useCallback(() => {
    if (phase !== "betting") return
    setBalance(b => b + betAmount)
    setBetSide(null)
    setBetAmount(0)
  }, [phase, betAmount])

  const canBet = phase === "betting"

  return (
    <div style={{
      background: "rgba(5,13,10,0.95)",
      border: `1px solid ${GOLD_BORDER}`,
      borderRadius: 20,
      padding: "20px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 16,
    }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: GOLD_DIM, letterSpacing: "0.08em" }}>배팅</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>
          ₩{balance.toLocaleString()}
        </div>
      </div>

      {/* BIT / TIE / COIN 버튼 */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["bit", null, "coin"] as const).map((side, i) => {
          const isTie = side === null
          const label = isTie ? "TIE" : side === "bit" ? "BIT 팀" : "COIN 팀"
          const sub = isTie ? "8:1" : "0.95:1"
          const color = isTie ? GOLD : side === "bit" ? BIT_COLOR : COIN_COLOR
          const isSelected = isTie ? false : betSide === side
          const solidBg = isTie ? "rgba(212,175,55,0.15)" : side === "bit" ? "rgba(59,130,246,0.85)" : "rgba(249,115,22,0.85)"
          const dimBg = isTie ? "rgba(212,175,55,0.05)" : side === "bit" ? "rgba(59,130,246,0.08)" : "rgba(249,115,22,0.08)"
          const dimBorder = isTie ? "rgba(212,175,55,0.2)" : side === "bit" ? "rgba(59,130,246,0.25)" : "rgba(249,115,22,0.25)"

          return (
            <button
              key={i}
              onClick={() => side !== null && handleBet(side)}
              disabled={!canBet || isTie}
              style={{
                flex: isTie ? 0.7 : 1,
                height: 64,
                borderRadius: 12,
                border: `2px solid ${isSelected ? color : dimBorder}`,
                background: isSelected ? solidBg : dimBg,
                color: "#fff",
                cursor: canBet && !isTie ? "pointer" : "default",
                opacity: !canBet ? 0.5 : 1,
                transition: "all 0.2s",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? "#fff" : color }}>{label}</span>
              {betAmount > 0 && isSelected && (
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>₩{betAmount.toLocaleString()}</span>
              )}
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{sub}</span>
            </button>
          )
        })}
      </div>

      {/* 칩 선택 */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {CHIPS.map(c => (
          <button
            key={c.value}
            onClick={() => setChipAmount(c.value)}
            style={{
              flex: "1 0 auto",
              padding: "5px 8px",
              borderRadius: 8,
              border: `1px solid ${chipAmount === c.value ? GOLD : GOLD_BORDER}`,
              background: chipAmount === c.value ? "rgba(212,175,55,0.15)" : GOLD_FAINT,
              color: chipAmount === c.value ? GOLD : GOLD_DIM,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 취소 / 승패 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          onClick={handleReset}
          disabled={!canBet || betAmount === 0}
          style={{
            padding: "6px 16px",
            borderRadius: 8,
            border: `1px solid ${GOLD_BORDER}`,
            background: GOLD_FAINT,
            color: GOLD_DIM,
            fontSize: 11,
            cursor: canBet && betAmount > 0 ? "pointer" : "default",
            opacity: canBet && betAmount > 0 ? 1 : 0.4,
          }}
        >
          초기화
        </button>
        <span style={{ fontSize: 12, color: GOLD_DIM }}>
          <span style={{ color: "#10b981" }}>{wins}승</span>
          {" / "}
          <span style={{ color: "#ef4444" }}>{losses}패</span>
        </span>
      </div>
    </div>
  )
}
