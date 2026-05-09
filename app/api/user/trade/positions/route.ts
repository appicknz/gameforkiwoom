import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

// Binance 현물 REST — 여러 엔드포인트 순차 시도
async function fetchBinancePrice(symbol: string): Promise<number> {
  const endpoints = [
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
    `https://api1.binance.com/api/v3/ticker/price?symbol=${symbol}`,
    `https://api2.binance.com/api/v3/ticker/price?symbol=${symbol}`,
    `https://api3.binance.com/api/v3/ticker/price?symbol=${symbol}`,
  ]
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(4000) })
      if (!res.ok) continue
      const data = await res.json()
      if (data?.price) return parseFloat(data.price)
    } catch { continue }
  }
  throw new Error(`Binance price fetch failed for ${symbol}`)
}

// 손익 계산 (서버사이드 전용)
function calcPnl(
  direction: "long" | "short",
  entryPrice: number,
  currentPrice: number,
  leverage: number,
  margin: number
): { pnl: number; pnlPct: number; liquidated: boolean } {
  if (!entryPrice || !currentPrice) return { pnl: 0, pnlPct: 0, liquidated: false }
  const priceDelta = direction === "long"
    ? (currentPrice - entryPrice) / entryPrice
    : (entryPrice - currentPrice) / entryPrice
  const pnlPct    = priceDelta * leverage * 100
  const pnl       = Math.round(margin * priceDelta * leverage)
  const liquidated = pnlPct <= -100
  return { pnl, pnlPct, liquidated }
}

// GET: 내 오픈 포지션 + 실시간 손익
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const { data: rows, error } = await adminSupabase
    .from("trade_positions")
    .select("*")
    .eq("user_id", auth.userId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows || rows.length === 0) return NextResponse.json({ positions: [] })

  const symbols = [...new Set(rows.map(r => r.symbol))]
  const prices: Record<string, number> = {}
  await Promise.all(
    symbols.map(async sym => {
      try { prices[sym] = await fetchBinancePrice(sym) }
      catch { prices[sym] = 0 }
    })
  )

  const positions = rows.map(row => {
    const cur = prices[row.symbol] ?? 0
    const { pnl, pnlPct, liquidated } = calcPnl(
      row.direction, Number(row.entry_price), cur, row.leverage, Number(row.margin)
    )
    return { ...row, current_price: cur, unrealized_pnl: pnl, unrealized_pnl_pct: pnlPct, liquidated }
  })

  return NextResponse.json({ positions })
}

// POST: 포지션 진입 — 서버에서 진입가 확정
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })
  const { userId } = auth

  const body = await req.json().catch(() => ({}))
  const { symbol, direction, leverage, amount: rawAmount } = body
  if (!symbol || !direction || !leverage || !rawAmount) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 })
  }
  const margin = Math.round(rawAmount)
  if (margin <= 0) return NextResponse.json({ error: "금액 오류" }, { status: 400 })

  // 서버에서 진입가 확정
  let entryPrice: number
  try {
    entryPrice = await fetchBinancePrice(symbol)
  } catch (e) {
    return NextResponse.json({ error: "가격 조회 실패. 잠시 후 다시 시도해주세요." }, { status: 503 })
  }

  // 잔고 차감
  const { data: newBalance, error: deductErr } = await adminSupabase
    .rpc("deduct_balance_for_bet", { p_user_id: userId, p_amount: margin })
  if (deductErr) {
    const isInsufficient = deductErr.message?.includes("INSUFFICIENT_BALANCE")
    return NextResponse.json(
      { error: isInsufficient ? "잔고가 부족합니다." : "잔고 차감 실패" },
      { status: isInsufficient ? 400 : 500 }
    )
  }

  const balBefore = (newBalance as number) + margin
  const { data: profile } = await adminSupabase
    .from("profiles").select("branch_id").eq("id", userId).single()

  await adminSupabase.from("balance_transactions").insert({
    user_id: userId,
    branch_id: profile?.branch_id ?? null,
    type: "bet",
    amount: -margin,
    balance_before: balBefore,
    balance_after: newBalance,
    note: `모의매매 진입 ${symbol} ${direction} ${leverage}x`,
  })

  const { data: position, error: posErr } = await adminSupabase
    .from("trade_positions")
    .insert({
      user_id: userId, symbol, direction, leverage,
      margin, position_size: margin * leverage,
      entry_price: entryPrice, status: "open",
      branch_id: profile?.branch_id ?? null,
    })
    .select().single()

  if (posErr) return NextResponse.json({ error: "포지션 저장 실패" }, { status: 500 })

  await Promise.all([
    redis.set(`balance:${userId}`, newBalance as number, { ex: 3600 }),
    redis.incr(`balance_version:${userId}`),
  ])

  return NextResponse.json({
    success: true,
    position: { ...position, current_price: entryPrice, unrealized_pnl: 0, unrealized_pnl_pct: 0 },
    newBalance,
  })
}

// DELETE: 포지션 청산 — 서버에서 청산가+손익 확정
export async function DELETE(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })
  const { userId } = auth

  const body = await req.json().catch(() => ({}))
  const { position_id } = body
  if (!position_id) return NextResponse.json({ error: "position_id 필요" }, { status: 400 })

  const { data: pos, error: fetchErr } = await adminSupabase
    .from("trade_positions")
    .select("*")
    .eq("id", position_id)
    .eq("user_id", userId)
    .eq("status", "open")
    .single()

  if (fetchErr || !pos) return NextResponse.json({ error: "포지션 없음" }, { status: 404 })

  let exitPrice: number
  try {
    exitPrice = await fetchBinancePrice(pos.symbol)
  } catch {
    return NextResponse.json({ error: "청산 가격 조회 실패. 잠시 후 다시 시도해주세요." }, { status: 503 })
  }

  const { pnl, pnlPct, liquidated } = calcPnl(
    pos.direction, Number(pos.entry_price), exitPrice, pos.leverage, Number(pos.margin)
  )
  const payout = liquidated ? 0 : Math.max(0, Math.round(Number(pos.margin) + pnl))

  await adminSupabase
    .from("trade_positions")
    .update({
      status: liquidated ? "liquidated" : "closed",
      exit_price: exitPrice, pnl, pnl_pct: pnlPct,
      closed_at: new Date().toISOString(),
    })
    .eq("id", position_id)

  let newBalance = 0
  if (payout > 0) {
    const { data: bal } = await adminSupabase
      .rpc("add_balance_for_payout", { p_user_id: userId, p_amount: payout })
    newBalance = bal as number
  } else {
    const cached = await redis.get(`balance:${userId}`)
    newBalance = cached !== null ? Number(cached) : 0
  }

  const { data: profile } = await adminSupabase
    .from("profiles").select("branch_id").eq("id", userId).single()
  const balBefore = Math.max(0, Math.round(newBalance - payout))

  await adminSupabase.from("balance_transactions").insert({
    user_id: userId,
    branch_id: profile?.branch_id ?? null,
    type: pnl >= 0 ? "win" : "lose",
    amount: payout,
    balance_before: balBefore,
    balance_after: newBalance,
    note: `모의매매 청산 ${pos.symbol} ${pos.direction} ${pos.leverage}x PnL:${pnl >= 0 ? "+" : ""}${pnl}`,
  })

  await adminSupabase.from("bet_history").insert({
    user_id: userId,
    branch_id: profile?.branch_id ?? null,
    round_id: null,
    bet_direction: pos.direction,
    bet_digit: `trade:${pos.symbol}:${pos.direction}:${pos.leverage}x`,
    bet_parity: null,
    bet_amount: Math.round(Number(pos.margin)),
    payout,
    result: pnl >= 0 ? "win" : "lose",
  }).catch(() => {})

  await Promise.all([
    redis.set(`balance:${userId}`, newBalance, { ex: 3600 }),
    redis.incr(`balance_version:${userId}`),
  ])

  return NextResponse.json({ success: true, exit_price: exitPrice, pnl, pnl_pct: pnlPct, payout, newBalance, liquidated })
}
