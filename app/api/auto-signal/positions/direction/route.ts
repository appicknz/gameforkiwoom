import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function PATCH(req: Request) {
  const secret = req.headers.get("x-internal-secret")
  if (!secret || secret !== process.env.INTERNAL_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? "")
  const direction = body.direction === "short" ? "short" : body.direction === "long" ? "long" : ""
  if (!id || !direction) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { data: position, error: readError } = await db.from("auto_signal_positions").select("id, status, direction, entry_price, current_price, roi, pnl").eq("id", id).single()
  if (readError || !position) return NextResponse.json({ error: "Position not found" }, { status: 404 })
  if (position.status !== "open") return NextResponse.json({ error: "Only open positions can be changed" }, { status: 409 })
  const entry = Number(position.entry_price)
  const current = Number(position.current_price)
  const priceMove = entry > 0 ? (direction === "long" ? (current - entry) / entry : (entry - current) / entry) : 0
  const roi = priceMove * 100
  const pnl = Number(position.pnl ?? 0) * (position.direction === direction ? 1 : -1)
  const { data, error } = await db.from("auto_signal_positions").update({ direction, roi, pnl, updated_at: new Date().toISOString() }).eq("id", id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
