import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { payDb } from "@/lib/pay/db"
import { payRequests, payManagers, payMasterSettings } from "@/lib/pay/db/schema"
import {
  answerPayCallbackQuery,
  editPayMessage,
  sendPayTelegramMessage,
} from "@/lib/pay/telegram"

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const cbq = body.callback_query as Record<string, unknown> | undefined
  if (!cbq) return NextResponse.json({ ok: true })

  const callbackQueryId = cbq.id as string
  const data = cbq.data as string
  const message = cbq.message as Record<string, unknown>
  const chatId = (message?.chat as Record<string, unknown>)?.id as number
  const messageId = message?.message_id as number
  const from = cbq.from as Record<string, unknown>
  const botToken = req.headers.get("x-bot-token") ?? ""

  if (!data) {
    return NextResponse.json({ ok: true })
  }

  // pay_confirm:<id>
  if (data.startsWith("pay_confirm:")) {
    const requestId = data.split(":")[1]
    const [req2] = await payDb.select().from(payRequests).where(eq(payRequests.id, requestId))
    if (!req2) {
      await answerPayCallbackQuery(botToken, callbackQueryId, "신청 정보를 찾을 수 없습니다.")
      return NextResponse.json({ ok: true })
    }
    if (req2.status !== "pending") {
      await answerPayCallbackQuery(botToken, callbackQueryId, "이미 처리된 신청입니다.")
      return NextResponse.json({ ok: true })
    }

    await payDb.update(payRequests)
      .set({ status: "manager_confirmed", managerConfirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(payRequests.id, requestId))

    await answerPayCallbackQuery(botToken, callbackQueryId, "확인 처리되었습니다.")
    await editPayMessage(
      botToken, String(chatId), messageId,
      `<b>확인 완료</b>\n사이트 ID: <code>${req2.siteId}</code>\n추천코드: <code>${req2.referralCode}</code>\n금액: <b>${req2.amount.toLocaleString("ko-KR")}원</b>\n\n처리자: ${(from?.username as string) ? "@" + (from.username as string) : "관리자"}`,
    )

    // 마스터 알림
    const [settings] = await payDb.select().from(payMasterSettings).where(eq(payMasterSettings.id, "1"))
    if (settings?.telegramBotToken && settings.telegramChatId) {
      await sendPayTelegramMessage(
        settings.telegramBotToken,
        settings.telegramChatId,
        `<b>관리자 확인 완료</b>\n사이트 ID: <code>${req2.siteId}</code>\n추천코드: <code>${req2.referralCode}</code>\n금액: <b>${req2.amount.toLocaleString("ko-KR")}원</b>`,
        [[{ text: "정산 완료 처리", callback_data: `pay_settle:${requestId}` }]],
      )
    }
    return NextResponse.json({ ok: true })
  }

  // pay_reject:<id>
  if (data.startsWith("pay_reject:")) {
    const requestId = data.split(":")[1]
    const [req2] = await payDb.select().from(payRequests).where(eq(payRequests.id, requestId))
    if (!req2 || req2.status !== "pending") {
      await answerPayCallbackQuery(botToken, callbackQueryId, "처리할 수 없는 신청입니다.")
      return NextResponse.json({ ok: true })
    }

    await payDb.update(payRequests)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(payRequests.id, requestId))

    await answerPayCallbackQuery(botToken, callbackQueryId, "거절 처리되었습니다.")
    await editPayMessage(
      botToken, String(chatId), messageId,
      `<b>거절됨</b>\n사이트 ID: <code>${req2.siteId}</code>\n금액: ${req2.amount.toLocaleString("ko-KR")}원`,
    )
    return NextResponse.json({ ok: true })
  }

  // pay_settle:<id>  (마스터용)
  if (data.startsWith("pay_settle:")) {
    const requestId = data.split(":")[1]
    await payDb.update(payRequests)
      .set({
        settlementStatus: "settled",
        settlementDate: new Date(),
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payRequests.id, requestId))

    await answerPayCallbackQuery(botToken, callbackQueryId, "정산이 완료 처리되었습니다.")
    if (chatId && messageId) {
      const [req2] = await payDb.select().from(payRequests).where(eq(payRequests.id, requestId))
      if (req2) {
        await editPayMessage(
          botToken, String(chatId), messageId,
          `<b>정산 완료</b>\n사이트 ID: <code>${req2.siteId}</code>\n금액: <b>${req2.amount.toLocaleString("ko-KR")}원</b>`,
        )
      }
    }
    return NextResponse.json({ ok: true })
  }

  await answerPayCallbackQuery(botToken, callbackQueryId, "알 수 없는 요청입니다.")
  return NextResponse.json({ ok: true })
}

// 봇 webhook 등록 엔드포인트 (GET으로 상태 확인)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const botToken = searchParams.get("token")
  if (!botToken) return NextResponse.json({ error: "token required" }, { status: 400 })
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
  const info = await res.json()
  return NextResponse.json(info)
}
