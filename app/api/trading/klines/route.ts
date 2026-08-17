import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get("symbol") ?? "BTCUSDT").replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  const interval = (searchParams.get("interval") ?? "1m").replace(/[^A-Za-z0-9]/g, "")
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 100) || 100, 1), 500)

  try {
    const endpoints = [
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    ]
    for (const endpoint of endpoints) {
      const response = await fetch(endpoint, { cache: "no-store" })
      if (response.ok) return NextResponse.json(await response.json(), { headers: { "Cache-Control": "no-store" } })
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

    return NextResponse.json({ error: "시세 데이터를 불러오지 못했습니다." }, { status: 502 })
  } catch {
    return NextResponse.json({ error: "시세 서버에 연결할 수 없습니다." }, { status: 502 })
  }
}
