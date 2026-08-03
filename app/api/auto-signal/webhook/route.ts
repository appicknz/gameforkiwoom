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

  // 자동매매 전역 설정 + 시그널 규칙 병렬 조회
  const [{ data: settings }, { data: rule }] = await Promise.all([
    adminSupabase.from("auto_signal_settings").select("size_usd, leverage, enabled").eq("id", 1).single(),
    adminSupabase.from("auto_signal_rules").select("direction, enabled").eq("signal_type", type).single(),
  ])

  if (!settings?.enabled) {
    await logRequest("skipped", 200, body, { ip, symbol, signalType: type, errorMsg: "auto-signal disabled" })
    return NextResponse.json({ skipped: true, reason: "auto-signal disabled" })
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

  // 23505 = unique constraint violation (race condition 대비)
  if (error) {
    if (error.code === "23505") {
      await logRequest("skipped", 200, body, { ip, symbol, signalType: type, errorMsg: "duplicate (race)" })
      return NextResponse.json({ skipped: true, reason: "duplicate_race" })
    }
    await logRequest("error", 500, body, { ip, symbol, signalType: type, errorMsg: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logRequest("ok", 200, body, { ip, symbol, signalType: type })

  // ── 자동주문 전송 ──────────────────────────────────────────────
  // 포지션 저장 성공 후, 자동주문이 활성화된 경우 TVM 주문 전송
  // 실패해도 웹훅 응답에는 영향 없음 (fire-and-forget with logging)
  ;(async () => {
    try {
      const [{ data: tradingGs }, { data: tradingAccounts }] = await Promise.all([
        adminSupabase
          .from("auto_trading_global_settings")
          .select("webhook_url, enabled")
          .eq("id", 1)
          .single(),
        adminSupabase
          .from("auto_trading_accounts")
          .select("id, account_name, auth_token, leverage, base_amount, take_profit_enabled, take_profit_percent, stop_loss_enabled, stop_loss_percent")
          .eq("enabled", true),
      ])

      // 자동주문 비활성화 또는 URL 없음 → 로그 기록 후 종료
      if (!tradingGs?.enabled || !tradingGs?.webhook_url) {
        await adminSupabase.from("auto_trading_logs").insert({
          position_id:   data.id,
          symbol:        cleanSymbol,
          direction,
          account_name:  null,
          tvm_str:       null,
          tvm_status:    null,
          tvm_response:  null,
          ok:            false,
          error_msg:     !tradingGs?.enabled
            ? "자동주문 비활성화 (global settings enabled=false)"
            : "webhook_url 미설정",
        })
        return
      }
      if (!tradingAccounts?.length) {
        await adminSupabase.from("auto_trading_logs").insert({
          position_id:   data.id,
          symbol:        cleanSymbol,
          direction,
          account_name:  null,
          tvm_str:       null,
          tvm_status:    null,
          tvm_response:  null,
          ok:            false,
          error_msg:     "활성화된 계정 없음",
        })
        return
      }

      const webhookUrl = tradingGs.webhook_url

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

      // 활성화된 계정 전체에 주문 전송
      const results = await Promise.allSettled(
        tradingAccounts.map(async (acc: Record<string, unknown>) => {
          const tvm = buildTvm({
            account:  acc.account_name as string,
            symbol:   tvmSymbol,
            side,
            amount:   Number(acc.base_amount),
            leverage: Number(acc.leverage),
            tpPct:    acc.take_profit_enabled ? (acc.take_profit_percent as number) : null,
            slPct:    acc.stop_loss_enabled   ? (acc.stop_loss_percent   as number) : null,
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

          // DB 로그 저장
          await adminSupabase.from("auto_trading_logs").insert({
            position_id:   data.id,
            symbol:        cleanSymbol,
            direction,
            account_name:  acc.account_name,
            tvm_str:       tvm,
            tvm_status:    resStatus || null,
            tvm_response:  resBody.slice(0, 500) || null,
            ok:            orderOk,
            error_msg:     errMsg,
          })

          console.log(`[auto-trading] ${acc.account_name} → ${resStatus} ${resBody.slice(0, 80)}`)
          return { account: acc.account_name, status: resStatus, ok: orderOk }
        })
      )

      const summary = results.map(r => r.status === "fulfilled" ? r.value : { error: (r.reason as Error)?.message })
      console.log(`[auto-trading] ${cleanSymbol} ${direction} 주문 전송 완료:`, JSON.stringify(summary))
    } catch (e) {
      console.error("[auto-trading] 자동주문 전송 중 오류:", e)
    }
  })()
  // ─────────────────────────────────────────────────────────────

  return NextResponse.json({ ok: true, id: data.id })
}
