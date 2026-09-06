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
    expect(enrichment.signal_state).toBe("NEUTRAL")
    expect(enrichment.trade_guide).toBe("관망")
    expect(enrichment.risk_flags).toContain("비효율 매매")
  })

  it("derives volume change from current and previous candle volume", () => {
    const enrichment = buildSignalEnrichment({
      signal_type: "TRIPLE_COMBO_UP3",
      price: "0.001708",
      volume: "29218682",
      prev_volume: "7597653",
      confluence: "1",
      cci: "-109.6799",
      price_change_percent: "0.7669",
      active_timeframes: "5",
    })

    expect(enrichment.fire_count).toBe(1)
    expect(enrichment.signal_state).toBe("PULLBACK")
    expect(enrichment.trade_guide).toBe("조건 충족 시 진입")
  })

  it("matches the Python WOO impulse classification", () => {
    const enrichment = buildSignalEnrichment({
      symbol: "WOOUSDT.P",
      signal_type: "TRIPLE_COMBO_UP3",
      price: "0.011120",
      volume: "267115339",
      volume_change: "-4.7591",
      price_change_percent: "30.0584",
      cci: "-78.5",
      confluence: "1",
      bollinger_band: { expansion: true, position: "below_middle" },
    }, { volume24h: 267115339 * 0.01112 / 0.45598, source: "binance" })

    expect(enrichment.volume_ratio_24h).toBeCloseTo(45.598, 3)
    expect(enrichment.fire_volume_score).toBe(5)
    expect(enrichment.fire_count).toBe(3)
    expect(enrichment.signal_score).toBe(50)
    expect(enrichment.signal_state).toBe("IMPULSE")
    expect(enrichment.trade_guide).toBe("관찰 대기")
    expect(enrichment.risk_flags).toContain("추세 착각")
  })

  it("parses string timeframe counts for the trading guide", () => {
    const enrichment = buildSignalEnrichment({
      signal_type: "UP",
      confluence: "1",
      active_timeframes: "5",
      price_change_percent: "2.4",
    })

    expect(enrichment.trade_guide).not.toBe("데이터 부족")
    expect(enrichment.signal_state).not.toBe("unknown")
  })

  it("matches the formatter fire thresholds when market data is available", () => {
    const enrichment = buildSignalEnrichment({ price: 10, volume: 100, confluence: 1, active_timeframes: ["5m"] }, { volume24h: 500, source: "binance" })
    expect(enrichment.volume_ratio_24h).toBe(200)
    expect(enrichment.fire_volume_score).toBe(5)
    expect(enrichment.fire_count).toBe(3)
    expect(enrichment.volume_ratio_source).toBe("binance")
  })
})
