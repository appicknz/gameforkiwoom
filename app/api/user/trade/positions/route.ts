import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

// Binance에서 현재가 조회 (서버사이드 전용)
async function fetchBinancePrice(symbol: string): Promise<number> {
  // 현물 API 시도 → 실패 시 backup
  const urls = [
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
    `https://api1.binance.com/api/v3/ticker/price?symbol=${symbol}`,
    `https://api2.binance.com/api/v3/ticker/price?symbol=${symbol}`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) continue
      const data = await res.json()
      if (data.price) return parseFloat(data.price)
    } catch { continue }
  }
  throw new Error(`Binance price fetch failed: ${symbol}`)
}

// 손익 계산 (서버사이드 전용)
function calcPnl(
  direction: "long" | "short",
  entryPrice: number,
  currentPrice: number,
  leverage: number,
  margin: number    // 원화 마진
): { pnl: number; pnlPct: number; liquidated: boolean } {
  const priceDelta = direction === "long"
    ? (currentPrice - entryPrice) / entryPrice
    : (entryPrice - currentPrice) / entryPrice

  const pnlPct   = priceDelta * leverage * 100
  const pnl      = Math.round(margin * priceDelta * leverage)
  const liquidated = pnlPct <= -100  // 증거금 100% 손실

  return { pnl, pnlPct, liquidated }
}

// ──────────────────────────────────────────────
// GET: 내 오픈 포지션 목록 + 실시간 손익
// 현재가는 클라이언트가 쿼리파라미터로 전달: ?prices=INXUSDT:0.018488,BTCUSDT:80642
// 서버에서 Binance 조회 없음 — 가격 0이면 PnL만 0으로 반환하고 강제청산 안 함
// ──────────────────────────────────────────────
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  // 클라이언트가 보낸 실시간 가격 파싱
  const url    = new URL(req.url)
  const pricesParam = url.searchParams.get("prices") ?? ""
  const clientPrices: Record<string, number> = {}
  if (pricesParam) {
    pricesParam.split(",").forEach(part => {
      const [sym, val] = part.split(":")
      if (sym && val) clientPrices[sym] = parseFloat(val)
    })
  }

  const { data: rows, error } = await adminSupabase
    .from("trade_positions")
    .select("*")
    .eq("user_id", auth.userId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows || rows.length === 0) return NextResponse.json({ positions: [] })

  const positions = rows.map(row => {
    const cur = clientPrices[row.symbol] ?? 0

    // 가격이 없으면 PnL 0 반환 — 절대 강제청산 하지 않음
    if (!cur || cur <= 0) {
      return {
        ...row,
        current_price:      Number(row.entry_price),
        unrealized_pnl:     0,
        unrealized_pnl_pct: 0,
        liquidated:         false,
      }
    }

    const { pnl, pnlPct, liquidated } = calcPnl(
      row.direction, Number(row.entry_price), cur, row.leverage, Number(row.margin)
    )

    // 강제청산: pnlPct <= -100 이고 현재가가 실제로 있을 때만
    if (liquidated) {
      // fire-and-forget — 응답은 기다리지 않음
      adminSupabase.from("trade_positions").update({
        status: "liquidated", exit_price: cur,
        pnl: -Number(row.margin), pnl_pct: -100,
        closed_at: new Date().toISOString(),
      }).eq("id", row.id).then(() => {})

      return {
        ...row,
        current_price:      cur,
        unrealized_pnl:     -Number(row.margin),
        unrealized_pnl_pct: -100,
        liquidated:         true,
      }
    }

    return {
      ...row,
      current_price:      cur,
      unrealized_pnl:     pnl,
      unrealized_pnl_pct: pnlPct,
      liquidated:         false,
    }
  })

  return NextResponse.json({ positions })
}

// ──────────────────────────────────────────────
// POST: 포지션 진입 (서버에서 진입가 확정)
// ──────────────────────────────────────────────
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })
  const { userId } = auth

  const { symbol, direction, leverage, amount: rawAmount, current_price } = await req.json()
  if (!symbol || !direction || !leverage || !rawAmount) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 })
  }
  const margin = Math.round(rawAmount)
  if (margin <= 0) return NextResponse.json({ error: "금액 오류" }, { status: 400 })

  // 1) 진입가 확정 — 클라이언트 WebSocket 가격 우선, 없으면 Binance REST fallback
  let entryPrice: number = current_price ? parseFloat(String(current_price)) : 0
  if (!entryPrice || entryPrice <= 0) {
    try { entryPrice = await fetchBinancePrice(symbol) }
    catch { return NextResponse.json({ error: "가격 조회 실패" }, { status: 503 }) }
  }

  // 2) 잔고 차감 (atomic RPC)
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

  // 3) balance_transactions 기록
  await adminSupabase.from("balance_transactions").insert({
    user_id: userId,
    branch_id: profile?.branch_id ?? null,
    type: "bet",
    amount: -margin,
    balance_before: balBefore,
    balance_after: newBalance,
    note: `모의매매 진입 ${symbol} ${direction} ${leverage}x`,
  })

  // 4) trade_positions 저장
  const { data: position, error: posErr } = await adminSupabase
    .from("trade_positions")
    .insert({
      user_id:       userId,
      symbol,
      direction,
      leverage,
      margin,
      position_size: margin * leverage,
      entry_price:   entryPrice,
      status:        "open",
      branch_id:     profile?.branch_id ?? null,
    })
    .select()
    .single()

  if (posErr) return NextResponse.json({ error: "포지션 저장 실패" }, { status: 500 })

  // 5) Redis 잔고 업데이트
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

// ───────────────��──────────────────────────────
// DELETE: 포지션 청산 (서버에서 청산가 확정 + 손익 계산)
// ──────────────────────────────────────────────
export async function DELETE(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })
  const { userId } = auth

  const body = await req.json().catch(() => ({}))
  const { position_id, current_price: clientExitPrice } = body
  if (!position_id) return NextResponse.json({ error: "position_id 필요" }, { status: 400 })

  // 1) 본인 포지션 확인
  const { data: pos, error: fetchErr } = await adminSupabase
    .from("trade_positions")
    .select("*")
    .eq("id", position_id)
    .eq("user_id", userId)
    .eq("status", "open")
    .single()

  if (fetchErr || !pos) return NextResponse.json({ error: "포지션 없음" }, { status: 404 })

  // 2) 청산가 확정 — 클라이언트 WebSocket 가격 우선, 없으면 Binance REST fallback
  let exitPrice: number = clientExitPrice ? parseFloat(String(clientExitPrice)) : 0
  if (!exitPrice || exitPrice <= 0) {
    try { exitPrice = await fetchBinancePrice(pos.symbol) }
    catch { return NextResponse.json({ error: "청산 가격 조회 실패" }, { status: 503 }) }
  }

  // 3) 서버사이드 손익 계산
  const { pnl, pnlPct, liquidated } = calcPnl(
    pos.direction, Number(pos.entry_price), exitPrice, pos.leverage, Number(pos.margin)
  )

  // payout = 마진 + 손익 (최소 0, 청산 시 0)
  const payout = liquidated ? 0 : Math.max(0, Math.round(Number(pos.margin) + pnl))

  // 4) 포지션 상태 업데이트 (fire-and-forget)
  adminSupabase.from("trade_positions").update({
    status:     liquidated ? "liquidated" : "closed",
    exit_price: exitPrice,
    pnl,
    pnl_pct:    pnlPct,
    closed_at:  new Date().toISOString(),
  }).eq("id", position_id).then(() => {}).catch(() => {})

  // 5) 잔고 계산 — Redis에서 현재 잔고 읽고 payout 더하기
  const cachedBalance = await redis.get(`balance:${userId}`)
  let currentBalance: number
  if (cachedBalance !== null) {
    currentBalance = Number(cachedBalance)
  } else {
    // Redis 캐시 없으면 DB에서 조회
    const { data: prof } = await adminSupabase
      .from("profiles").select("balance").eq("id", userId).single()
    currentBalance = Number(prof?.balance ?? 0)
  }

  const newBalance = Math.max(0, currentBalance + payout)

  // Redis 즉시 갱신
  await Promise.all([
    redis.set(`balance:${userId}`, newBalance, { ex: 3600 }),
    redis.incr(`balance_version:${userId}`),
  ])

  // DB 잔고 + 기록은 fire-and-forget (응답 블로킹 안 함)
  ;(async () => {
    try {
      if (payout > 0) {
        await adminSupabase.rpc("add_balance_for_payout", { p_user_id: userId, p_amount: payout })
      }
      const { data: profile } = await adminSupabase
        .from("profiles").select("branch_id").eq("id", userId).single()
      await adminSupabase.from("balance_transactions").insert({
        user_id:        userId,
        branch_id:      profile?.branch_id ?? null,
        type:           pnl >= 0 ? "win" : "lose",
        amount:         payout,
        balance_before: currentBalance,
        balance_after:  newBalance,
        note:           `모의매매 청산 ${pos.symbol} ${pos.direction} ${pos.leverage}x PnL:${pnl >= 0 ? "+" : ""}${pnl}`,
      }).then(() => {}).catch(() => {})
      adminSupabase.from("bet_history").insert({
        user_id:       userId,
        branch_id:     profile?.branch_id ?? null,
        round_id:      null,
        bet_direction: pos.direction,
        bet_digit:     `trade:${pos.symbol}:${pos.direction}:${pos.leverage}x:${pos.entry_price}:${exitPrice}`,
        bet_parity:    null,
        bet_amount:    Math.round(Number(pos.margin)),
        payout,
        result:        pnl >= 0 ? "win" : "lose",
      }).then(() => {}).catch(() => {})
    } catch { /* 기록 실패 무시 */ }
  })()

  return NextResponse.json({
    success:    true,
    exit_price: exitPrice,
    pnl,
    pnl_pct:    pnlPct,
    payout,
    newBalance,
    liquidated,
  })
}
