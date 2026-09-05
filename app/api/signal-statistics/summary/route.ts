import "server-only"

import { NextResponse } from "next/server"
import { adminSupabase as supabase } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

const HORIZONS = new Set([5, 15, 30, 60, 240])
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const median = (values: number[]) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const horizon = HORIZONS.has(Number(params.get("horizon"))) ? Number(params.get("horizon")) : 30
  const direction = params.get("direction")
  const queryText = (params.get("q") ?? "").trim().toUpperCase().slice(0, 30)

  let query = supabase
    .from("signal_statistics_entries")
    .select("id,signal_time,symbol,signal_type,direction,cci,confluence,bb_position,bb_trend,duplicate_index,signal_statistics_outcomes!inner(horizon_minutes,directional_return_percent,result,status,calculated_at)")
    .eq("signal_statistics_outcomes.horizon_minutes", horizon)
    .order("signal_time", { ascending: false })
    .limit(5000)
  if (direction === "long" || direction === "short") query = query.eq("direction", direction)
  if (queryText) query = query.ilike("symbol", `%${queryText}%`)
  if (params.get("from")) query = query.gte("signal_time", `${params.get("from")}T00:00:00+09:00`)
  if (params.get("to")) query = query.lte("signal_time", `${params.get("to")}T23:59:59+09:00`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: "요약 통계를 불러오지 못했습니다." }, { status: 500 })

  const rows = (data ?? []).map((entry) => ({ ...entry, outcome: Array.isArray(entry.signal_statistics_outcomes) ? entry.signal_statistics_outcomes[0] : entry.signal_statistics_outcomes }))
  const completed = rows.filter((row) => row.outcome?.status === "complete" && row.outcome.directional_return_percent != null)
  const returns = completed.map((row) => Number(row.outcome.directional_return_percent))
  const wins = completed.filter((row) => row.outcome.result === "win").length
  const losses = completed.filter((row) => row.outcome.result === "loss").length
  const flats = completed.filter((row) => row.outcome.result === "flat").length

  const cciBucket = (cci: number | null) => cci == null ? "CCI 없음" : cci <= -100 ? "≤ -100" : cci < 0 ? "-100 ~ 0" : cci < 100 ? "0 ~ 100" : "≥ 100"
  const breakdown = (selector: (row: typeof rows[number]) => string) => {
    const groups = new Map<string, typeof completed>()
    for (const row of completed) {
      const key = selector(row) || "미분류"
      groups.set(key, [...(groups.get(key) ?? []), row])
    }
    return [...groups.entries()].map(([label, group]) => {
      const values = group.map((row) => Number(row.outcome.directional_return_percent))
      const groupWins = group.filter((row) => row.outcome.result === "win").length
      return { label, samples: group.length, winRate: group.length ? groupWins / group.length * 100 : 0, averageReturn: average(values), medianReturn: median(values) }
    }).sort((a, b) => b.samples - a.samples)
  }

  return NextResponse.json({
    horizon,
    total: rows.length,
    complete: completed.length,
    completionRate: rows.length ? completed.length / rows.length * 100 : 0,
    wins,
    losses,
    flats,
    winRate: completed.length ? wins / completed.length * 100 : 0,
    averageReturn: average(returns),
    medianReturn: median(returns),
    oldestSignalAt: rows.at(-1)?.signal_time ?? null,
    newestSignalAt: rows[0]?.signal_time ?? null,
    lastCalculatedAt: completed.map((row) => row.outcome.calculated_at).filter(Boolean).sort().at(-1) ?? null,
    breakdowns: {
      cci: breakdown((row) => cciBucket(row.cci == null ? null : Number(row.cci))),
      bollinger: breakdown((row) => [row.bb_position, row.bb_trend].filter(Boolean).join(" · ")),
      confluence: breakdown((row) => row.confluence ?? "없음"),
      signalType: breakdown((row) => row.signal_type),
    },
  }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } })
}
