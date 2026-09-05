import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { buildSignalEnrichment, normalizeEnrichmentSymbol } from "@/lib/signal-enrichment"

describe("signal enrichment", () => {
  it("normalizes perpetual symbols and preserves unavailable market data", () => {
    const enrichment = buildSignalEnrichment({
      symbol: "BINANCE:CVXUSDT.P",
      signal_type: "TRIPLE_COMBO_UP3",
      price: "2.194",
      volume_change: "1690.96",
      confluence: "1",
      active_timeframes: ["5m"],
      bollinger_band: { position: "above_middle", trend: "down" },
    }, { source: "unavailable" })

    expect(normalizeEnrichmentSymbol("BINANCE:CVXUSDT.P")).toBe("CVXUSDT")
    expect(enrichment.volume_ratio_24h).toBeNull()
    expect(enrichment.volume_ratio_source).toBe("unavailable")
    expect(enrichment.fire_count).toBe(1)
    expect(enrichment.trade_guide).toBe("데이터 부족")
  })

  it("matches the formatter fire thresholds when market data is available", () => {
    const enrichment = buildSignalEnrichment({ price: 10, volume: 100, confluence: 1, active_timeframes: ["5m"] }, { volume24h: 500, source: "binance" })
    expect(enrichment.volume_ratio_24h).toBe(200)
    expect(enrichment.fire_volume_score).toBe(5)
    expect(enrichment.fire_count).toBe(3)
    expect(enrichment.volume_ratio_source).toBe("binance")
  })
})
