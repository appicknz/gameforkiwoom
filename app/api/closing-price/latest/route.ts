import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

/**
 * 가장 최근 30초봉 마감가 1건 조회
 * 클라이언트가 rem===0 시점에 폴링해서 모든 기기가 동일한 마감가를 받아 3번째 카드로 사용
 */
export async function GET() {
  try {
    const { data, error } = await adminSupabase
      .from("rounds")
      .select("result_price, ended_at")
      .not("result_price", "is", null)
      .order("ended_at", { ascending: false })
      .limit(1)
      .single()

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
