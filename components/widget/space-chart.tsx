"use client"

import dynamic from "next/dynamic"
import { SpaceOverlay } from "./space-overlay"

const BitcoinChart = dynamic(
  () => import("@/components/dashboard/bitcoin-chart").then(m => m.BitcoinChart),
  { ssr: false }
)

export function SpaceChart() {
  return (
    <div className="relative w-full">
      <BitcoinChart />
      <SpaceOverlay />
    </div>
  )
}
