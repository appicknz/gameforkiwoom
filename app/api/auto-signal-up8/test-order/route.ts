export const dynamic = "force-dynamic"

import "server-only"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any

function toUp8TvmSymbol(symbol: string): string | null {
  const clean = symbol
    .trim()
    .replace(/^(?:KRX|KOSPI|KOSDAQ):/i, "")
    .replace(/\/(?:KRX|KOSPI|KOSDAQ)$/i, "")
    .replace(/\.P$/i, "")
    .toUpperCase()

  return /^[A-Z0-9]+$/.test(clean) ? `${clean}/KOSDAQ` : null
}

export async function POST(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })
  if (session.role !== "master") return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const body = await req.json().catch(() => null)
  const symbol = typeof body?.symbol === "string" ? toUp8TvmSymbol(body.symbol) : null
  if (!symbol) {
    return NextResponse.json({ error: "올바른 국내주식 종목코드를 입력하세요." }, { status: 400 })
  }

  const [{ data: settings, error: settingsError }, { data: accounts, error: accountsError }, { data: globalSettings, error: globalError }] = await Promise.all([
    adminSupabase.from("auto_signal_up8_settings").select("amount").eq("id", 1).single(),
    adminSupabase.from("auto_signal_up8_accounts").select("id, mode, exchange, account, auth_token").eq("enabled", true),
    adminSupabase.from("auto_trading_global_settings").select("webhook_url").eq("id", 1).single(),
  ])

  if (settingsError || !settings || accountsError) {
    return NextResponse.json({ error: "UP8 설정을 불러오지 못했습니다." }, { status: 500 })
  }
  if (globalError || !globalSettings?.webhook_url) {
    return NextResponse.json({ error: "TVM Webhook URL이 설정되지 않았습니다." }, { status: 400 })
  }

  const balPct = Number(settings.amount)
  if (!Number.isFinite(balPct) || balPct <= 0 || balPct > 100) {
    return NextResponse.json({ error: "저장된 UP8 총자산 주문 비율이 올바르지 않습니다." }, { status: 500 })
  }

  if (!accounts?.length) {
    return NextResponse.json({ error: "활성화된 국내주식 계정이 없습니다." }, { status: 400 })
  }

  const results = await Promise.all(accounts.map(async (selectedOrder: Record<string, unknown>) => {
    const tvm = `TVM:${JSON.stringify({
      exchange: selectedOrder.exchange,
      account: selectedOrder.account,
      symbol,
      type: "market",
      side: "buy",
      bal_pct: balPct,
      equity: "y",
      same_order: "skip",
      token: selectedOrder.auth_token,
    })}:MVT`
    try {
      const response = await fetch(globalSettings.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: tvm,
        signal: AbortSignal.timeout(10000),
      })
      return { id: selectedOrder.id, mode: selectedOrder.mode, exchange: selectedOrder.exchange, account: selectedOrder.account, ok: response.ok, status: response.status }
    } catch (error) {
      return { id: selectedOrder.id, mode: selectedOrder.mode, exchange: selectedOrder.exchange, account: selectedOrder.account, ok: false, status: null, error: error instanceof Error ? error.message : "전송 오류" }
    }
  }))
  const ok = results.every((result: { ok: boolean }) => result.ok)
  return NextResponse.json({ ok, symbol, bal_pct: balPct, results }, { status: ok ? 200 : 502 })
}
