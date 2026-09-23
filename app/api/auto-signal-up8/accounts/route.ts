export const dynamic = "force-dynamic"

import "server-only"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
const PUBLIC_FIELDS = "id, label, mode, exchange, account, enabled, created_at, updated_at"

async function requireMaster(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return { response: NextResponse.json({ error: session.error }, { status: session.status }) }
  if (session.role !== "master") return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  return { response: null }
}

function parseAccount(body: Record<string, unknown>, tokenRequired: boolean) {
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 50) : ""
  const mode = body.mode === "test" ? "test" : body.mode === "live" ? "live" : null
  const exchange = mode === "test" ? "kis-testnet" : mode === "live" ? "kis" : ""
  const account = typeof body.account === "string" ? body.account.replace(/\D/g, "") : ""
  const authToken = typeof body.auth_token === "string" ? body.auth_token.trim() : ""
  if (!mode) return { error: "계정 유형을 선택하세요." }
  if (!/^\d{8,16}$/.test(account)) return { error: "계좌번호는 8~16자리 숫자로 입력하세요." }
  if (tokenRequired && !authToken) return { error: "인증토큰을 입력하세요." }
  return { value: { label, mode, exchange, account, authToken, enabled: body.enabled !== false } }
}

export async function GET(req: Request) {
  const auth = await requireMaster(req)
  if (auth.response) return auth.response
  const { data, error } = await adminSupabase.from("auto_signal_up8_accounts").select(PUBLIC_FIELDS).order("created_at", { ascending: true })
  if (error) return NextResponse.json({ error: "계정 목록을 불러오지 못했습니다." }, { status: 500 })
  return NextResponse.json({ accounts: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireMaster(req)
  if (auth.response) return auth.response
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  const parsed = parseAccount(body as Record<string, unknown>, true)
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { label, mode, exchange, account, authToken, enabled } = parsed.value
  const { data, error } = await adminSupabase.from("auto_signal_up8_accounts").insert({ label, mode, exchange, account, auth_token: authToken, enabled }).select(PUBLIC_FIELDS).single()
  if (error?.code === "23505") return NextResponse.json({ error: "이미 등록된 거래소·계좌 조합입니다." }, { status: 409 })
  if (error) return NextResponse.json({ error: "계정을 추가하지 못했습니다." }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: Request) {
  const auth = await requireMaster(req)
  if (auth.response) return auth.response
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  if (Object.keys(body).every(key => ["id", "enabled"].includes(key)) && Object.prototype.hasOwnProperty.call(body, "enabled")) {
    if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "계정 상태가 올바르지 않습니다." }, { status: 400 })
    const { data, error } = await adminSupabase.from("auto_signal_up8_accounts").update({ enabled: body.enabled, updated_at: new Date().toISOString() }).eq("id", body.id).select(PUBLIC_FIELDS).single()
    if (error) return NextResponse.json({ error: "계정 상태를 변경하지 못했습니다." }, { status: 500 })
    return NextResponse.json(data)
  }
  const parsed = parseAccount(body as Record<string, unknown>, false)
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { label, mode, exchange, account, authToken, enabled } = parsed.value
  const update: Record<string, unknown> = { label, mode, exchange, account, enabled, updated_at: new Date().toISOString() }
  if (authToken) update.auth_token = authToken
  const { data, error } = await adminSupabase.from("auto_signal_up8_accounts").update(update).eq("id", body.id).select(PUBLIC_FIELDS).single()
  if (error?.code === "23505") return NextResponse.json({ error: "이미 등록된 거래소·계좌 조합입니다." }, { status: 409 })
  if (error) return NextResponse.json({ error: "계정을 수정하지 못했습니다." }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const auth = await requireMaster(req)
  if (auth.response) return auth.response
  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "계정 ID가 필요합니다." }, { status: 400 })
  const { error } = await adminSupabase.from("auto_signal_up8_accounts").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "계정을 삭제하지 못했습니다." }, { status: 500 })
  return NextResponse.json({ ok: true })
}
