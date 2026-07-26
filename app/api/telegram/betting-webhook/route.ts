import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { answerCallbackQuery, sendDirectMessage } from "@/lib/telegram"
import { Redis } from "@upstash/redis"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const redis = Redis.fromEnv()

const DEFAULT_BET_AMOUNT = 10000 // 기본 1만원

/**
 * 텔레그램 배팅 웹훅
 * - callback_data 형식: "bet:banker|player|tie:<roundNumber>"
 * - 유저를 telegram_id로 profiles에서 찾아 배팅 처리
 * - 1라운드 1회 UNIQUE 제한
 * - 배팅 차감은 balances에서 KRW 단위로
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()

    // callback_query 처리
    const cq = body?.callback_query
    if (!cq) return NextResponse.json({ ok: true })

    const callbackQueryId = cq.id as string
    const from = cq.from as { id: number; first_name?: string; username?: string }
    const data = (cq.data ?? "") as string

    // callback_data 파싱: "bet:banker:1234"
    const parts = data.split(":")
    if (parts[0] !== "bet" || parts.length < 3) {
      await answerCallbackQuery(callbackQueryId, "잘못된 요청입니다.", true)
      return NextResponse.json({ ok: true })
    }

    const side = parts[1] as "banker" | "player" | "tie"
    const roundNumber = parseInt(parts[2], 10)

    if (!["banker", "player", "tie"].includes(side) || isNaN(roundNumber)) {
      await answerCallbackQuery(callbackQueryId, "잘못된 배팅 정보입니다.", true)
      return NextResponse.json({ ok: true })
    }

    const telegramId = String(from.id)
    const sideLabel: Record<string, string> = { banker: "뱅커", player: "플레이어", tie: "타이" }

    // 1. 현재 라운드 확인 (배팅 가능 시간인지)
    const currentRoundNumber = Math.floor(Date.now() / 1000 / 30)
    if (roundNumber < currentRoundNumber - 1 || roundNumber > currentRoundNumber + 1) {
      await answerCallbackQuery(callbackQueryId, "이미 마감된 라운드입니다.", true)
      return NextResponse.json({ ok: true })
    }

    // 이미 settle됐는지 확인
    const settled = await redis.get(`settled:${roundNumber}`)
    if (settled) {
      await answerCallbackQuery(callbackQueryId, "이미 정산된 라운드입니다.", true)
      return NextResponse.json({ ok: true })
    }

    // 2. telegram_id로 유저 조회
    const { data: profile } = await admin
      .from("profiles")
      .select("id, username, tg_bet_amount")
      .eq("telegram_id", telegramId)
      .single()

    if (!profile) {
      await answerCallbackQuery(
        callbackQueryId,
        "등록된 회원이 아닙니다. 앱에서 텔레그램 연동 후 이용하세요.",
        true,
      )
      return NextResponse.json({ ok: true })
    }

    const userId    = profile.id
    const betAmount = Number(profile.tg_bet_amount ?? DEFAULT_BET_AMOUNT)

    // 3. 중복 배팅 체크 (1라운드 1회)
    const { data: existingBet } = await admin
      .from("telegram_bets")
      .select("id, side")
      .eq("user_id", userId)
      .eq("round_number", roundNumber)
      .single()

    if (existingBet) {
      await answerCallbackQuery(
        callbackQueryId,
        `이미 ${sideLabel[existingBet.side]}에 배팅하셨습니다. 1라운드 1회만 가능합니다.`,
        true,
      )
      return NextResponse.json({ ok: true })
    }

    // 4. 잔고 확인 및 차감 (RPC: deduct_balance)
    const { data: balRow } = await admin
      .from("balances")
      .select("amount")
      .eq("user_id", userId)
      .single()

    const currentBalance = Number(balRow?.amount ?? 0)
    if (currentBalance < betAmount) {
      await answerCallbackQuery(
        callbackQueryId,
        `잔고가 부족합니다. 현재 잔고: ${currentBalance.toLocaleString("ko-KR")}원 (필요: ${betAmount.toLocaleString("ko-KR")}원)`,
        true,
      )
      return NextResponse.json({ ok: true })
    }

    // 잔고 차감 (atomic)
    const { error: deductErr } = await admin.rpc("deduct_balance_for_bet", {
      p_user_id: userId,
      p_amount:  betAmount,
    })

    if (deductErr) {
      // RPC 없는 경우 직접 업데이트
      const { error: updateErr } = await admin
        .from("balances")
        .update({ amount: currentBalance - betAmount })
        .eq("user_id", userId)
        .gte("amount", betAmount) // 동시성 보호

      if (updateErr) {
        await answerCallbackQuery(callbackQueryId, "배팅 처리 중 오류가 발생했습니다.", true)
        return NextResponse.json({ ok: true })
      }
    }

    // 잔고 Redis 업데이트
    const newBalance = currentBalance - betAmount
    await Promise.all([
      redis.set(`balance:${userId}`, newBalance, { ex: 3600 }),
      redis.incr(`balance_version:${userId}`),
    ]).catch(() => {})

    // 5. telegram_bets INSERT
    await admin.from("telegram_bets").insert({
      user_id:      userId,
      telegram_id:  telegramId,
      round_number: roundNumber,
      side,
      amount:       betAmount,
    })

    // 6. Redis에 채널 배팅 집계 (정산 시 참조)
    const poolKey = `tg_pool:${roundNumber}`
    await redis.hincrby(poolKey, side, betAmount)
    await redis.expire(poolKey, 3600)

    // 유저 집합에 추가
    await redis.sadd(`tg_users:${roundNumber}`, userId)
    await redis.expire(`tg_users:${roundNumber}`, 3600)

    // 7. 버튼 응답
    await answerCallbackQuery(
      callbackQueryId,
      `${sideLabel[side]} 배팅 완료! ${betAmount.toLocaleString("ko-KR")}원 차감. 잔고: ${newBalance.toLocaleString("ko-KR")}원`,
      false,
    )

    // 8. 개인 DM 전송 (선택적 - 조용히 실패해도 됨)
    await sendDirectMessage(
      telegramId,
      `Round <b>${roundNumber}</b> - <b>${sideLabel[side]}</b> 배팅 완료\n` +
      `배팅금액: ${betAmount.toLocaleString("ko-KR")}원\n` +
      `남은 잔고: ${newBalance.toLocaleString("ko-KR")}원`,
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[betting-webhook] error:", err)
    return NextResponse.json({ ok: true }) // 텔레그램에는 항상 200 응답
  }
}
