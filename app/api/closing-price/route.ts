import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

/**
 * 30초봉 마감가 저장 API
 *
 * Railway WebSocket 서버 또는 클라이언트에서 30초봉이 확정될 때마다 호출합니다.
 * rounds 테이블에 마감가(result_price, result_digit, started_at, ended_at)를 저장합니다.
 * 같은 started_at 시간대에 이미 row가 있으면 중복 INSERT를 방지하기 위해 upsert를 사용합니다.
 *
 * POST body:
 *   price: number   - 30초봉 마감가
 *   time:  number   - 마감 유닉스 타임스탬프 (초)
 */
export async function POST(request: Request) {
  try {
    const { price, time } = await request.json()

    if (typeof price !== "number" || typeof time !== "number") {
      return NextResponse.json({ error: "Invalid price or time" }, { status: 400 })
    }

    const lastDigit = Math.floor(Math.abs(price * 100)) % 10

    // 30초봉: ended_at = time, started_at = time - 30
    const startedAt = new Date((time - 30) * 1000).toISOString()
    const endedAt   = new Date(time * 1000).toISOString()

    // ended_at 기준 중복 체크 — 이미 있으면 저장 스킵
    const { data: existing } = await adminSupabase
      .from("rounds")
      .select("id")
      .eq("ended_at", endedAt)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ success: true, skipped: true })
    }

    const { error } = await adminSupabase
      .from("rounds")
      .insert({
        result_price: price,
        result_digit: lastDigit,
        started_at: startedAt,
        ended_at: endedAt,
      })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[closing-price] save error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * 최근 마감가 목록 조회 (최근 100개)
 * 클라이언트가 새로고침 시 초기 데이터로 사용합니다.
 */
export async function GET() {
  try {
    const { data, error } = await adminSupabase
      .from("rounds")
      .select("result_price, result_digit, started_at, ended_at")
      .not("result_price", "is", null)
      .order("ended_at", { ascending: false })
      .limit(100)

    if (error) throw error

    // order("ended_at", { ascending: false }) 이므로 이미 최신순 — reverse 불필요
    const prices = (data ?? [])
      .filter((r) => r.result_price !== null)
      .map((r) => ({
        price: Number(r.result_price),
        time: Math.floor(new Date(r.ended_at!).getTime() / 1000),
      }))

    return NextResponse.json({ prices })
  } catch (err) {
    console.error("[closing-price] fetch error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
