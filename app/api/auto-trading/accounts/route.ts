export const dynamic = "force-dynamic"
/**
 * GET    /api/auto-trading/accounts        — 전체 계정 목록
 * POST   /api/auto-trading/accounts        — 계정 추가
 * PATCH  /api/auto-trading/accounts        — 계정 수정  (body: { id, ...fields })
 * DELETE /api/auto-trading/accounts        — 계정 삭제  (body: { id })
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

const MASTER_ROLES = ["master"]

async function checkMaster(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return { error: session.error, status: session.status }
  if (!MASTER_ROLES.includes(session.role ?? "")) return { error: "forbidden", status: 403 }
  return null
}

export async function GET(req: Request) {
  const deny = await checkMaster(req)
  if (deny) return NextResponse.json({ error: deny.error }, { status: deny.status })

  const { data, error } = await adminSupabase
    .from("auto_trading_accounts")
    .select("*")
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ accounts: data ?? [] })
}

export async function POST(req: Request) {
  const deny = await checkMaster(req)
  if (deny) return NextResponse.json({ error: deny.error }, { status: deny.status })

  const body = await req.json().catch(() => ({}))
  const { account_name, auth_token, leverage, base_amount, enabled,
          take_profit_enabled, take_profit_percent,
          stop_loss_enabled, stop_loss_percent, memo } = body

  if (!account_name?.trim() || !auth_token?.trim()) {
    return NextResponse.json({ error: "account_name, auth_token 필수" }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from("auto_trading_accounts")
    .insert({
      account_name:       account_name.trim(),
      auth_token:         auth_token.trim(),
      leverage:           Number(leverage ?? 20),
      base_amount:        Number(base_amount ?? 100),
      enabled:            enabled !== false,
      take_profit_enabled: !!take_profit_enabled,
      take_profit_percent: take_profit_percent != null ? Number(take_profit_percent) : null,
      stop_loss_enabled:  !!stop_loss_enabled,
      stop_loss_percent:  stop_loss_percent != null ? Number(stop_loss_percent) : null,
      memo:               memo ?? "",
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account: data })
}

export async function PATCH(req: Request) {
  const deny = await checkMaster(req)
  if (deny) return NextResponse.json({ error: deny.error }, { status: deny.status })

  const body = await req.json().catch(() => ({}))
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (fields.account_name       !== undefined) update.account_name       = fields.account_name.trim()
  if (fields.auth_token         !== undefined) update.auth_token         = fields.auth_token.trim()
  if (fields.leverage           !== undefined) update.leverage           = Number(fields.leverage)
  if (fields.base_amount        !== undefined) update.base_amount        = Number(fields.base_amount)
  if (fields.enabled            !== undefined) update.enabled            = Boolean(fields.enabled)
  if (fields.take_profit_enabled !== undefined) update.take_profit_enabled = Boolean(fields.take_profit_enabled)
  if (fields.take_profit_percent !== undefined) update.take_profit_percent = fields.take_profit_percent != null ? Number(fields.take_profit_percent) : null
  if (fields.stop_loss_enabled  !== undefined) update.stop_loss_enabled  = Boolean(fields.stop_loss_enabled)
  if (fields.stop_loss_percent  !== undefined) update.stop_loss_percent  = fields.stop_loss_percent != null ? Number(fields.stop_loss_percent) : null
  if (fields.memo               !== undefined) update.memo               = fields.memo

  const { data, error } = await adminSupabase
    .from("auto_trading_accounts")
    .update(update)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account: data })
}

export async function DELETE(req: Request) {
  const deny = await checkMaster(req)
  if (deny) return NextResponse.json({ error: deny.error }, { status: deny.status })

  const body = await req.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: "id 필수" }, { status: 400 })

  const { error } = await adminSupabase
    .from("auto_trading_accounts")
    .delete()
    .eq("id", body.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
