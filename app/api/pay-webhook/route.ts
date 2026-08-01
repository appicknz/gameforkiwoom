import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { payDb } from "@/lib/pay/db"
import { payRequests, payManagers, payMasterSettings, payMembers } from "@/lib/pay/db/schema"
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

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ""

  // ── /start 커맨드 처리 ──────────────────────────────────────────────
  const msg = body.message as Record<string, unknown> | undefined
  if (msg) {
    const text   = msg.text as string | undefined
    const from   = msg.from as Record<string, unknown> | undefined
    const chat   = msg.chat as Record<string, unknown> | undefined
    const chatId = String(chat?.id ?? "")
    const tgId   = String(from?.id ?? "")
    const username  = (from?.username as string) ?? null
    const firstName = (from?.first_name as string) ?? "사용자"

    if (text?.startsWith("/start")) {
      // /start pay_<memberId> 파라미터 파싱
      const param = text.split(" ")[1] ?? ""

      // 해당 telegram_id로 pay_members 조회/생성 후 bot_chat_id 저장
      const existing = await payDb
        .select().from(payMembers)
        .where(eq(payMembers.telegramId, tgId))
        .limit(1)

      if (existing.length > 0) {
        await payDb.update(payMembers)
          .set({ botChatId: chatId, botStartedAt: new Date(), username: username ?? existing[0].username })
          .where(eq(payMembers.telegramId, tgId))
      } else {
        await payDb.insert(payMembers).values({
          id:           nanoid(),
          telegramId:   tgId,
          firstName,
          username:     username ?? null,
          botChatId:    chatId,
          botStartedAt: new Date(),
        }).onConflictDoNothing()
      }

      // 봇 → 유저 환영 메시지
      const welcomeText = username
        ? `안녕하세요, @${username}님!\n충전 신청이 준비되었습니다.\n앱으로 돌아가서 신청을 완료해주세요.`
        : `안녕하세요, ${firstName}님!\n충전 신청이 준비되었습니다.\n앱으로 돌아가서 신청을 완료해주세요.`

      await sendPayTelegramMessage(BOT_TOKEN, chatId, welcomeText, [])
    }

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

  // contact_admin:<requestId> — 유저가 "전송 요청" 버튼 클릭 시 관리자에게 포워딩
  if (data.startsWith("contact_admin:")) {
    const requestId = data.split(":")[1]
    const [req2] = await payDb.select().from(payRequests).where(eq(payRequests.id, requestId))

    if (!req2) {
      await answerPayCallbackQuery(botToken, callbackQueryId, "신청 정보를 찾을 수 없습니다.")
      return NextResponse.json({ ok: true })
    }

    // 버튼을 누른 유저 정보
    const senderName = (from?.username as string)
      ? `@${from.username as string}`
      : `<a href="tg://user?id=${from?.id}">ID: ${from?.id}</a>`

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? botToken

    // 1) 관리자(@cdpaysys)에게 유저 정보 전달
    const adminMsg =
      `<b>전송 요청 수신</b>\n\n` +
      `신청번호: <code>${requestId}</code>\n` +
      `신청자: ${senderName}\n` +
      `금액: <b>${req2.amount.toLocaleString("ko-KR")}원</b>\n` +
      `체인: ${req2.chain ?? "TRX"} | 지갑: <code>${req2.walletAddress ?? "-"}</code>\n\n` +
      `위 신청자와 직접 대화를 원하시면 아래 버튼을 사용하세요.`

    const adminButtons = [[
      { text: "대화 시작", url: `tg://user?id=${from?.id}` },
    ]]

    // 충전 전용 채널로 전송 (자동매매 채널과 분리)
    const PAY_CHAT_ID = "-1004471984422"
    await sendPayTelegramMessage(BOT_TOKEN, PAY_CHAT_ID, adminMsg, adminButtons).catch(() => null)

    // 2) 유저에게 확인 메시지
    await answerPayCallbackQuery(botToken, callbackQueryId, "관리자에게 전달되었습니다.")

    // 3) 버튼 텍스트 업데이트 (중복 클릭 방지)
    if (chatId && messageId) {
      const currentText = (message?.text as string) ?? ""
      await editPayMessage(
        BOT_TOKEN, String(chatId), messageId,
        currentText + "\n\n<i>관리자에게 전송 요청이 전달되었습니다.</i>",
        [[{ text: "전송됨", callback_data: "noop" }]],
      )
    }

    return NextResponse.json({ ok: true })
  }

  // noop — 이미 처리된 버튼
  if (data === "noop") {
    await answerPayCallbackQuery(botToken, callbackQueryId, "이미 전송된 요청입니다.")
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
