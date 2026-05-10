export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

// GET: 내 현금 잔고 + 현금 거래 이력
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase.from("profiles").select("role, username").eq("id", auth.userId).single()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ALLOWED = ["master", "super_admin", "branch_admin", "admin"]
  if (!ALLOWED.includes(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: cashBal } = await adminSupabase
    .from("cash_balances").select("amount").eq("user_id", auth.userId).single()

  const { data: myBal } = await adminSupabase
    .from("balances").select("amount").eq("user_id", auth.userId).single()

  // 현금 거래 이력 (내가 관여된 것)
  const { data: txns } = await adminSupabase
    .from("cash_transactions")
    .select(`
      id, cash_amount, point_amount, tx_type, memo, created_at,
      from_user:profiles!from_user_id(username, role),
      to_user:profiles!to_user_id(username, role)
    `)
    .or(`from_user_id.eq.${auth.userId},to_user_id.eq.${auth.userId}`)
    .order("created_at", { ascending: false })
    .limit(100)

  // master/super_admin이면 하위 역할들의 현금 잔고 요약도 제공
  let subBalances: any[] = []
  if (["master", "super_admin"].includes(me.role)) {
    const subRoles = me.role === "master"
      ? ["super_admin"]
      : ["branch_admin", "admin"]

    const { data: subProfiles } = await adminSupabase
      .from("profiles")
      .select("id, username, role")
      .in("role", subRoles)

    if (subProfiles && subProfiles.length > 0) {
      const subIds = subProfiles.map((p: any) => p.id)
      const { data: subCash } = await adminSupabase
        .from("cash_balances").select("user_id, amount").in("user_id", subIds)
      const { data: subPoints } = await adminSupabase
        .from("balances").select("user_id, amount").in("user_id", subIds)

      subBalances = subProfiles.map((p: any) => ({
        userId: p.id,
        username: p.username,
        role: p.role,
        cashAmount: subCash?.find((c: any) => c.user_id === p.id)?.amount ?? 0,
        pointAmount: subPoints?.find((b: any) => b.user_id === p.id)?.amount ?? 0,
      }))
    }
  }

  return NextResponse.json({
    cashBalance: cashBal?.amount ?? 0,
    pointBalance: myBal?.amount ?? 0,
    transactions: txns ?? [],
    subBalances,
  })
}

// POST: 수동 현금 조정 (master/super_admin만 — 특정 유저 현금 잔고 직접 조정)
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase.from("profiles").select("role").eq("id", auth.userId).single()
  if (!me || !["master", "super_admin"].includes(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { targetUserId, delta, memo, txType } = await req.json()
  if (!targetUserId || delta === undefined) {
    return NextResponse.json({ error: "targetUserId, delta 필요" }, { status: 400 })
  }

  const { data: existing } = await adminSupabase
    .from("cash_balances").select("amount").eq("user_id", targetUserId).single()
  const newAmt = (existing?.amount ?? 0) + delta
  if (newAmt < 0) return NextResponse.json({ error: "현금이 부족합니다." }, { status: 400 })

  if (existing) {
    await adminSupabase.from("cash_balances")
      .update({ amount: newAmt, updated_at: new Date().toISOString() }).eq("user_id", targetUserId)
  } else {
    await adminSupabase.from("cash_balances").insert({ user_id: targetUserId, amount: newAmt })
  }

  await adminSupabase.from("cash_transactions").insert({
    from_user_id: delta < 0 ? targetUserId : auth.userId,
    to_user_id: delta < 0 ? auth.userId : targetUserId,
    cash_amount: Math.abs(delta),
    point_amount: 0,
    tx_type: txType ?? (delta > 0 ? "manual_add" : "manual_sub"),
    memo: memo ?? null,
  })

  return NextResponse.json({ success: true, newAmount: newAmt })
}
