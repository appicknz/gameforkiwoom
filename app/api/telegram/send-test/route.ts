export const dynamic = "force-dynamic"
export const runtime = "nodejs"

import { adminSupabase as admin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { sendBaccaratBettingMessage, sendBaccaratResultMessage } from "@/lib/telegram"

export async function POST(req: Request) {
  try {
  const session = await verifySession(req)
  if (!session.ok || !["master", "admin"].includes(session.role ?? "")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { type, roundNumber } = await req.json().catch(() => ({ type: "betting_button", roundNumber: 0 }))
  const rn = Number(roundNumber) || Math.floor(Date.now() / 1000 / 30)

  let result: { ok: boolean; messageId?: number } | boolean

  if (type === "betting_button") {
    result = await sendBaccaratBettingMessage({
      roundNumber: rn,
      bankerOdds:  1.95,
      playerOdds:  1.95,
      tieOdds:     8.0,
    })
  } else {
    result = await sendBaccaratResultMessage({
      roundNumber: rn,
      result:      "banker",
      bankerOdds:  1.95,
      playerOdds:  1.95,
      tieOdds:     8.0,
      betSummary:  { banker: 2, player: 1, tie: 0 },
    })
  }

  const ok = typeof result === "boolean" ? result : result.ok

  // 로그 기록 시도 (테이블 없으면 무시)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("telegram_send_logs").insert({
      round_number: rn,
      type,
      ok,
      tg_message_id: typeof result === "object" ? (result.messageId ?? null) : null,
      error_msg: ok ? null : "send failed",
      payload: { source: "manual_test", by: session.userId },
    })
  } catch { /* 테이블 없으면 무시 */ }

  return NextResponse.json({
    ok,
    roundNumber: rn,
    type,
    env: {
      botToken: !!process.env.TELEGRAM_BOT_TOKEN,
      channelId: process.env.TELEGRAM_BETTING_CHANNEL_ID ?? "NOT SET",
    },
  })
  } catch (err) {
    console.error("[v0] send-test uncaught error:", err)
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
