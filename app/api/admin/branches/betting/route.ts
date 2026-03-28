import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

async function getUserFromToken(token: string) {
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await anonClient.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

// PATCH /api/admin/branches/betting
// 마스터 관리자가 지점의 배팅 모드 + LP 설정을 변경
// 기존 branches 로직에 영향 없이 독립 엔드포인트로 분리
export async function PATCH(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "JWT token required" }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const authUser = await getUserFromToken(token)
  if (!authUser) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  const { data: requester } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", authUser.id)
    .single()

  if (!requester || !["master", "super_admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
  }

  const body = await req.json()
  const { branchId, bettingMode, lpEnabled, lpAmount, lpAmountBaccarat, lpAmountRace } = body

  if (!branchId) {
    return NextResponse.json({ error: "branchId required" }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (bettingMode !== undefined) {
    if (!["fixed", "pari"].includes(bettingMode)) {
      return NextResponse.json({ error: "bettingMode must be 'fixed' or 'pari'" }, { status: 400 })
    }
    updates.betting_mode = bettingMode
  }
  if (lpEnabled !== undefined) updates.lp_enabled = lpEnabled
  if (lpAmount !== undefined) {
    if (lpAmount < 0) return NextResponse.json({ error: "lpAmount must be >= 0" }, { status: 400 })
    updates.lp_amount = lpAmount
  }
  if (lpAmountBaccarat !== undefined) {
    if (lpAmountBaccarat < 0) return NextResponse.json({ error: "lpAmountBaccarat must be >= 0" }, { status: 400 })
    updates.lp_amount_baccarat = lpAmountBaccarat
  }
  if (lpAmountRace !== undefined) {
    if (lpAmountRace < 0) return NextResponse.json({ error: "lpAmountRace must be >= 0" }, { status: 400 })
    updates.lp_amount_race = lpAmountRace
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from("branches")
    .update(updates)
    .eq("id", branchId)
    .select("id, name, betting_mode, lp_enabled, lp_amount, lp_amount_baccarat, lp_amount_race")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ branch: data })
}
