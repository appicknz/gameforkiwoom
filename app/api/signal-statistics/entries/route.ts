import "server-only"

import { NextResponse } from "next/server"
import { adminSupabase as supabase } from "@/lib/supabase-admin"
import { duplicateLabel } from "@/lib/signal-statistics"

export const dynamic = "force-dynamic"

const HORIZONS = new Set([5, 15, 30, 60, 240])

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(params.get("pageSize") ?? "40", 10) || 40))
  const horizon = HORIZONS.has(Number(params.get("horizon"))) ? Number(params.get("horizon")) : 30
  const queryText = (params.get("q") ?? "").trim().toUpperCase().slice(0, 30)
  const direction = params.get("direction")
  const signalType = (params.get("signalType") ?? "").trim().slice(0, 80)
  const duplicates = params.get("duplicates") ?? "all"
  const from = (page - 1) * pageSize

  let query = supabase
    .from("signal_statistics_entries")
    .select("id,received_at,signal_time,exchange,symbol,signal_type,direction,entry_price,duplicate_group_key,duplicate_index,processing_status,cci,cci_signal,confluence,price_change_percent,volume_change,active_timeframes,first_occurrence,new_1m,new_5m,new_15m,new_1h,new_2h,new_4h,ultimate_plot,signal_timeframe,interval_label,bb_position,bb_trend,bb_expansion,bb_squeeze,bb_width,signal_statistics_outcomes(horizon_minutes,target_time,candle_time,exit_price,price_return_percent,directional_return_percent,result,status),signal_statistics_predictions(horizon_minutes,predicted_at,training_cutoff_at,model_version,expected_win_rate,expected_directional_return_percent,confidence_level,confidence_score,effective_sample_size)", { count: "exact" })
    .order("signal_time", { ascending: false })
    .order("duplicate_index", { ascending: true })
    .range(from, from + pageSize - 1)

  if (queryText) query = query.ilike("symbol", `%${queryText}%`)
  if (direction === "long" || direction === "short") query = query.eq("direction", direction)
  if (signalType) query = query.eq("signal_type", signalType)
  if (duplicates === "original") query = query.eq("duplicate_index", 0)
  if (params.get("from")) query = query.gte("signal_time", `${params.get("from")}T00:00:00+09:00`)
  if (params.get("to")) query = query.lte("signal_time", `${params.get("to")}T23:59:59+09:00`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: "통계 데이터를 불러오지 못했습니다." }, { status: 500 })

  const entries = (data ?? []).map((entry) => {
    const outcomes = Array.isArray(entry.signal_statistics_outcomes) ? entry.signal_statistics_outcomes : []
    const predictions = Array.isArray(entry.signal_statistics_predictions) ? entry.signal_statistics_predictions : []
    return {
      id: entry.id,
      receivedAt: entry.received_at,
      signalTime: entry.signal_time,
      exchange: entry.exchange,
      symbol: entry.symbol,
      signalType: entry.signal_type,
      direction: entry.direction,
      entryPrice: Number(entry.entry_price),
      duplicateGroupKey: entry.duplicate_group_key,
      duplicateIndex: entry.duplicate_index,
      duplicateLabel: duplicateLabel(entry.duplicate_index),
      processingStatus: entry.processing_status,
      cci: entry.cci == null ? null : Number(entry.cci),
      cciSignal: entry.cci_signal,
      confluence: entry.confluence,
      priceChangePercent: entry.price_change_percent == null ? null : Number(entry.price_change_percent),
      volumeChange: entry.volume_change == null ? null : Number(entry.volume_change),
      activeTimeframes: entry.active_timeframes,
      firstOccurrence: entry.first_occurrence,
      newTimeframes: { m1: entry.new_1m, m5: entry.new_5m, m15: entry.new_15m, h1: entry.new_1h, h2: entry.new_2h, h4: entry.new_4h },
      ultimatePlot: entry.ultimate_plot,
      signalTimeframe: entry.signal_timeframe,
      interval: entry.interval_label,
      bollinger: { position: entry.bb_position, trend: entry.bb_trend, expansion: entry.bb_expansion, squeeze: entry.bb_squeeze, width: entry.bb_width == null ? null : Number(entry.bb_width) },
      outcomes: Object.fromEntries(outcomes.map((outcome) => [outcome.horizon_minutes, {
        targetTime: outcome.target_time,
        candleTime: outcome.candle_time,
        exitPrice: outcome.exit_price == null ? null : Number(outcome.exit_price),
        priceReturnPercent: outcome.price_return_percent == null ? null : Number(outcome.price_return_percent),
        directionalReturnPercent: outcome.directional_return_percent == null ? null : Number(outcome.directional_return_percent),
        result: outcome.result,
        status: outcome.status,
      }])),
      predictions: Object.fromEntries(predictions.map((prediction) => [prediction.horizon_minutes, {
        predictedAt: prediction.predicted_at,
        trainingCutoffAt: prediction.training_cutoff_at,
        modelVersion: prediction.model_version,
        expectedWinRate: Number(prediction.expected_win_rate),
        expectedDirectionalReturnPercent: Number(prediction.expected_directional_return_percent),
        confidenceLevel: prediction.confidence_level,
        confidenceScore: Number(prediction.confidence_score),
        effectiveSampleSize: Number(prediction.effective_sample_size),
      }])),
      selectedOutcome: outcomes.find((outcome) => outcome.horizon_minutes === horizon) ?? null,
    }
  })

  return NextResponse.json({ entries, page, pageSize, total: count ?? 0, horizon }, {
    headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
  })
}
