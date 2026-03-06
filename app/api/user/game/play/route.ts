import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    // Authorization 헤더에서 access_token 추출
    const authHeader = request.headers.get("authorization")
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // admin Supabase로 user 식별
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: { user }, error: userError } = await adminSupabase.auth.admin.getUserById(token.split(":")[0] || token)
    
    // token으로 직접 user 확인 (더 안정적)
    const { data, error } = await adminSupabase.rpc("get_user_from_jwt", { jwt: token })
    
    if (error) {
      // JWT 파싱 실패 시 Authorization Bearer 토큰으로 직접 user 확인
      const { data: sessionData, error: sessionError } = await adminSupabase.auth.getUser(token)
      if (sessionError || !sessionData.user) {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 })
      }

      const userId = sessionData.user.id
      const { profit, newBalance } = await request.json()

      // balances 테이블 업데이트
      const { data: existing } = await adminSupabase
        .from("balances")
        .select("amount")
        .eq("user_id", userId)
        .single()

      if (existing) {
        await adminSupabase
          .from("balances")
          .update({ amount: newBalance })
          .eq("user_id", userId)
      } else {
        await adminSupabase.from("balances").insert({ user_id: userId, amount: newBalance })
      }

      return NextResponse.json({ success: true })
    }

    const userId = data.user_id
    const { profit, newBalance } = await request.json()

    // balances 테이블 업데이트
    const { data: existing } = await adminSupabase
      .from("balances")
      .select("amount")
      .eq("user_id", userId)
      .single()

    if (existing) {
      await adminSupabase
        .from("balances")
        .update({ amount: newBalance })
        .eq("user_id", userId)
    } else {
      await adminSupabase.from("balances").insert({ user_id: userId, amount: newBalance })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Game play error:", error)
    return NextResponse.json({ error: "Failed to save game result" }, { status: 500 })
  }
}
