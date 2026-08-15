import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { answerCallbackQuery, sendDirectMessage, verifyTelegramWebhookSecret } from "@/lib/telegram"
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
  if (!verifyTelegramWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()

    const message = body?.message
    const startMatch = typeof message?.text === "string"
      ? message.text.trim().match(/^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{32})$/)
      : null

    if (startMatch) {
      const chatId = String(message.chat?.id ?? "")
      const from = message.from as {
        id?: number
        username?: string
        first_name?: string
        last_name?: string
      } | undefined

      if (message.chat?.type !== "private" || !chatId || !from?.id) {
        return NextResponse.json({ ok: true })
      }

      const userId = await redis.getdel<string>(`telegram:link:${startMatch[1]}`)
      if (!userId) {
        await sendDirectMessage(chatId, "연동 링크가 만료되었거나 이미 사용되었습니다. 웹사이트에서 새 링크를 만들어 주세요.")
        return NextResponse.json({ ok: true })
      }

      const telegramId = String(from.id)
      const { data: owner } = await admin
        .from("profiles")
        .select("id, username")
        .eq("telegram_id", telegramId)
        .maybeSingle()

      if (owner && owner.id !== userId) {
        await sendDirectMessage(chatId, "이 Telegram 계정은 이미 다른 회원에게 연동되어 있습니다.")
        return NextResponse.json({ ok: true })
      }

      const { data: target } = await admin
        .from("profiles")
        .select("username, telegram_id")
        .eq("id", userId)
        .single()

      if (!target) {
        await sendDirectMessage(chatId, "연동할 회원 계정을 찾을 수 없습니다.")
        return NextResponse.json({ ok: true })
      }

      if (target.telegram_id && target.telegram_id !== telegramId) {
        await sendDirectMessage(chatId, "해당 회원은 이미 다른 Telegram 계정과 연동되어 있습니다.")
        return NextResponse.json({ ok: true })
      }

      const { error: linkError } = await admin
        .from("profiles")
        .update({
          telegram_id: telegramId,
          telegram_username: from.username ?? null,
          telegram_first_name: from.first_name ?? null,
          telegram_last_name: from.last_name ?? null,
          telegram_linked_at: new Date().toISOString(),
        })
        .eq("id", userId)

      if (linkError) {
        console.error("[betting-webhook] Telegram link failed:", linkError)
        await sendDirectMessage(chatId, "계정 연동 중 오류가 발생했습니다. 새 링크로 다시 시도해 주세요.")
        return NextResponse.json({ ok: true })
      }

      await sendDirectMessage(
        chatId,
        `<b>${target.username}</b> 회원 계정과 Telegram 연동이 완료되었습니다.`,
      )
      return NextResponse.json({ ok: true })
    }

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

    // 잔고 차감 (atomic RPC 우선, 없으면 직접 update)
    const { error: deductErr } = await admin.rpc("deduct_balance_for_bet", {
      p_user_id: userId,
      p_amount:  betAmount,
    })

    if (deductErr) {
      // INSUFFICIENT_BALANCE는 잔고 부족 — 더 이상 진행 불가
      if (deductErr.message?.includes("INSUFFICIENT_BALANCE")) {
        await answerCallbackQuery(
          callbackQueryId,
          `잔고가 부족합니다. 현재 잔고: ${currentBalance.toLocaleString("ko-KR")}원`,
          true,
        )
        return NextResponse.json({ ok: true })
      }

      // RPC 자체가 없는 경우 직접 update fallback
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
