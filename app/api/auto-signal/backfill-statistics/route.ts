import "server-only"

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST() {
  return NextResponse.json(
    { error: "Legacy statistics backfill is disabled; statistics are created only with UP3 positions." },
    { status: 410 },
  )
}
