import "server-only"

import { NextResponse } from "next/server"
import { processPendingSignalOutcomes } from "@/lib/signal-statistics-outcomes"
import { backfillSignalPredictions } from "@/lib/signal-prediction"

export const dynamic = "force-dynamic"
export const maxDuration = 55

async function run(request: Request) {
  const authorization = request.headers.get("authorization")
  const internalSecret = request.headers.get("x-internal-secret")
  const requestUrl = new URL(request.url)
  const isLocalDevelopment = process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1"].includes(requestUrl.hostname)
  const allowed = isLocalDevelopment || authorization === `Bearer ${process.env.CRON_SECRET}` || internalSecret === process.env.INTERNAL_SECRET
  if (!allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const [outcomes, predictions] = await Promise.all([
      processPendingSignalOutcomes(80),
      backfillSignalPredictions(60),
    ])
    return NextResponse.json({ ok: true, ...outcomes, ...predictions })
  } catch (error) {
    console.error("[signal-statistics] outcome cron failed", error)
    return NextResponse.json({ error: "Outcome processing failed" }, { status: 500 })
  }
}

export const GET = run
export const POST = run
