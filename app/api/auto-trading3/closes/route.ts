export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { closeAutoTrading3Day } from "@/lib/auto-trading3"
import { requireAutoTrading3User } from "@/lib/auto-trading3-auth"

export async function POST(req: Request) {
  const access = await requireAutoTrading3User(req)
  if (!access.ok) return access.response
  const body = await req.json().catch(() => ({})) as { date?: string }
  const date = body.date ?? new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  try { return NextResponse.json({ ok: true, date, results: await closeAutoTrading3Day(date) }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "종가 저장 실패" }, { status: 500 }) }
}
