import "server-only"

import { NextResponse } from "next/server"
import { adminSupabase as supabase } from "@/lib/supabase-admin"
import { recordSignalStatistics } from "@/lib/signal-statistics"
import { processPendingSignalOutcomes } from "@/lib/signal-statistics-outcomes"

export const dynamic = "force-dynamic"
export const maxDuration = 55

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization")
  const internalSecret = request.headers.get("x-internal-secret")
  const allowed = authorization === `Bearer ${process.env.CRON_SECRET}` || internalSecret === process.env.INTERNAL_SECRET
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

  let inserted = 0
  let ignored = 0
  let failed = 0
  for (const log of logs ?? []) {
    try {
      const id = await recordSignalStatistics({
        webhookLogId: log.id,
        receivedAt: log.received_at,
        status: log.status,
        reason: log.error_msg,
        payload: log.body_raw && typeof log.body_raw === "object" ? log.body_raw : {},
      })
      if (id) inserted += 1
      else ignored += 1
    } catch (backfillError) {
      failed += 1
      console.error("[signal-statistics] backfill row failed", log.id, backfillError)
    }
  }

  const outcomes = await processPendingSignalOutcomes(80)
  return NextResponse.json({ ok: true, offset, scanned: logs?.length ?? 0, inserted, ignored, failed, nextOffset: offset + (logs?.length ?? 0), hasMore: (logs?.length ?? 0) === limit, outcomes })
}
