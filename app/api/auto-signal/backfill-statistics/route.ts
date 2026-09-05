import "server-only"

import { NextResponse } from "next/server"
import { adminSupabase as supabase } from "@/lib/supabase-admin"
import { recordSignalStatisticsBatch } from "@/lib/signal-statistics"

export const dynamic = "force-dynamic"
export const maxDuration = 55

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization")
  const internalSecret = request.headers.get("x-internal-secret")
  const requestUrl = new URL(request.url)
  const isLocalDevelopment = process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1"].includes(requestUrl.hostname)
  const allowed = isLocalDevelopment || authorization === `Bearer ${process.env.CRON_SECRET}` || internalSecret === process.env.INTERNAL_SECRET
  if (!allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let offset = 0
  let limit = 100
  try {
    const body = await request.json()
    offset = Math.max(0, Number.parseInt(String(body?.offset ?? 0), 10) || 0)
    limit = Math.min(250, Math.max(1, Number.parseInt(String(body?.limit ?? 100), 10) || 100))
  } catch {}

  const { data: logs, error } = await supabase
    .from("webhook_request_logs")
    .select("id,received_at,status,error_msg,body_raw")
    .neq("status", "auth_fail")
    .order("received_at", { ascending: true })
    .range(offset, offset + limit - 1)
  if (error) return NextResponse.json({ error: "Backfill source query failed" }, { status: 500 })

  try {
    const result = await recordSignalStatisticsBatch((logs ?? []).map((log) => ({
      webhookLogId: log.id,
      receivedAt: log.received_at,
      status: log.status,
      reason: log.error_msg,
      payload: log.body_raw && typeof log.body_raw === "object" ? log.body_raw : {},
    })))
    return NextResponse.json({
      ok: true,
      offset,
      scanned: logs?.length ?? 0,
      ...result,
      nextOffset: offset + (logs?.length ?? 0),
      hasMore: (logs?.length ?? 0) === limit,
    })
  } catch (backfillError) {
    console.error("[signal-statistics] batch backfill failed", backfillError)
    return NextResponse.json({ error: "Backfill batch failed" }, { status: 500 })
  }
}
