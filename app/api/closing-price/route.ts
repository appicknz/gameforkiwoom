export const dynamic = "force-dynamic"
import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

/**
 * 30초봉 마감가 저장/조회 API
 * btc_closing_prices 테이블 사용 (time BIGINT UNIQUE, price NUMERIC)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { price, time, baccarat_result, b_score, p_score, b_raw_sum, p_raw_sum } = body

    if (typeof price !== "number" || typeof time !== "number") {
      return NextResponse.json({ error: "Invalid price or time" }, { status: 400 })
    }

    const hasScores = b_score !== undefined && p_score !== undefined

    if (hasScores) {
      // 점수 포함 upsert — 기존 행 있으면 점수만 업데이트
      await adminSupabase
        .from("btc_closing_prices")
        .upsert(
          { time, price, baccarat_result: baccarat_result ?? null, b_score, p_score, b_raw_sum: b_raw_sum ?? null, p_raw_sum: p_raw_sum ?? null },
          { onConflict: "time" }
        )
    } else {
      // 가격/시간만 먼저 저장 (점수는 나중에 upsert)
      await adminSupabase
        .from("btc_closing_prices")
        .upsert({ time, price }, { onConflict: "time", ignoreDuplicates: true })
    }

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
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 200)

    const { data, error } = await adminSupabase
      .from("btc_closing_prices")
      .select("time, price, baccarat_result, b_score, p_score, b_raw_sum, p_raw_sum")
      .order("time", { ascending: false })
      .limit(limit)

    if (error) throw error

    const prices = (data ?? [])
      .map((r) => ({
        price: Number(r.price),
        time: Number(r.time),
        baccaratResult: r.baccarat_result ?? null,
        bScore: r.b_score ?? null,
        pScore: r.p_score ?? null,
        bRawSum: r.b_raw_sum ?? null,
        pRawSum: r.p_raw_sum ?? null,
      }))
      .reverse() // 오래된 순으로 반환

    return NextResponse.json({ prices })
  } catch (err) {
    console.error("[closing-price] fetch error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
