export const dynamic = "force-dynamic"
/**
 * POST /api/auto-signal/webhook
 * TradingView / Flask 등 외부 시그널에서 호출
 * 모든 요청(성공/실패)을 webhook_request_logs 테이블에 기록
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "tasko-internal"

async function logRequest(
  status: string,
  statusCode: number,
  payload: Record<string, unknown>,
  opts: { symbol?: string; signalType?: string; errorMsg?: string; ip?: string } = {}
) {
  try {
    await adminSupabase.from("webhook_request_logs").insert({
      status,
      status_code: statusCode,
      body_raw:    payload,       // DB 실제 컬럼명
      symbol:      opts.symbol    ?? null,
      signal_type: opts.signalType ?? null,
      error_msg:   opts.errorMsg  ?? null,
      ip:          opts.ip        ?? null,
      method:      "POST",
    })
  } catch (e) {
    console.error("[webhook] logRequest failed:", e)
  }
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown"

  let body: Record<string, string> = {}
  try {
    body = await req.json()
  } catch {
    await logRequest("error", 400, {}, { ip, errorMsg: "invalid json" })
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  // 인증 없음 — Flask/TradingView 호환 (공개 엔드포인트, payload 포맷으로 필터링)
  // secret 있으면 검증, 없으면 통과
  const headerSecret   = req.headers.get("x-internal-secret") ?? req.headers.get("x-webhook-secret")
  const bodySecret     = (body as Record<string, string>).secret
  const providedSecret = headerSecret ?? bodySecret
  if (providedSecret && providedSecret !== INTERNAL_SECRET) {
    await logRequest("auth_fail", 401, body, { ip, errorMsg: "wrong secret" })
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const {
    alert_type,
    signal_type,
    symbol,
    price,
    formatted_time_kst,
  } = body

  const type = signal_type ?? alert_type

  if (!type || !symbol || !price) {
    const msg = "missing required fields: signal_type, symbol, price"
    await logRequest("error", 400, body, { ip, symbol, signalType: type, errorMsg: msg })
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // UP3를 제외한 모든 신호는 자동매매2(역삼1 전용, 별도 기록)로 분기 — 기존 매매기록/통계에 영향 없음
  if (type !== "TRIPLE_COMBO_UP3") {
    return handleSignal2({ type, symbol, price, formatted_time_kst, ip, body, logRequest })
  }

  // 자동매매 전역 설정 + 시그널 규칙 + TVM 글로벌 설정 병렬 조회
  const [{ data: settings }, { data: rule }, { data: tradingGs }] = await Promise.all([
    adminSupabase.from("auto_signal_settings").select("size_usd, leverage, enabled").eq("id", 1).single(),
    adminSupabase.from("auto_signal_rules").select("direction, enabled, stop_loss_enabled, stop_loss_percent, take_profit_enabled, take_profit_percent").eq("signal_type", type).single(),
    adminSupabase.from("auto_trading_global_settings").select("webhook_url, enabled").eq("id", 1).single(),
  ])

  if (!settings?.enabled) {
    await logRequest("skipped", 200, body, { ip, symbol, signalType: type, errorMsg: "auto-signal disabled" })
    return NextResponse.json({ skipped: true, reason: "auto-signal disabled" })
  }

  // TVM 자동주문 비활성화 시 포지션 기록 자체를 하지 않음
  if (!tradingGs?.enabled) {
    await logRequest("skipped", 200, body, { ip, symbol, signalType: type, errorMsg: "자동주문 비활성화 (global settings enabled=false) — 포지션 미기록" })
    return NextResponse.json({ skipped: true, reason: "trading_disabled" })
  }

  // 규칙이 있으면 규칙 방향 사용, 없으면 이름에서 추론
  if (rule && !rule.enabled) {
    await logRequest("skipped", 200, body, { ip, symbol, signalType: type, errorMsg: "signal type disabled" })
    return NextResponse.json({ skipped: true, reason: "signal type disabled" })
  }
  const direction: string = rule?.direction ?? (type.toUpperCase().includes("DOWN") ? "short" : "long")

  // signal_time 파싱 KST → UTC
  // date_label은 반드시 KST 기준 날짜로 저장 (UTC로 하면 자정 전후 1일 어긋남)
  let signalTime: string
  let dateLabel: string
  try {
    const raw    = formatted_time_kst ?? new Date().toISOString()
    const kstStr = raw.replace(" ", "T")
    // KST 날짜 문자열에서 날짜 부분만 추출 (YYYY-MM-DD)
    dateLabel  = kstStr.slice(0, 10)
    // DB signal_time은 UTC ISO 문자열로 저장
    signalTime = new Date(kstStr + "+09:00").toISOString()
  } catch {
    signalTime = new Date().toISOString()
    // fallback: KST 기준 오늘 날짜
    dateLabel  = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }

  const cleanSymbol = symbol.replace(".P", "")

  // 반영(rebalance) 완료 체크 — 당일 rebalance 기록이 있으면 이미 하루 마감된 날
  // 반영 후에는 어떤 신호가 와도 새 포지션을 생성하지 않음
  const { data: todayRebalance } = await adminSupabase
    .from("auto_signal_rebalance")
    .select("id")
    .eq("date_label", dateLabel)
    .limit(1)
    .single()

  if (todayRebalance) {
    await logRequest("skipped", 200, body, {
      ip, symbol, signalType: type,
      errorMsg: `day already closed (rebalanced): ${dateLabel}`,
    })
    return NextResponse.json({ skipped: true, reason: "day_already_closed" })
  }

  // 코드 레벨 중복 체크 — 같은 날 같은 종목+방향이 이미 있으면 스킵
  const { data: existing } = await adminSupabase
    .from("auto_signal_positions")
    .select("id, signal_time")
    .eq("symbol",     cleanSymbol)
    .eq("direction",  direction)
    .eq("date_label", dateLabel)
    .maybeSingle()

  if (existing) {
    await logRequest("skipped", 200, body, {
      ip, symbol, signalType: type,
      errorMsg: `duplicate: ${cleanSymbol} ${direction} already exists for ${dateLabel} (id: ${existing.id})`,
    })
    return NextResponse.json({ skipped: true, reason: "duplicate_symbol_date", existing_id: existing.id })
  }

  // ── TVM 주문 전송 (포지션 저장 전) ───────────────────────────
  // TVM 전송에 성공한 경우에만 포지션을 DB에 저장
  if (!tradingGs?.webhook_url) {
    await logRequest("error", 500, body, { ip, symbol, signalType: type, errorMsg: "webhook_url 미설정" })
    return NextResponse.json({ error: "webhook_url 미설정" }, { status: 500 })
  }

  const { data: tradingAccounts } = await adminSupabase
    .from("auto_trading_accounts")
    .select("id, account_name, auth_token, leverage, base_amount, take_profit_enabled, take_profit_percent, stop_loss_enabled, stop_loss_percent")
    .eq("enabled", true)

  if (!tradingAccounts?.length) {
    await logRequest("error", 500, body, { ip, symbol, signalType: type, errorMsg: "활성화된 계정 없음" })
    return NextResponse.json({ error: "활성화된 계정 없음" }, { status: 500 })
  }

  // TVM 심볼 변환: BTCUSDT → BTC/USDT
  function toTvmSymbol(sym: string): string {
    const clean = sym.replace("BINANCE:", "").replace(".P", "")
    if (clean.endsWith("USDT")) return clean.slice(0, -4) + "/USDT"
    return clean
  }

  // TVM 구문 조립
  function buildTvm(params: {
    account: string; symbol: string; side: string
    amount: number; leverage: number
    tpPct?: number | null; slPct?: number | null; token: string
  }): string {
    const json: Record<string, unknown> = {
      exchange:    "binance-futures",
      account:     params.account,
      symbol:      params.symbol,
      type:        "market",
      side:        params.side,
      open_order:  "cancel",
      same_order:  "skip",
      leverage:    params.leverage,
      margin_type: "cross",
      amount:      params.amount,
      amount_type: "usdt",
      token:       params.token,
    }
    if (params.tpPct != null) json.tp_pct = params.tpPct
    if (params.slPct != null) json.sl_pct = params.slPct
    return `TVM:${JSON.stringify(json)}:MVT`
  }

  const tvmSymbol = toTvmSymbol(cleanSymbol)
  const side      = direction.toUpperCase() === "SHORT" ? "sell" : "buy"
  const webhookUrl = tradingGs.webhook_url

  // 모든 계정에 TVM 전송 — 결과 수집
  type TvmResult = { account: string; tvm: string; status: number; body: string; ok: boolean; errMsg: string | null }
  const tvmResults: TvmResult[] = await Promise.all(
    tradingAccounts.map(async (acc: Record<string, unknown>): Promise<TvmResult> => {
      const tvm = buildTvm({
        account:  acc.account_name as string,
        symbol:   tvmSymbol,
        side,
        amount:   Number(acc.base_amount),
        leverage: Number(acc.leverage),
        // TP와 SL은 방향과 무관하게 계정 설정을 각각 독립 적용
        tpPct:    acc.take_profit_enabled ? Number(acc.take_profit_percent) : null,
        slPct:    acc.stop_loss_enabled ? Number(acc.stop_loss_percent) : null,
        token:    acc.auth_token as string,
      })

      let resStatus = 0
      let resBody   = ""
      let orderOk   = false
      let errMsg: string | null = null

      try {
        const res = await fetch(webhookUrl, {
          method:  "POST",
          headers: { "Content-Type": "text/plain" },
          body:    tvm,
          signal:  AbortSignal.timeout(10000),
        })
        resStatus = res.status
        resBody   = await res.text()
        orderOk   = res.ok
      } catch (fetchErr) {
        errMsg  = (fetchErr as Error).message
        orderOk = false
      }

      return { account: acc.account_name as string, tvm, status: resStatus, body: resBody, ok: orderOk, errMsg }
    })
  )

  // 하나라도 성공한 계정이 있어야 포지션을 저장
  const anyOk = tvmResults.some(r => r.ok)
  if (!anyOk) {
    const errSummary = tvmResults.map(r => `${r.account}: ${r.errMsg ?? r.body.slice(0, 80)}`).join(" | ")
    await logRequest("error", 500, body, { ip, symbol, signalType: type, errorMsg: `TVM 전송 실패: ${errSummary}` })
    return NextResponse.json({ error: "TVM 전송 실패", detail: errSummary }, { status: 500 })
  }

  // ── TVM 성공 → 포지션 DB 저장 ─────────────────────────────────
  const { data, error } = await adminSupabase
    .from("auto_signal_positions")
    .insert({
      signal_type:  type,
      symbol:       cleanSymbol,
      direction,
      entry_price:  parseFloat(price),
      size_usd:     settings.size_usd,
      leverage:     settings.leverage,
      signal_time:  signalTime,
      date_label:   dateLabel,
      is_closed:    false,
      webhook_raw:  body,
    })
    .select("id")
    .single()

  if (error) {
    if (error.code === "23505") {
      await logRequest("skipped", 200, body, { ip, symbol, signalType: type, errorMsg: "duplicate (race)" })
      return NextResponse.json({ skipped: true, reason: "duplicate_race" })
    }
    await logRequest("error", 500, body, { ip, symbol, signalType: type, errorMsg: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // TVM 결과 로그 저장 (포지션 id 포함)
  await Promise.all(
    tvmResults.map(r =>
      adminSupabase.from("auto_trading_logs").insert({
        position_id:   data.id,
        symbol:        cleanSymbol,
        direction,
        account_name:  r.account,
        tvm_str:       r.tvm,
        tvm_status:    r.status || null,
        tvm_response:  r.body.slice(0, 500) || null,
        ok:            r.ok,
        error_msg:     r.errMsg,
      })
    )
  )

  await logRequest("ok", 200, body, { ip, symbol, signalType: type })

  return NextResponse.json({ ok: true, id: data.id })
}

// ─────────────────────────────────────────────────────────────
// 자동매매2 (역삼1 전용, UP3 제외 신호) — 완전히 분리된 기록/거래 경로
// 기존 auto_signal_positions/통계에는 절대 영향을 주지 않음
// ─────────────────────────────────────────────────────────────
function toTvmSymbol2(sym: string): string {
  const clean = sym.replace("BINANCE:", "").replace(".P", "")
  if (clean.endsWith("USDT")) return clean.slice(0, -4) + "/USDT"
  return clean
}

function buildTvm2(params: {
  account: string; symbol: string; side: string
  amount: number; leverage: number
  tpPct?: number | null; slPct?: number | null; token: string
}): string {
  const json: Record<string, unknown> = {
    exchange:    "binance-futures",
    account:     params.account,
    symbol:      params.symbol,
    type:        "market",
    side:        params.side,
    open_order:  "cancel",
    same_order:  "skip",
    leverage:    params.leverage,
    margin_type: "cross",
    amount:      params.amount,
    amount_type: "usdt",
    token:       params.token,
  }
  if (params.tpPct != null) json.tp_pct = params.tpPct
  if (params.slPct != null) json.sl_pct = params.slPct
  return `TVM:${JSON.stringify(json)}:MVT`
}

async function handleSignal2(args: {
  type: string
  symbol: string
  price: string
  formatted_time_kst?: string
  ip: string
  body: Record<string, unknown>
  logRequest: typeof logRequest
}) {
  const { type, symbol, price, formatted_time_kst, ip, body, logRequest } = args

  const [{ data: settings2 }, { data: rule2 }] = await Promise.all([
    adminSupabase.from("auto_signal2_settings").select("size_usd, leverage, enabled, real_order_enabled, stop_loss_pct").eq("id", 1).single(),
    adminSupabase.from("auto_signal_rules").select("direction, enabled, stop_loss_enabled, stop_loss_percent, take_profit_enabled, take_profit_percent").eq("signal_type", type).single(),
  ])

  if (!settings2?.enabled) {
    await logRequest("skipped", 200, body, { ip, symbol, signalType: type, errorMsg: "auto-signal2 disabled" })
    return NextResponse.json({ skipped: true, reason: "auto_signal2_disabled" })
  }

  // 방향은 신호 이름이 아니라 auto_signal_rules에 등록된 실제 방향을 따른다 (예: UP2, UP7은 SHORT)
  // 규칙이 없을 때만 이름 기반 추정으로 폴백
  const direction: string = rule2?.direction ?? (type.toUpperCase().includes("DOWN") ? "short" : "long")

  let signalTime: string
  let dateLabel: string
  try {
    const raw    = formatted_time_kst ?? new Date().toISOString()
    const kstStr = raw.replace(" ", "T")
    dateLabel  = kstStr.slice(0, 10)
    signalTime = new Date(kstStr + "+09:00").toISOString()
  } catch {
    signalTime = new Date().toISOString()
    dateLabel  = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }

  const cleanSymbol = symbol.replace(".P", "")

  // 중복 체크 — 같은 ��� 같은 종목+방향
  const { data: existing2 } = await adminSupabase
    .from("auto_signal2_positions")
    .select("id")
    .eq("symbol",     cleanSymbol)
    .eq("direction",  direction)
    .eq("date_label", dateLabel)
    .maybeSingle()

  if (existing2) {
    await logRequest("skipped", 200, body, {
      ip, symbol, signalType: type,
      errorMsg: `duplicate(signal2): ${cleanSymbol} ${direction} already exists for ${dateLabel} (id: ${existing2.id})`,
    })
    return NextResponse.json({ skipped: true, reason: "duplicate_symbol_date_signal2", existing_id: existing2.id })
  }

  let realOrderSent = false

  // 실주문 토글이 켜져 있을 때만 거래소(TVM)에 주문 전송
  if (settings2.real_order_enabled) {
    const { data: tradingGs } = await adminSupabase
      .from("auto_trading_global_settings")
      .select("webhook_url, enabled")
      .eq("id", 1)
      .single()

    if (tradingGs?.enabled && tradingGs?.webhook_url) {
      const { data: tradingAccounts } = await adminSupabase
        .from("auto_trading_accounts")
        .select("id, account_name, auth_token, leverage, base_amount, take_profit_enabled, take_profit_percent, stop_loss_enabled, stop_loss_percent")
        .eq("enabled", true)

      if (tradingAccounts?.length) {
        const tvmSymbol = toTvmSymbol2(cleanSymbol)
        const side      = direction.toUpperCase() === "SHORT" ? "sell" : "buy"
        const webhookUrl = tradingGs.webhook_url

        const tvmResults = await Promise.all(
          tradingAccounts.map(async (acc: Record<string, unknown>) => {
            const tvm = buildTvm2({
              account:  acc.account_name as string,
              symbol:   tvmSymbol,
              side,
              amount:   Number(settings2.size_usd ?? acc.base_amount),
              leverage: Number(settings2.leverage ?? acc.leverage),
              // TP와 SL은 방향과 무관하게 계정 설정을 각각 독립 적용
              tpPct:    acc.take_profit_enabled ? Number(acc.take_profit_percent) : null,
              slPct:    acc.stop_loss_enabled ? Number(acc.stop_loss_percent) : null,
              token:    acc.auth_token as string,
            })
            try {
              const res = await fetch(webhookUrl, {
                method:  "POST",
                headers: { "Content-Type": "text/plain" },
                body:    tvm,
                signal:  AbortSignal.timeout(10000),
              })
              return { ok: res.ok }
            } catch {
              return { ok: false }
            }
          })
        )
        realOrderSent = tvmResults.some(r => r.ok)
      }
    }
  }

  const { data: inserted2, error: err2 } = await adminSupabase
    .from("auto_signal2_positions")
    .insert({
      signal_type:  type,
      symbol:       cleanSymbol,
      direction,
      entry_price:  parseFloat(price),
      size_usd:     settings2.size_usd,
      leverage:     settings2.leverage,
      signal_time:  signalTime,
      date_label:   dateLabel,
      is_closed:    false,
      webhook_raw:  body,
      real_order:   realOrderSent,
    })
    .select("id")
    .single()

  if (err2) {
    if (err2.code === "23505") {
      await logRequest("skipped", 200, body, { ip, symbol, signalType: type, errorMsg: "duplicate(signal2, race)" })
      return NextResponse.json({ skipped: true, reason: "duplicate_race_signal2" })
    }
    await logRequest("error", 500, body, { ip, symbol, signalType: type, errorMsg: `signal2: ${err2.message}` })
    return NextResponse.json({ error: err2.message }, { status: 500 })
  }

  await logRequest("ok", 200, body, { ip, symbol, signalType: type, errorMsg: realOrderSent ? "signal2(real_order)" : "signal2(record_only)" })

  return NextResponse.json({ ok: true, id: inserted2.id, signal2: true, real_order: realOrderSent })
}
