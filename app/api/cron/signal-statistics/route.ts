import "server-only"

import { NextResponse } from "next/server"
import { processPendingSignalOutcomes } from "@/lib/signal-statistics-outcomes"

export const dynamic = "force-dynamic"
export const maxDuration = 55

async function run(request: Request) {
  const authorization = request.headers.get("authorization")
  const internalSecret = request.headers.get("x-internal-secret")
  const allowed = authorization === `Bearer ${process.env.CRON_SECRET}` || internalSecret === process.env.INTERNAL_SECRET
  if (!allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    return NextResponse.json({ ok: true, ...(await processPendingSignalOutcomes(80)) })
  } catch (error) {
    console.error("[signal-statistics] outcome cron failed", error)
    return NextResponse.json({ error: "Outcome processing failed" }, { status: 500 })
  }
}

export const GET = run
export const POST = run
