export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { adminSupabase } from "@/lib/supabase-admin"

// GET: 현재 사용자의 게임 접근 권한 확인
// 조건: game_enabled = true  OR  market_orders 구매 이력이 1건 이상
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ allowed: false })

  // master/admin 계열은 항상 허용
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role, game_enabled")
    .eq("id", auth.userId)
    .single()

  const ADMIN_ROLES = ["master", "super_admin", "branch_admin", "admin"]
  if (profile && ADMIN_ROLES.includes(profile.role)) {
    return NextResponse.json({ allowed: true, reason: "admin_role" })
  }

  // game_enabled 플래그 확인
  if (profile?.game_enabled) {
    return NextResponse.json({ allowed: true, reason: "game_enabled" })
  }

  // 구매 이력 확인 (market_orders 테이블에 1건 이상)
  const { count } = await adminSupabase
    .from("market_orders")
    .select("id", { count: "exact", head: true })
    .eq("buyer_id", auth.userId)

  if ((count ?? 0) > 0) {
    return NextResponse.json({ allowed: true, reason: "purchase_history" })
  }

  return NextResponse.json({ allowed: false })
}
