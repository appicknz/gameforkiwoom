export const dynamic = "force-dynamic"
import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

/**
 * 레이스 라운드 결과 저장/조회 API
 * race_results 테이블 사용
 */
export async function POST(request: Request) {
  try {
    const { time, price, bit_score, coin_score, winner } = await request.json()

    if (
      typeof time !== "number" ||
      typeof price !== "number" ||
      typeof bit_score !== "number" ||
      typeof coin_score !== "number" ||
      !["bit", "coin", "tie"].includes(winner)
    ) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 })
    }

    await adminSupabase
      .from("race_results")
      .upsert({ time, price, bit_score, coin_score, winner }, { onConflict: "time", ignoreDuplicates: true })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[race-results] save error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * 최근 라운드 결과 조회 (최근 20개)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100)

    // time % 180 = 0 인 것만 조회 — 3분 라운드 경계에 저장된 정상 데이터만
    const { data, error } = await adminSupabase
      .from("race_results")
      .select("time, price, bit_score, coin_score, winner")
      .order("time", { ascending: false })
      .limit(limit * 5)  // 넉넉하게 가져와서 클라이언트에서 필터

    if (error) throw error

    const results = (data ?? [])
      .filter((r) => Number(r.time) % 180 === 0)  // 3분 라운드 경계만
      .slice(0, limit)
      .map((r) => ({
        time: Number(r.time),
        price: Number(r.price),
        bit: Number(r.bit_score),
        coin: Number(r.coin_score),
        winner: r.winner as "bit" | "coin" | "tie",
      }))

    return NextResponse.json({ results })
  } catch (err) {
    console.error("[race-results] fetch error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
