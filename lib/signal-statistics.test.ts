import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { calculateReturns } from "@/lib/signal-statistics"

describe("calculateReturns", () => {
  it("uses the ±0.10% long threshold", () => {
    expect(calculateReturns(100, 100.099, "long").result).toBe("flat")
    expect(calculateReturns(100, 100.1, "long").result).toBe("win")
    expect(calculateReturns(100, 99.901, "long").result).toBe("flat")
    expect(calculateReturns(100, 99.9, "long").result).toBe("loss")
  })

  it("inverts returns before applying the short threshold", () => {
    expect(calculateReturns(100, 99.9, "short").result).toBe("win")
    expect(calculateReturns(100, 100.1, "short").result).toBe("loss")
  })
})
