export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { closeAutoTrading3Day } from "@/lib/auto-trading3"

export async function POST(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })
  if (session.role !== "master") return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { date?: string }
  const date = body.date ?? new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  try { return NextResponse.json({ ok: true, date, results: await closeAutoTrading3Day(date) }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "종가 저장 실패" }, { status: 500 }) }
}
