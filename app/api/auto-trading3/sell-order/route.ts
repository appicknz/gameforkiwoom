export const dynamic = "force-dynamic"
/**
 * POST /api/auto-trading3/sell-order
 * 자동매매3 기록 1건에 대해 해당 종목/계정/토큰으로 즉시 매도(청산) TVM 주문을 전송한다.
 * body: { id: string } 또는 { ids: string[] } — auto_trading3_records.id
 */

import "server-only"
import { NextResponse } from "next/server"
import { requireAutoTrading3User } from "@/lib/auto-trading3-auth"
import { sendAutoTrading3SellOrder } from "@/lib/auto-trading3"

export async function POST(req: Request) {
  const access = await requireAutoTrading3User(req)
  if (!access.ok) return access.response

  const body = await req.json().catch(() => null)
  const singleId = typeof body?.id === "string" ? body.id : null
  const rawBatchIds: unknown[] = Array.isArray(body?.ids) ? body.ids : []
  const batchIds: string[] = [...new Set(rawBatchIds.filter((id): id is string => typeof id === "string" && id.length > 0))]

  if (!singleId && batchIds.length === 0) return NextResponse.json({ error: "id 또는 ids 필수" }, { status: 400 })
  if (batchIds.length > 100) return NextResponse.json({ error: "한 번에 최대 100건까지 매도할 수 있습니다." }, { status: 400 })

  try {
    if (singleId) {
      const outcome = await sendAutoTrading3SellOrder(singleId)
      if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 400 })
      return NextResponse.json({ ok: true, result: outcome.result })
    }

    const outcomes = await Promise.all(batchIds.map(async id => {
      try {
        const outcome = await sendAutoTrading3SellOrder(id)
        return { id, ...outcome }
      } catch (error) {
        return { id, ok: false as const, error: error instanceof Error ? error.message : "매도 주문 전송 실패" }
      }
    }))
    const succeeded = outcomes.filter(outcome => outcome.ok).length
    return NextResponse.json({
      ok: succeeded === outcomes.length,
      succeeded,
      failed: outcomes.length - succeeded,
      total: outcomes.length,
      results: outcomes,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "매도 주문 전송 실패" }, { status: 500 })
  }
}
