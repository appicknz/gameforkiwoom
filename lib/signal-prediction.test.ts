import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { calculatePrediction } from "@/lib/signal-prediction"

const entry = {
  direction: "long",
  signal_type: "TRIPLE_COMBO_UP3",
  cci: 120,
  confluence: "trend",
  price_change_percent: 0.4,
  volume_change: 30,
  active_timeframes: ["5m", "15m"],
  bb_position: "upper",
  bb_trend: "up",
}

function trainingRow(index: number, overrides: Record<string, unknown> = {}) {
  return {
    ...entry,
    result: index % 2 === 0 ? "win" as const : "loss" as const,
    directional_return_percent: index % 2 === 0 ? 0.4 : -0.3,
    known_at: new Date(Date.UTC(2026, 7, 1 + Math.floor(index / 24), index % 24)).toISOString(),
    ...overrides,
  }
}

describe("calculatePrediction", () => {
  it("shrinks a sparse perfect feature match toward the global prior", () => {
    const training = Array.from({ length: 100 }, (_, index) => trainingRow(index, {
      confluence: index === 0 ? "rare" : "other",
    }))
    const prediction = calculatePrediction({ ...entry, confluence: "rare" }, training)
    expect(prediction.expectedWinRate).toBeGreaterThan(45)
    expect(prediction.expectedWinRate).toBeLessThan(65)
  })

  it("handles missing feature values as explicit categories", () => {
    const missing = { ...entry, cci: null, confluence: null, bb_position: null, bb_trend: null }
    const prediction = calculatePrediction(missing, Array.from({ length: 40 }, (_, index) => trainingRow(index, missing)))
    expect(prediction.effectiveSampleSize).toBeGreaterThan(0)
    expect(prediction.evidence.features.some((item) => item.value.includes("missing"))).toBe(true)
  })

  it("keeps five-day datasets at low confidence", () => {
    const prediction = calculatePrediction(entry, Array.from({ length: 300 }, (_, index) => trainingRow(index % 120)))
    expect(prediction.confidenceLevel).toBe("low")
  })
})
