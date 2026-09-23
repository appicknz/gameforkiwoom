export const dynamic = "force-dynamic"

import "server-only"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
const MASTER_ROLES = ["master"]
const PUBLIC_FIELDS = "id, amount, initial_seed, updated_at"

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
  return NextResponse.json(data ? { ...data, bal_pct: Number(data.amount), amount: undefined } : data)
}

export async function PATCH(req: Request) {
  const auth = await requireMaster(req)
  if (auth.response) return auth.response

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }

  const balPct = Number(body.bal_pct)
  if (!Number.isFinite(balPct) || balPct <= 0 || balPct > 100) {
    return NextResponse.json({ error: "총자산 주문 비율은 0 초과 100 이하의 퍼센트여야 합니다." }, { status: 400 })
  }
  const initialSeed = Number(body.initial_seed)
  if (!Number.isSafeInteger(initialSeed) || initialSeed < 100_000 || initialSeed > 10_000_000_000) {
    return NextResponse.json({ error: "자동매매3 기본 마진은 10만원 이상 100억원 이하의 정수로 입력하세요." }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from("auto_signal_up8_settings")
    .update({ amount: balPct, initial_seed: initialSeed, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select(PUBLIC_FIELDS)
    .single()

  if (error) return NextResponse.json({ error: "UP8 설정을 저장하지 못했습니다." }, { status: 500 })
  return NextResponse.json(data ? { ...data, bal_pct: Number(data.amount), amount: undefined } : data)
}
