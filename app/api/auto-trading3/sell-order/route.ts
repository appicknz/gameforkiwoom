export const dynamic = "force-dynamic"
/**
 * POST /api/auto-trading3/sell-order
 * 자동매매3 기록 1건에 대해 해당 종목/계정/토큰으로 즉시 매도(청산) TVM 주문을 전송한다.
 * body: { id: string } — auto_trading3_records.id
 */

import "server-only"
import { NextResponse } from "next/server"
import { requireAutoTrading3User } from "@/lib/auto-trading3-auth"
import { sendAutoTrading3SellOrder } from "@/lib/auto-trading3"

export async function POST(req: Request) {
  const access = await requireAutoTrading3User(req)
  if (!access.ok) return access.response

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === "string" ? body.id : null
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 })

  try {
    const outcome = await sendAutoTrading3SellOrder(id)
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 400 })
    return NextResponse.json({ ok: true, result: outcome.result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "매도 주문 전송 실패" }, { status: 500 })
  }
}
