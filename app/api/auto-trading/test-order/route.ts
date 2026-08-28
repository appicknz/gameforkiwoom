export const dynamic = "force-dynamic"
/**
 * POST /api/auto-trading/test-order
 * 특정 계정으로 테스트 주문 전송 (TVM 포맷)
 * body: {
 *   account_id: string     — DB의 account UUID
 *   symbol: string         — "BTCUSDT" 형식
 *   direction: "LONG"|"SHORT"
 *   action: "open"|"close" — 진입 or 청산
 * }
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

/** BTCUSDT → BTC/USDT */
function toTvmSymbol(symbol: string): string {
  const clean = symbol.replace("BINANCE:", "").replace(".P", "")
  if (clean.endsWith("USDT")) return clean.slice(0, -4) + "/USDT"
  return clean
}

/** TVM 주문 문자열 조립 */
function buildTvm(params: {
  account:    string
  symbol:     string      // TVM 포맷 (BTC/USDT)
  side:       string
  amount:     number
  leverage:   number
  tpPct?:     number | null
  slPct?:     number | null
  token:      string
  isClose:    boolean
}): string {
  const json: Record<string, unknown> = {
    exchange:     "binance-futures",
    account:      params.account,
    symbol:       params.symbol,
    type:         "market",
    side:         params.side,
    open_order:   "cancel",
    same_order:   "skip",
    leverage:     params.leverage,
    margin_type:  "cross",
    token:        params.token,
  }

  if (!params.isClose) {
    json.amount      = params.amount
    json.amount_type = "usdt"
    if (params.tpPct != null && Number.isFinite(params.tpPct) && params.tpPct > 0) {
      json.tp_pct = params.side === "buy" ? Math.abs(params.tpPct) : -Math.abs(params.tpPct)
    }
    if (params.slPct != null && Number.isFinite(params.slPct) && params.slPct > 0) {
      json.sl_pct = params.side === "buy" ? -Math.abs(params.slPct) : Math.abs(params.slPct)
    }
  }

  return `TVM:${JSON.stringify(json)}:MVT`
}

export async function POST(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })
  if (session.role !== "master") return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { account_id, symbol, direction, action } = body

  if (!account_id || !symbol || !direction || !action) {
    return NextResponse.json({ error: "account_id, symbol, direction, action 필수" }, { status: 400 })
  }

  // 계정 조회
  const { data: account, error: accErr } = await adminSupabase
    .from("auto_trading_accounts")
    .select("*")
    .eq("id", account_id)
    .single()

  if (accErr || !account) {
    return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 404 })
  }

  // 글로벌 설정 (webhook URL)
  const { data: gs } = await adminSupabase
    .from("auto_trading_global_settings")
    .select("webhook_url")
    .eq("id", 1)
    .single()

  const webhookUrl = gs?.webhook_url
  if (!webhookUrl) {
    return NextResponse.json({ error: "Webhook URL이 설정되지 않았습니다." }, { status: 400 })
  }

  const tvmSymbol = toTvmSymbol(symbol)
  const isClose   = action === "close"
  const dir       = direction.toUpperCase()

  // side 결정
  let side: string
  if (!isClose) {
    side = dir === "LONG" ? "buy" : "sell"
  } else {
    side = dir === "LONG" ? "buy_close" : "sell_close"
  }

  const tvm = buildTvm({
    account:  account.account_name,
    symbol:   tvmSymbol,
    side,
    amount:   Number(account.base_amount),
    leverage: Number(account.leverage),
    tpPct:    account.take_profit_enabled ? account.take_profit_percent : null,
    slPct:    account.stop_loss_enabled   ? account.stop_loss_percent   : null,
    token:    account.auth_token,
    isClose,
  })

  // TVM 전송
  let tvmStatus = 0
  let tvmBody   = ""
  let errMsg    = ""
  try {
    const tvmRes = await fetch(webhookUrl, {
      method:  "POST",
      headers: { "Content-Type": "text/plain" },
      body:    tvm,
    })
    tvmStatus = tvmRes.status
    tvmBody   = await tvmRes.text()
  } catch (e: unknown) {
    errMsg = e instanceof Error ? e.message : "TVM 전송 오류"
  }

  const isOk = tvmStatus >= 200 && tvmStatus < 300

  // 테스트 주문 로그 DB 저장
  if (!errMsg) {
    await adminSupabase.from("auto_trading_logs").insert({
      symbol:        tvmSymbol,
      direction:     direction.toUpperCase(),
      account_name:  account.account_name,
      tvm_str:       tvm,
      tvm_status:    tvmStatus || null,
      tvm_response:  tvmBody.slice(0, 500) || null,
      ok:            isOk,
      error_msg:     `[TEST_ORDER] ${isOk ? "success" : (tvmBody || "No response")}`,
      position_id:   null,
    })
  }

  return NextResponse.json({
    ok:      isOk,
    error:   errMsg || null,
    tvm_status:  tvmStatus,
    tvm_body:    tvmBody,
    tvm_str:     tvm,
    account:     account.account_name,
    symbol:      tvmSymbol,
    side,
    action,
  })
}
