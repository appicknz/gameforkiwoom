import "server-only"

import { NextResponse } from "next/server"
import { adminSupabase as supabase } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"
const HORIZONS = new Set([5, 15, 30, 60, 240])

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const horizon = HORIZONS.has(Number(params.get("horizon"))) ? Number(params.get("horizon")) : 30
  let predictionQuery = supabase
    .from("signal_statistics_predictions")
    .select("entry_id,expected_win_rate,expected_directional_return_percent,confidence_level,effective_sample_size,model_version,training_cutoff_at,entry:signal_statistics_entries!inner(signal_time)")
    .eq("horizon_minutes", horizon)
    .order("predicted_at", { ascending: false })
    .limit(2_000)
  if (params.get("from")) predictionQuery = predictionQuery.gte("entry.signal_time", `${params.get("from")}T00:00:00+09:00`)
  if (params.get("to")) predictionQuery = predictionQuery.lte("entry.signal_time", `${params.get("to")}T23:59:59+09:00`)

  const { data: predictions, error: predictionError } = await predictionQuery
  if (predictionError) return NextResponse.json({ error: "예측 검증 데이터를 불러오지 못했습니다." }, { status: 500 })
  const entryIds = (predictions ?? []).map((row: any) => row.entry_id)
  if (!entryIds.length) return NextResponse.json({
    horizon, samples: 0, accuracy: null, flatRate: null, brierScore: null,
    averagePredictedReturn: null, averageActualReturn: null,
    modelVersion: "empirical-bayes-v1", calibration: [],
  })

  const { data: outcomes, error: outcomeError } = await supabase
    .from("signal_statistics_outcomes")
    .select("entry_id,result,directional_return_percent,status")
    .in("entry_id", entryIds)
    .eq("horizon_minutes", horizon)
    .eq("status", "complete")
    .not("directional_return_percent", "is", null)
  if (outcomeError) return NextResponse.json({ error: "실제 결과를 불러오지 못했습니다." }, { status: 500 })

  const outcomeByEntry = new Map((outcomes ?? []).map((outcome: any) => [outcome.entry_id, outcome]))
  const rows = (predictions ?? []).flatMap((prediction: any) => {
    const outcome = outcomeByEntry.get(prediction.entry_id) as any
    return outcome ? [{ ...prediction, outcome }] : []
  })
  const brier = rows.length ? rows.reduce((sum: number, row: any) => {
    const probability = Number(row.expected_win_rate) / 100
    const actual = row.outcome.result === "win" ? 1 : 0
    return sum + (probability - actual) ** 2
  }, 0) / rows.length : null
  const correct = rows.filter((row: any) => (Number(row.expected_win_rate) >= 50) === (row.outcome.result === "win")).length
  const calibration = Array.from({ length: 5 }, (_, index) => {
    const min = index * 20
    const max = min + 20
    const bucketRows = rows.filter((row: any) => Number(row.expected_win_rate) >= min && (index === 4 ? Number(row.expected_win_rate) <= max : Number(row.expected_win_rate) < max))
    return {
      label: `${min}–${max}%`,
      samples: bucketRows.length,
      predictedWinRate: bucketRows.length ? bucketRows.reduce((sum: number, row: any) => sum + Number(row.expected_win_rate), 0) / bucketRows.length : null,
      actualWinRate: bucketRows.length ? bucketRows.filter((row: any) => row.outcome.result === "win").length / bucketRows.length * 100 : null,
    }
  }).filter((bucket) => bucket.samples)

  return NextResponse.json({
    horizon,
    samples: rows.length,
    accuracy: rows.length ? correct / rows.length * 100 : null,
    flatRate: rows.length ? rows.filter((row: any) => row.outcome.result === "flat").length / rows.length * 100 : null,
    brierScore: brier,
    averagePredictedReturn: rows.length ? rows.reduce((sum: number, row: any) => sum + Number(row.expected_directional_return_percent), 0) / rows.length : null,
    averageActualReturn: rows.length ? rows.reduce((sum: number, row: any) => sum + Number(row.outcome.directional_return_percent), 0) / rows.length : null,
    modelVersion: rows[0]?.model_version ?? "empirical-bayes-v1",
    calibration,
  }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } })
}
