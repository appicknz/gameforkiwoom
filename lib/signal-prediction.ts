import "server-only"

import { adminSupabase } from "@/lib/supabase-admin"
import { OUTCOME_HORIZONS } from "@/lib/signal-statistics"

export const PREDICTION_MODEL_VERSION = "empirical-bayes-v2-enriched"
const PRIOR_STRENGTH = 40
const MAX_TRAINING_ROWS = 2_000

type FeatureEntry = {
  direction: string
  signal_type: string
  cci: number | null
  confluence: string | null
  price_change_percent: number | null
  volume_change: number | null
  active_timeframes: unknown
  bb_position: string | null
  bb_trend: string | null
  volume_ratio_24h?: number | null
  fire_count?: number | null
  signal_state?: string | null
  signal_grade?: string | null
  signal_score?: number | null
}

type TrainingRow = FeatureEntry & {
  result: "win" | "loss" | "flat"
  directional_return_percent: number
  known_at: string
}

type FeatureEvidence = {
  feature: string
  value: string
  samples: number
  posteriorWinRate: number
  averageReturn: number
  weight: number
}

const finiteNumber = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const bucket = (value: number | null, cuts: number[], labels: string[]) => {
  if (value == null) return "missing"
  const index = cuts.findIndex((cut) => value < cut)
  return labels[index === -1 ? labels.length - 1 : index]
}

export function predictionFeatures(entry: FeatureEntry) {
  const timeframes = Array.isArray(entry.active_timeframes)
    ? entry.active_timeframes.map(String).sort().join("+") || "none"
    : "missing"
  return {
    direction: entry.direction || "missing",
    signalType: entry.signal_type || "missing",
    cci: bucket(finiteNumber(entry.cci), [-100, 0, 100], ["lt-100", "-100-0", "0-100", "gte-100"]),
    bollinger: `${entry.bb_position || "missing"}:${entry.bb_trend || "missing"}`,
    confluence: entry.confluence || "missing",
    priceChange: bucket(finiteNumber(entry.price_change_percent), [-1, -0.25, 0.25, 1], ["lt-1", "-1--.25", "-.25-.25", ".25-1", "gte-1"]),
    volumeChange: bucket(finiteNumber(entry.volume_change), [-25, 0, 25, 100], ["lt-25", "-25-0", "0-25", "25-100", "gte-100"]),
    activeTimeframes: timeframes,
    volumeRatio24h: bucket(finiteNumber(entry.volume_ratio_24h ?? null), [0.1, 0.5, 1, 5], ["lt-0.1", "0.1-0.5", "0.5-1", "1-5", "gte-5"]),
    fireCount: bucket(finiteNumber(entry.fire_count ?? null), [1, 2, 3, 4], ["0-1", "2", "3", "4", "5"]),
    signalState: entry.signal_state || "missing",
    signalGrade: entry.signal_grade || "missing",
    signalScore: bucket(finiteNumber(entry.signal_score ?? null), [40, 60, 80], ["lt-40", "40-60", "60-80", "gte-80"]),
  }
}

export function calculatePrediction(entry: FeatureEntry, training: TrainingRow[]) {
  const total = training.length
  const wins = training.filter((row) => row.result === "win").length
  const priorWinRate = total ? wins / total : 0.5
  const priorReturn = total
    ? training.reduce((sum, row) => sum + row.directional_return_percent, 0) / total
    : 0
  const targetFeatures = predictionFeatures(entry)
  const evidence: FeatureEvidence[] = []

  for (const [feature, value] of Object.entries(targetFeatures)) {
    const matches = training.filter((row) => predictionFeatures(row)[feature as keyof typeof targetFeatures] === value)
    if (!matches.length) continue
    const featureWins = matches.filter((row) => row.result === "win").length
    const posteriorWinRate = (featureWins + PRIOR_STRENGTH * priorWinRate) / (matches.length + PRIOR_STRENGTH)
    const featureReturn = matches.reduce((sum, row) => sum + row.directional_return_percent, 0) / matches.length
    const weight = Math.min(1, matches.length / 150)
    evidence.push({ feature, value, samples: matches.length, posteriorWinRate, averageReturn: featureReturn, weight })
  }

  const weightTotal = evidence.reduce((sum, item) => sum + item.weight, 0)
  const expectedWinRate = weightTotal
    ? evidence.reduce((sum, item) => sum + item.posteriorWinRate * item.weight, 0) / weightTotal
    : priorWinRate
  const expectedReturn = weightTotal
    ? evidence.reduce((sum, item) => {
        const shrunk = (item.averageReturn * item.samples + priorReturn * PRIOR_STRENGTH) / (item.samples + PRIOR_STRENGTH)
        return sum + shrunk * item.weight
      }, 0) / weightTotal
    : priorReturn
  const effectiveSampleSize = evidence.length
    ? Math.round(evidence.reduce((sum, item) => sum + item.samples * item.weight, 0) / weightTotal)
    : total
  const dates = training.map((row) => new Date(row.known_at).getTime()).filter(Number.isFinite)
  const coverageDays = dates.length > 1 ? (Math.max(...dates) - Math.min(...dates)) / 86_400_000 : 0
  const agreement = evidence.length
    ? evidence.filter((item) => (item.posteriorWinRate >= priorWinRate) === (expectedWinRate >= priorWinRate)).length / evidence.length
    : 0
  const sampleScore = Math.min(1, total / 300)
  const coverageScore = Math.min(1, coverageDays / 14)
  const confidenceScore = Math.round(100 * sampleScore * (0.45 + 0.35 * agreement + 0.2 * coverageScore))
  const confidenceLevel = total < 30
    ? "insufficient"
    : total < 100 || coverageDays < 14
      ? "low"
      : total < 300
        ? "medium"
        : agreement >= 0.65
          ? "high"
          : "medium"

  return {
    expectedWinRate: expectedWinRate * 100,
    expectedDirectionalReturnPercent: expectedReturn,
    confidenceLevel,
    confidenceScore,
    effectiveSampleSize,
    evidence: {
      prior: { samples: total, winRate: priorWinRate * 100, averageReturn: priorReturn },
      coverageDays: Number(coverageDays.toFixed(2)),
      thresholdPercent: 0.1,
      features: evidence,
    },
  }
}

async function loadTrainingRows(horizon: number, cutoff: string) {
  const { data, error } = await adminSupabase
    .from("signal_statistics_outcomes")
    .select("result,directional_return_percent,target_time,entry:signal_statistics_entries!inner(direction,signal_type,cci,confluence,price_change_percent,volume_change,active_timeframes,bb_position,bb_trend,volume_ratio_24h,fire_count,signal_state,signal_grade,signal_score,signal_time)")
    .eq("horizon_minutes", horizon)
    .eq("status", "complete")
    .not("entry.auto_signal_position_id", "is", null)
    .not("directional_return_percent", "is", null)
    .lte("target_time", cutoff)
    .lt("entry.signal_time", cutoff)
    .order("target_time", { ascending: false })
    .limit(MAX_TRAINING_ROWS)
  if (error) throw error

  return (data ?? []).flatMap((row: any) => {
    const entry = Array.isArray(row.entry) ? row.entry[0] : row.entry
    const directionalReturn = finiteNumber(row.directional_return_percent)
    if (!entry || directionalReturn == null || !row.result || !row.target_time) return []
    return [{ ...entry, result: row.result, directional_return_percent: directionalReturn, known_at: row.target_time }] as TrainingRow[]
  })
}

export async function createPredictionsForEntry(entryId: string) {
  const { data: entry, error } = await adminSupabase
    .from("signal_statistics_entries")
    .select("id,signal_time,direction,signal_type,cci,confluence,price_change_percent,volume_change,active_timeframes,bb_position,bb_trend,volume_ratio_24h,fire_count,signal_state,signal_grade,signal_score")
    .eq("id", entryId)
    .single()
  if (error) throw error

  const rows = []
  for (const horizon of OUTCOME_HORIZONS) {
    const training = await loadTrainingRows(horizon, entry.signal_time)
    const prediction = calculatePrediction(entry, training)
    rows.push({
      entry_id: entry.id,
      horizon_minutes: horizon,
      predicted_at: new Date().toISOString(),
      training_cutoff_at: entry.signal_time,
      model_version: PREDICTION_MODEL_VERSION,
      expected_win_rate: prediction.expectedWinRate,
      expected_directional_return_percent: prediction.expectedDirectionalReturnPercent,
      confidence_level: prediction.confidenceLevel,
      confidence_score: prediction.confidenceScore,
      effective_sample_size: prediction.effectiveSampleSize,
      evidence: prediction.evidence,
    })
  }

  const { error: insertError } = await adminSupabase
    .from("signal_statistics_predictions")
    .upsert(rows, { onConflict: "entry_id,horizon_minutes", ignoreDuplicates: true })
  if (insertError) throw insertError
  return rows.length
}

export async function backfillSignalPredictions(limit = 60) {
  const cappedLimit = Math.min(100, Math.max(2, limit))
  const select = "id,auto_signal_position_id,signal_time,direction,signal_type,cci,confluence,price_change_percent,volume_change,active_timeframes,bb_position,bb_trend,signal_statistics_predictions!left(id)"
  const candidateSlice = async (ascending: boolean, count: number) => {
    const { data, error } = await adminSupabase
      .from("signal_statistics_entries")
      .select(select)
      .not("auto_signal_position_id", "is", null)
      .is("signal_statistics_predictions.id", null)
      .order("signal_time", { ascending })
      .limit(count)
    if (error) throw error
    return data ?? []
  }
  const oldestCount = Math.floor(cappedLimit / 2)
  const [oldest, newest] = await Promise.all([
    candidateSlice(true, oldestCount),
    candidateSlice(false, cappedLimit - oldestCount),
  ])
  const candidates = [...new Map([...oldest, ...newest].map((entry: any) => [entry.id, entry])).values()] as any[]
  if (!candidates.length) return { predictionEntriesChecked: 0, predictionSnapshotsCreated: 0 }

  const latestCutoff = candidates.map((entry) => entry.signal_time).sort().at(-1) as string
  const trainingByHorizon = new Map<number, TrainingRow[]>()
  await Promise.all(OUTCOME_HORIZONS.map(async (horizon) => {
    trainingByHorizon.set(horizon, await loadTrainingRows(horizon, latestCutoff))
  }))

  const predictedAt = new Date().toISOString()
  const rows = candidates.flatMap((entry) => OUTCOME_HORIZONS.map((horizon) => {
    const training = (trainingByHorizon.get(horizon) ?? []).filter((row) => row.known_at <= entry.signal_time)
    const prediction = calculatePrediction(entry, training)
    return {
      entry_id: entry.id,
      horizon_minutes: horizon,
      predicted_at: predictedAt,
      training_cutoff_at: entry.signal_time,
      model_version: PREDICTION_MODEL_VERSION,
      expected_win_rate: prediction.expectedWinRate,
      expected_directional_return_percent: prediction.expectedDirectionalReturnPercent,
      confidence_level: prediction.confidenceLevel,
      confidence_score: prediction.confidenceScore,
      effective_sample_size: prediction.effectiveSampleSize,
      evidence: prediction.evidence,
    }
  }))
  const { error: insertError } = await adminSupabase
    .from("signal_statistics_predictions")
    .upsert(rows, { onConflict: "entry_id,horizon_minutes", ignoreDuplicates: true })
  if (insertError) throw insertError
  return { predictionEntriesChecked: candidates.length, predictionSnapshotsCreated: rows.length }
}
