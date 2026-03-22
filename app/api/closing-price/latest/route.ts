import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

/**
 * 가장 최근 30초봉 마감가 1건 조회
 * ?after=UNIX_TIMESTAMP 를 전달하면 그 시간 이후의 마감가만 반환
 * → 클라이언트가 rem===0 시점에 현재 라운드 시작 시간(after)을 넘겨서
 *   이전 라운드 값을 받지 않도록 보장
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const after = searchParams.get("after") // UNIX timestamp (초)

    let query = adminSupabase
      .from("rounds")
      .select("result_price, ended_at")
      .not("result_price", "is", null)
      .order("ended_at", { ascending: false })
      .limit(1)

    // after가 있으면 해당 시간 이후 마감된 라운드만 반환
    if (after) {
      const afterDate = new Date(Number(after) * 1000).toISOString()
      query = query.gte("ended_at", afterDate)
    }

    const { data, error } = await query.single()

    if (error || !data) {
      return NextResponse.json({ price: null, time: null })
    }

    return NextResponse.json({
      price: Number(data.result_price),
      time: Math.floor(new Date(data.ended_at!).getTime() / 1000),
    })
  } catch (err) {
    console.error("[closing-price/latest] error:", err)
    return NextResponse.json({ price: null, time: null })
  }
}
