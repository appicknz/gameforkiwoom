import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

export const runtime = "nodejs"

// GET: 현재 수수료 요율 조회 (모든 권한)
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await adminSupabase
    .from("commission_rates")
    .select("role, rate, updated_at")
    .order("id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rates: data ?? [] })
}

// PUT: 수수료 요율 수정 (마스터만)
export async function PUT(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase
    .from("profiles").select("role").eq("id", auth.userId).single()
  if (!me || me.role !== "master") {
    return NextResponse.json({ error: "마스터만 수수료 요율을 수정할 수 있습니다." }, { status: 403 })
  }

  const { rates } = await req.json()
  // rates: [{ role: "master", rate: 0.05 }, ...]

  if (!Array.isArray(rates) || rates.length === 0) {
    return NextResponse.json({ error: "rates 배열이 필요합니다." }, { status: 400 })
  }

  const validRoles = ["master", "super_admin", "branch_admin", "admin"]
  for (const r of rates) {
    if (!validRoles.includes(r.role)) {
      return NextResponse.json({ error: `유효하지 않은 역할: ${r.role}` }, { status: 400 })
    }
    if (typeof r.rate !== "number" || r.rate < 0 || r.rate > 1) {
      return NextResponse.json({ error: `요율은 0~100% 사이여야 합니다.` }, { status: 400 })
    }
  }

  // 전체 합이 100% 이하인지 검증
  const total = rates.reduce((s: number, r: any) => s + r.rate, 0)
  if (total > 1) {
    return NextResponse.json({ error: `수수료 합계(${(total * 100).toFixed(1)}%)가 100%를 초과합니다.` }, { status: 400 })
  }

  for (const r of rates) {
    const { error } = await adminSupabase
      .from("commission_rates")
      .update({ rate: r.rate, updated_at: new Date().toISOString(), updated_by: auth.userId })
      .eq("role", r.role)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, totalRate: total })
}
