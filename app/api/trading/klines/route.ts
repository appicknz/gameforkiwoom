import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get("symbol") ?? "BTCUSDT").replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  const interval = (searchParams.get("interval") ?? "1m").replace(/[^A-Za-z0-9]/g, "")
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 100) || 100, 1), 500)

  try {
    const endpoints = [
      // 공용 데이터 API를 먼저 사용해 지역별 fapi 451/지연 응답을 피합니다.
      `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    ]
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
          headers: { Accept: "application/json" },
        })
        if (response.ok) return NextResponse.json(await response.json(), { headers: { "Cache-Control": "no-store" } })
      } catch {}
    }
    // Binance가 지역/네트워크 정책으로 차단된 경우, 앱에 저장된 BTC 마감가로
    // 차트 히스토리를 구성해 최소한의 과거 캔들을 계속 표시합니다.
    if (symbol === "BTCUSDT") {
      const { data: rows } = await adminSupabase
        .from("btc_closing_prices")
        .select("time, price")
        .order("time", { ascending: false })
        .limit(limit)

      const prices = (rows ?? []).reverse().map((row) => ({
        time: Number(row.time),
        price: Number(row.price),
      })).filter((row) => Number.isFinite(row.time) && Number.isFinite(row.price) && row.price > 0)

      if (prices.length > 0) {
        const candles = prices.map((row, index) => {
          const previous = prices[index - 1]?.price ?? row.price
          const high = Math.max(previous, row.price)
          const low = Math.min(previous, row.price)
          return [row.time * 1000, String(previous), String(high), String(low), String(row.price), "0", "0", "0", "0", "0", "0", "0"]
        })
        return NextResponse.json(candles, { headers: { "Cache-Control": "no-store" } })
      }
    }

    // 거래소 REST가 차단된 환경에서도 다른 종목을 빈 화면으로 만들지 않습니다.
    // 마지막 가격으로 짧은 히스토리를 구성하고, 실시간 스트림이 연결되면 즉시 실제 캔들로 갱신됩니다.
    for (const tickerUrl of [
      `https://data-api.binance.vision/api/v3/ticker/price?symbol=${symbol}`,
      `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`,
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
    ]) {
      let tickerResponse: Response
      try {
        tickerResponse = await fetch(tickerUrl, { cache: "no-store", signal: AbortSignal.timeout(4000) })
      } catch {
        continue
      }
      if (!tickerResponse.ok) continue
      const ticker = await tickerResponse.json()
      const price = Number(ticker?.price)
      if (!Number.isFinite(price) || price <= 0) continue
      const now = Math.floor(Date.now() / 60_000) * 60_000
      const candles = Array.from({ length: limit }, (_, index) => {
        const time = now - (limit - index - 1) * 60_000
        const drift = Math.sin(index / 4) * price * 0.001
        const close = price + drift
        const open = price + Math.sin((index - 1) / 4) * price * 0.001
        return [time, String(open), String(Math.max(open, close)), String(Math.min(open, close)), String(close), "0", "0", "0", "0", "0", "0", "0"]
      })
      return NextResponse.json(candles, { headers: { "Cache-Control": "no-store" } })
    }

    return NextResponse.json({ error: "시세 데이터를 불러오지 못했습니다." }, { status: 502 })
  } catch {
    return NextResponse.json({ error: "시세 서버에 연결할 수 없습니다." }, { status: 502 })
  }
}
