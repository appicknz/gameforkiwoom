export const dynamic = "force-dynamic"

import "server-only"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
const MASTER_ROLES = ["master"]
const PUBLIC_FIELDS = "id, test_enabled, live_enabled, amount, test_exchange, test_account, live_exchange, live_account, updated_at"

async function requireMaster(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) {
    return { response: NextResponse.json({ error: session.error }, { status: session.status }) }
  }
  if (!MASTER_ROLES.includes(session.role ?? "")) {
    return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }
  return { response: null }
}

export async function GET(req: Request) {
  const auth = await requireMaster(req)
  if (auth.response) return auth.response

  const { data, error } = await adminSupabase
    .from("auto_signal_up8_settings")
    .select(PUBLIC_FIELDS)
    .eq("id", 1)
    .single()

  if (error) return NextResponse.json({ error: "UP8 설정을 불러오지 못했습니다." }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request) {
  const auth = await requireMaster(req)
  if (auth.response) return auth.response

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }

  const amount = Number(body.amount)
  if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) {
    return NextResponse.json({ error: "주문 수량은 1~100000 사이의 정수여야 합니다." }, { status: 400 })
  }
  if (typeof body.test_enabled !== "boolean" || typeof body.live_enabled !== "boolean") {
    return NextResponse.json({ error: "전송 모드 값이 올바르지 않습니다." }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from("auto_signal_up8_settings")
    .update({
      test_enabled: body.test_enabled,
      live_enabled: body.live_enabled,
      amount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select(PUBLIC_FIELDS)
    .single()

  if (error) return NextResponse.json({ error: "UP8 설정을 저장하지 못했습니다." }, { status: 500 })
  return NextResponse.json(data)
}
