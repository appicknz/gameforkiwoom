export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// PATCH: 주문 승인 또는 거절 (발행자 전용)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth   = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const { action, reject_reason } = await req.json()
  if (!["approved", "rejected"].includes(action)) {
    return NextResponse.json({ error: "유효하지 않은 액션입니다." }, { status: 400 })
  }

  // 해당 주문이 자신의 상품인지 확인
  const { data: order } = await adminSupabase
    .from("market_orders")
    .select("id, publisher_id, status, paid_at")
    .eq("id", id)
    .single()

  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 })
  if (order.publisher_id !== auth.userId) {
    // master도 처리 가능
    const { data: profile } = await adminSupabase
      .from("profiles").select("role").eq("id", auth.userId).single()
    if (profile?.role !== "master") {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
    }
  }
  if (!order.paid_at) {
    return NextResponse.json({ error: "아직 결제가 완료되지 않은 주문입니다." }, { status: 400 })
  }
  if (order.status !== "pending") {
    return NextResponse.json({ error: "이미 처리된 주문입니다." }, { status: 409 })
  }

  const update: Record<string, unknown> = { status: action }
  if (action === "approved") update.approved_at = new Date().toISOString()
  if (action === "rejected") {
    update.rejected_at  = new Date().toISOString()
    update.reject_reason = reject_reason ?? ""
  }

  const { data, error } = await adminSupabase
    .from("market_orders")
    .update(update)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: data })
}
