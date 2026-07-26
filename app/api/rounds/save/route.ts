export const dynamic = "force-dynamic"
export const runtime = "nodejs"
import { adminSupabase as admin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"
import { sendBaccaratResultMessage, sendBaccaratBettingMessage } from "@/lib/telegram"

/**
 * 30초 라운드 종료 시 결과를 rounds 테이블에 저장 (인증 불필요)
 * 배팅 유무와 관계없이 매 라운드 클라이언트가 호출
 * baccarat_result는 서버에서 끝자리 기반으로 결정: 0~4=player, 5~8=banker, 9=tie
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { basePrice, closePrice } = body

    if (typeof basePrice !== "number" || typeof closePrice !== "number") {
      return NextResponse.json({ error: "Invalid price data" }, { status: 400 })
    }

    const lastDigit = Math.floor(Math.abs(closePrice * 10)) % 10
    const baccaratResult: "player" | "banker" | "tie" =
      lastDigit <= 4 ? "player" : lastDigit <= 8 ? "banker" : "tie"

    const roundSlot = Math.floor(Date.now() / 1000 / 30)
    const startedAt = new Date((roundSlot - 1) * 30 * 1000).toISOString()
    const endedAt = new Date(roundSlot * 30 * 1000).toISOString()

    // 같은 라운드 슬롯이 이미 있으면 스킵 (ended_at 기준 중복 체크)
    const { data: existing } = await admin
      .from("rounds")
      .select("id")
      .eq("ended_at", endedAt)
      .maybeSingle()

    if (!existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (admin as any)
        .from("rounds")
        .insert({
          base_price: basePrice,
          result_price: closePrice,
          result_digit: lastDigit,
          baccarat_result: baccaratResult,
          started_at: startedAt,
          ended_at: endedAt,
        })
      if (error) throw error
    }

    // ── 텔레그램 채널: 결과 + 다음 라운드 배팅 버튼 전송 ──────────────
    const currentRound = Math.floor(Date.now() / 1000 / 30)
    ;(async () => {
      try {
        // 이번 라운드 결과 메시지
        await sendBaccaratResultMessage({
          roundNumber: currentRound - 1,
          result:      baccaratResult,
          bankerOdds:  1.95,
          playerOdds:  1.95,
          tieOdds:     8.0,
          betSummary:  { banker: 0, player: 0, tie: 0 },
        })
        // 다음 라운드 배팅 버튼
        await sendBaccaratBettingMessage({
          roundNumber: currentRound,
          bankerOdds:  1.95,
          playerOdds:  1.95,
          tieOdds:     8.0,
        })
      } catch (e) {
        console.error("[rounds/save] telegram send error:", e)
      }
    })()
    // ──────────────────────────────────────────────────────────────

    return NextResponse.json({ success: true, baccaratResult, lastDigit })
  } catch (err) {
    console.error("[v0] rounds/save error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
