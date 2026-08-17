import { NextResponse } from "next/server"

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
    return NextResponse.json({ error: "시세 데이터를 불러오지 못했습니다." }, { status: 502 })
  } catch {
    return NextResponse.json({ error: "시세 서버에 연결할 수 없습니다." }, { status: 502 })
  }
}
