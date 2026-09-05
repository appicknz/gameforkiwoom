import "server-only"

import { NextResponse } from "next/server"
import { adminSupabase as supabase } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"
const HORIZONS = new Set([5, 15, 30, 60, 240])
const PAGE_SIZE = 1_000

async function fetchAllPredictions(horizon: number) {
  const rows: any[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("signal_statistics_predictions")
      .select("entry_id,expected_win_rate,expected_directional_return_percent,model_version,entry:signal_statistics_entries!inner(signal_time)")
      .eq("horizon_minutes", horizon)
      .order("predicted_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < PAGE_SIZE) return rows
  }
}

async function countCompletedSamples(horizon: number, from?: string, to?: string) {
  let query = supabase
    .from("signal_statistics_outcomes")
    .select("entry:signal_statistics_entries!inner(signal_time)", { count: "exact", head: true })
    .eq("horizon_minutes", horizon)
    .eq("status", "complete")
    .not("directional_return_percent", "is", null)
  if (from) query = query.gte("entry.signal_time", from)
  if (to) query = query.lt("entry.signal_time", to)
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const horizon = HORIZONS.has(Number(params.get("horizon"))) ? Number(params.get("horizon")) : 30
  const now = new Date()
  const kstParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
  const todayStart = `${kstParts}T00:00:00+09:00`
  const tomorrow = new Date(`${kstParts}T00:00:00+09:00`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const tomorrowStart = tomorrow.toISOString()

  try {
    const [predictions, todaySamples, totalSamples] = await Promise.all([
      fetchAllPredictions(horizon),
      countCompletedSamples(horizon, todayStart, tomorrowStart),
      countCompletedSamples(horizon),
    ])

    const outcomeByEntry = new Map<string, any>()
    const entryIds = predictions.map((row) => row.entry_id)
    for (let index = 0; index < entryIds.length; index += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("signal_statistics_outcomes")
        .select("entry_id,result,directional_return_percent")
        .in("entry_id", entryIds.slice(index, index + PAGE_SIZE))
        .eq("horizon_minutes", horizon)
        .eq("status", "complete")
        .not("directional_return_percent", "is", null)
      if (error) throw error
      for (const outcome of data ?? []) outcomeByEntry.set(outcome.entry_id, outcome)
    }

    const rows = predictions.flatMap((prediction) => {
      const outcome = outcomeByEntry.get(prediction.entry_id)
      return outcome ? [{ ...prediction, outcome }] : []
    })
    const todayEvaluatedSamples = rows.filter((row) => {
      const entry = Array.isArray(row.entry) ? row.entry[0] : row.entry
      const signalTime = entry?.signal_time
      return signalTime && signalTime >= todayStart && signalTime < tomorrowStart
    }).length
    const brier = rows.length ? rows.reduce((sum, row) => {
      const probability = Number(row.expected_win_rate) / 100
      const actual = row.outcome.result === "win" ? 1 : 0
      return sum + (probability - actual) ** 2
    }, 0) / rows.length : null
    const correct = rows.filter((row) => (Number(row.expected_win_rate) >= 50) === (row.outcome.result === "win")).length
    const calibration = Array.from({ length: 5 }, (_, index) => {
      const min = index * 20
      const max = min + 20
      const bucketRows = rows.filter((row) => Number(row.expected_win_rate) >= min && (index === 4 ? Number(row.expected_win_rate) <= max : Number(row.expected_win_rate) < max))
      return {
        label: `${min}–${max}%`,
        samples: bucketRows.length,
        predictedWinRate: bucketRows.length ? bucketRows.reduce((sum, row) => sum + Number(row.expected_win_rate), 0) / bucketRows.length : null,
        actualWinRate: bucketRows.length ? bucketRows.filter((row) => row.outcome.result === "win").length / bucketRows.length * 100 : null,
      }
    }).filter((bucket) => bucket.samples)

    return NextResponse.json({
      horizon,
      todaySamples,
      totalSamples,
      todayEvaluatedSamples,
      evaluatedSamples: rows.length,
      accuracy: rows.length ? correct / rows.length * 100 : null,
      flatRate: rows.length ? rows.filter((row) => row.outcome.result === "flat").length / rows.length * 100 : null,
      brierScore: brier,
      averagePredictedReturn: rows.length ? rows.reduce((sum, row) => sum + Number(row.expected_directional_return_percent), 0) / rows.length : null,
      averageActualReturn: rows.length ? rows.reduce((sum, row) => sum + Number(row.outcome.directional_return_percent), 0) / rows.length : null,
      modelVersion: rows[0]?.model_version ?? "empirical-bayes-v1",
      calibration,
    }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } })
  } catch {
    return NextResponse.json({ error: "예측 검증 데이터를 불러오지 못했습니다." }, { status: 500 })
  }
}
