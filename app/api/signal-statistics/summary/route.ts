import "server-only"

import { NextResponse } from "next/server"
import { adminSupabase as supabase } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

const HORIZONS = new Set([5, 15, 30, 60, 240])
const PAGE_SIZE = 1000
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const median = (values: number[]) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

type SummaryRow = {
  id: string
  signal_time: string
  symbol: string
  signal_type: string
  direction: string
  cci: number | null
  confluence: string | null
  bb_position: string | null
  bb_trend: string | null
  duplicate_index: number
  signal_statistics_outcomes: Array<{
    horizon_minutes: number
    directional_return_percent: number | null
    result: string | null
    status: string
    calculated_at: string | null
  }>
}

function applyEntryFilters<T extends { eq: Function; ilike: Function; gte: Function; lte: Function; not: Function }>(query: T, params: URLSearchParams) {
  const direction = params.get("direction")
  query = query.not("auto_signal_position_id", "is", null)
  const queryText = (params.get("q") ?? "").trim().toUpperCase().slice(0, 30)
  let filtered = query
  if (direction === "long" || direction === "short") filtered = filtered.eq("direction", direction)
  if (queryText) filtered = filtered.ilike("symbol", `%${queryText}%`)
  if (params.get("duplicates") === "original") filtered = filtered.eq("duplicate_index", 0)
  if (params.get("from")) filtered = filtered.gte("auto_signal_position.date_label", params.get("from") as string)
  if (params.get("to")) filtered = filtered.lte("auto_signal_position.date_label", params.get("to") as string)
  return filtered
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const horizon = HORIZONS.has(Number(params.get("horizon"))) ? Number(params.get("horizon")) : 30
  const direction = params.get("direction")
  const queryText = (params.get("q") ?? "").trim().toUpperCase().slice(0, 30)

  const countQuery = applyEntryFilters(
    supabase.from("signal_statistics_entries").select("id,auto_signal_position:auto_signal_positions!signal_statistics_entries_auto_position_fk!inner(date_label)", { count: "exact", head: true }),
    params,
  )
  const { count, error: countError } = await countQuery
  if (countError) return NextResponse.json({ error: "요약 통계를 불러오지 못했습니다." }, { status: 500 })

  let autoPositionQuery = supabase.from("auto_signal_positions").select("id", { count: "exact", head: true })
  if (params.get("from")) autoPositionQuery = autoPositionQuery.gte("date_label", params.get("from") as string)
  if (params.get("to")) autoPositionQuery = autoPositionQuery.lte("date_label", params.get("to") as string)
  if (direction === "long" || direction === "short") autoPositionQuery = autoPositionQuery.eq("direction", direction)
  if (queryText) autoPositionQuery = autoPositionQuery.ilike("symbol", `%${queryText}%`)
  const { count: autoPositionTotal, error: autoPositionError } = await autoPositionQuery
  if (autoPositionError) return NextResponse.json({ error: "자동매매 포지션 수를 불러오지 못했습니다." }, { status: 500 })

  const rows: SummaryRow[] = []
  for (let from = 0; from < (count ?? 0); from += PAGE_SIZE) {
    let query = supabase
      .from("signal_statistics_entries")
      .select("id,signal_time,symbol,signal_type,direction,cci,confluence,bb_position,bb_trend,duplicate_index,auto_signal_position:auto_signal_positions!signal_statistics_entries_auto_position_fk!inner(date_label),signal_statistics_outcomes!inner(horizon_minutes,directional_return_percent,result,status,calculated_at)")
      .eq("signal_statistics_outcomes.horizon_minutes", horizon)
      .eq("signal_statistics_outcomes.status", "complete")
      .order("signal_time", { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    query = applyEntryFilters(query, params)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: "요약 통계를 불러오지 못했습니다." }, { status: 500 })
    rows.push(...((data ?? []) as SummaryRow[]))
    if ((data?.length ?? 0) < PAGE_SIZE) break
  }

  const completed = rows.map((entry) => ({ ...entry, outcome: entry.signal_statistics_outcomes[0] }))
    .filter((row) => row.outcome?.directional_return_percent != null)
  const returns = completed.map((row) => Number(row.outcome.directional_return_percent))
  const wins = completed.filter((row) => row.outcome.result === "win").length
  const losses = completed.filter((row) => row.outcome.result === "loss").length
  const flats = completed.filter((row) => row.outcome.result === "flat").length

  const cciBucket = (cci: number | null) => cci == null ? "CCI 없음" : cci <= -100 ? "≤ -100" : cci < 0 ? "-100 ~ 0" : cci < 100 ? "0 ~ 100" : "≥ 100"
  const breakdown = (selector: (row: typeof completed[number]) => string) => {
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
    total: count ?? 0,
    autoPositionTotal: autoPositionTotal ?? 0,
    linkedPositionTotal: count ?? 0,
    missingStatisticsTotal: Math.max(0, (autoPositionTotal ?? 0) - (count ?? 0)),
    complete: completed.length,
    completionRate: count ? completed.length / count * 100 : 0,
    wins,
    losses,
    flats,
    winRate: completed.length ? wins / completed.length * 100 : 0,
    averageReturn: average(returns),
    medianReturn: median(returns),
    oldestSignalAt: completed.at(-1)?.signal_time ?? null,
    newestSignalAt: completed[0]?.signal_time ?? null,
    lastCalculatedAt: completed.map((row) => row.outcome.calculated_at).filter(Boolean).sort().at(-1) ?? null,
    breakdowns: {
      cci: breakdown((row) => cciBucket(row.cci == null ? null : Number(row.cci))),
      bollinger: breakdown((row) => [row.bb_position, row.bb_trend].filter(Boolean).join(" · ")),
      confluence: breakdown((row) => row.confluence ?? "없음"),
      signalType: breakdown((row) => row.signal_type),
    },
  }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } })
}
