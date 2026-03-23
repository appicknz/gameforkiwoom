import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

/**
 * 30초봉 마감가 저장/조회 API
 * btc_closing_prices 테이블 사용 (time BIGINT UNIQUE, price NUMERIC)
 */
export async function POST(request: Request) {
  try {
    const { price, time } = await request.json()

    if (typeof price !== "number" || typeof time !== "number") {
      return NextResponse.json({ error: "Invalid price or time" }, { status: 400 })
    }

    // btc_closing_prices에 upsert (time UNIQUE → 중복 방지)
    await adminSupabase
      .from("btc_closing_prices")
      .upsert({ time, price }, { onConflict: "time", ignoreDuplicates: true })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[closing-price] save error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * 최근 마감가 목록 조회 (최근 100개, 오래된 순)
 * 클라이언트가 새로고침 시 초기 데이터로 사용합니다.
 */
export async function GET() {
  try {
    const { data, error } = await adminSupabase
      .from("btc_closing_prices")
      .select("time, price")
      .order("time", { ascending: false })
      .limit(100)

    if (error) throw error

    const prices = (data ?? [])
      .map((r) => ({ price: Number(r.price), time: Number(r.time) }))
      .reverse() // 오래된 순으로 반환

    return NextResponse.json({ prices })
  } catch (err) {
    console.error("[closing-price] fetch error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
