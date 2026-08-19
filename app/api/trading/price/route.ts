import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.toUpperCase()
  if (!symbol || !/^[A-Z0-9]{5,20}$/.test(symbol)) {
    return NextResponse.json({ error: "올바르지 않은 종목입니다." }, { status: 400 })
  }

  // 트레이딩 심볼은 USDT 무기한 선물이므로 현물 ticker fallback을 사용하지 않습니다.
  const endpoints = [
    `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`,
  ]
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(4000) })
      if (!response.ok) continue
      const data = await response.json()
      const price = Number(data?.price)
      if (Number.isFinite(price) && price > 0) return NextResponse.json({ price })
    } catch {}
  }
  return NextResponse.json({ error: "현재가를 불러오지 못했습니다." }, { status: 502 })
}
