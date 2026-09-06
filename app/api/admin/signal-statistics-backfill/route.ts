import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { enrichSignalPayload } from "@/lib/signal-enrichment"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const PAGE_SIZE = 500
const CONCURRENCY = 20

const admin = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

function authorized(request: NextRequest) {
  const provided = request.headers.get("x-internal-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const expected = [process.env.INTERNAL_SECRET, process.env.CRON_SECRET].filter(Boolean)
  const localApproval = process.env.NODE_ENV !== "production" && request.headers.get("x-v0-backfill") === "approved"
  return localApproval || (Boolean(provided) && expected.includes(provided))
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let processed = 0
  let updated = 0
  let failed = 0
  let from = 0

  while (true) {
    const { data: rows, error: selectError } = await admin
      .from("signal_statistics_entries")
      .select("id,webhook_log_id,received_at,signal_time,exchange,symbol,signal_type,direction,entry_price,duplicate_group_key,duplicate_index,processing_status,processing_reason,payload,risk_flags,created_at,auto_signal_position_id")
      .order("signal_time", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (selectError) throw selectError
    if (!rows?.length) break

    const updates: Array<Record<string, unknown>> = []
    for (let index = 0; index < rows.length; index += CONCURRENCY) {
      const batch = rows.slice(index, index + CONCURRENCY)
      const results = await Promise.all(batch.map(async (row) => {
        try {
          const payload = { ...(row.payload as Record<string, unknown>), symbol: (row.payload as Record<string, unknown>).symbol ?? row.symbol }
          const enrichment = await enrichSignalPayload(payload)
          return {
            ...row,
            volume_ratio_24h: enrichment.volume_ratio_24h,
            volume_24h_value: enrichment.volume_24h_value,
            trading_value: enrichment.trading_value,
            volume_ratio_source: enrichment.volume_ratio_source,
            fire_count: enrichment.fire_count,
            fire_volume_score: enrichment.fire_volume_score,
            fire_confluence_score: enrichment.fire_confluence_score,
            signal_state: enrichment.signal_state,
            trade_bias: enrichment.trade_bias,
            signal_score: enrichment.signal_score,
            signal_grade: enrichment.signal_grade,
            trade_guide: enrichment.trade_guide,
            risk_flags: enrichment.risk_flags,
            enrichment_version: enrichment.enrichment_version,
            enriched_at: new Date().toISOString(),
            enrichment_snapshot: enrichment,
            updated_at: new Date().toISOString(),
          }
        } catch {
          failed += 1
          return null
        }
      }))
      for (const result of results) {
        if (result) updates.push(result)
      }
    }

    if (updates.length) {
      const { error: updateError } = await admin
        .from("signal_statistics_entries")
        .upsert(updates, { onConflict: "id" })
      if (updateError) throw updateError
      updated += updates.length
    }

    processed += rows.length
    from += rows.length
    if (rows.length < PAGE_SIZE) break
  }

  return NextResponse.json({ processed, updated, failed })
}
