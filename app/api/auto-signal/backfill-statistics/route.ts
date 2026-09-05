import "server-only"

import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { recordSignalStatisticsForPosition } from "@/lib/signal-statistics"

export const dynamic = "force-dynamic"

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "tasko-internal"

export async function POST(request: Request) {
  if (request.headers.get("x-internal-secret") !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { data: positions, error } = await adminSupabase
    .from("auto_signal_positions")
    .select("id,symbol,signal_type,entry_price,signal_time,webhook_raw")
    .is("signal_statistics_entry_id", null)
    .order("signal_time", { ascending: true })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let linked = 0
  const failures: Array<{ id: string; error: string }> = []
  for (const position of positions ?? []) {
    try {
      const entryId = await recordSignalStatisticsForPosition(position)
      if (entryId) {
        const { error: linkError } = await adminSupabase
          .from("auto_signal_positions")
          .update({ signal_statistics_entry_id: entryId })
          .eq("id", position.id)
        if (linkError) throw linkError
        linked += 1
      }
    } catch (backfillError) {
      failures.push({ id: position.id, error: backfillError instanceof Error ? backfillError.message : String(backfillError) })
    }
  }

  return NextResponse.json({ scanned: positions?.length ?? 0, linked, failures })
}
