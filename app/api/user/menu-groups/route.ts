export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// 로그인한 유저의 메뉴 그룹 활성화 여부 반환
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ group1: false, group2: true, group3: false })

  const { data } = await adminSupabase
    .from("profiles")
    .select("menu_group1, menu_group2, menu_group3")
    .eq("id", auth.userId)
    .single()

  return NextResponse.json({
    group1: data?.menu_group1 ?? false,
    group2: data?.menu_group2 ?? true,  // 기본값: 마켓(group2)만 활성화
    group3: data?.menu_group3 ?? false,
  })
}
