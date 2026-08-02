import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { payDb } from "@/lib/pay/db"
import { payRequests, payManagers, payMasterSettings, payMembers, payRelaySessions } from "@/lib/pay/db/schema"
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
      // /start pay_<tgId> 파라미터 파싱
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

      const welcomeText = username
        ? `안녕하세요, @${username}님!\n충전 신청이 준비되었습니다.\n앱으로 돌아가서 신청을 완료해주세요.`
        : `안녕하세요, ${firstName}님!\n충전 신청이 준비되었습니다.\n앱으로 돌아가서 신청을 완료해주세요.`

      await sendPayTelegramMessage(BOT_TOKEN, chatId, welcomeText, [])
      return NextResponse.json({ ok: true })
    }

    // ── /reply {chatId} {메시지} — 관리자가 유저에게 답장 ─────────────────
    // 관리자 채널(-1004471984422)에서 온 메시지만 처리
    const PAY_CHAT_ID = "-1004471984422"
    if (text?.startsWith("/reply") && chatId === PAY_CHAT_ID) {
      const parts = text.split(" ")
      const targetChatId = parts[1]
      const replyText = parts.slice(2).join(" ")

      if (targetChatId && replyText) {
        await sendPayTelegramMessage(
          BOT_TOKEN, targetChatId,
          `<b>관리자 답변</b>\n\n${replyText}`,
          []
        ).catch(() => null)
        await sendPayTelegramMessage(BOT_TOKEN, PAY_CHAT_ID, `전송 완료 (chat_id: ${targetChatId})`, [])
      } else {
        await sendPayTelegramMessage(BOT_TOKEN, PAY_CHAT_ID, "사용법: /reply {chat_id} {메시지}", [])
      }
      return NextResponse.json({ ok: true })
    }

    // ── 일반 메시지 — 활성 릴레이 세션이 있으면 관리자 채널에 포워딩 ────────
    if (text && !text.startsWith("/")) {
      const [session] = await payDb
        .select().from(payRelaySessions)
        .where(eq(payRelaySessions.userChatId, chatId))
        .orderBy(payRelaySessions.createdAt)
        .limit(1)

      if (session?.active) {
        const displayName = username ? `@${username}` : `${firstName} (ID: ${tgId})`
        const relayMsg =
          `<b>유저 문의</b>\n` +
          `발신자: ${displayName}\n` +
          `신청번호: <code>${session.requestId}</code>\n\n` +
          `${text}\n\n` +
          `<i>답장: /reply ${chatId} {내용}</i>`

        await sendPayTelegramMessage(BOT_TOKEN, session.adminChatId, relayMsg, []).catch(() => null)
        // 유저에게 수신 확인
        await sendPayTelegramMessage(BOT_TOKEN, chatId, "메시지가 관리자에게 전달되었습니다.", []).catch(() => null)
      }
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
  // 헤더로 넘어오면 사용, 없으면 환경변수 사용 (callback_query는 헤더가 없음)
  const botToken = req.headers.get("x-bot-token") || process.env.TELEGRAM_BOT_TOKEN || ""

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

  // copy_msg:<requestId> — 유저가 "메세지 복사하기" 버튼 클릭 시 plain text 전송
  if (data.startsWith("copy_msg:")) {
    const requestId = data.split(":")[1]
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? botToken
    const [req2] = await payDb.select().from(payRequests).where(eq(payRequests.id, requestId))

    let parsedData: Record<string, string> = {}
    try { parsedData = JSON.parse(req2?.webhookData ?? "{}") } catch { /* ignore */ }
    const copyText = parsedData?.copyText
      ?? (req2
        ? `충전 신청이 접수되었습니다.\n\n신청번호: ${requestId}\n금액: ${req2.amount.toLocaleString("ko-KR")}원\n체인: ${req2.chain ?? "TRX"} | 지갑: ${req2.walletAddress ?? "-"}`
        : "신청 정보를 찾을 수 없습니다.")

    // 유저에게 복사하기 쉬운 plain text 메시지 전송
    await sendPayTelegramMessage(BOT_TOKEN, String(chatId),
      `아래 메세지를 길게 눌러 복사 후 @cdpaysys 로 전달해 주세요.\n\n${copyText}`,
      []
    ).catch(() => null)

    await answerPayCallbackQuery(botToken, callbackQueryId, "메세지가 전송되었습니다.")
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

  // relay_start:<relayId> — 유저가 "관리자에게 문의하기" 버튼 클릭
  if (data.startsWith("relay_start:")) {
    const relayId = data.split(":")[1]
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? botToken
    const PAY_CHAT_ID = "-1004471984422"

    const [session] = await payDb.select().from(payRelaySessions)
      .where(eq(payRelaySessions.id, relayId)).limit(1)

    if (!session) {
      await answerPayCallbackQuery(botToken, callbackQueryId, "세션 정보를 찾을 수 없습니다.")
      return NextResponse.json({ ok: true })
    }

    // 세션 활성화
    await payDb.update(payRelaySessions)
      .set({ active: true, updatedAt: new Date() })
      .where(eq(payRelaySessions.id, relayId))

    // 유저에게: 이제 이 채팅에 메시지를 입력하면 관리자에게 전달됩니다
    const senderDisplay = (from?.username as string)
      ? `@${from.username as string}`
      : `ID: ${from?.id}`
    await answerPayCallbackQuery(botToken, callbackQueryId, "관리자와 연결되었습니다.")
    await sendPayTelegramMessage(
      BOT_TOKEN, String(chatId),
      `<b>관리자 연결 완료</b>\n\n이 채팅에 메시지를 입력하시면 관리자에게 실시간으로 전달됩니다.\n신청번호: <code>${session.requestId}</code>`,
      [[{ text: "문의 종료", callback_data: `relay_end:${relayId}` }]]
    ).catch(() => null)

    // 관리자 채널에 알림
    const [req2] = await payDb.select().from(payRequests)
      .where(eq(payRequests.id, session.requestId)).limit(1)

    await sendPayTelegramMessage(
      BOT_TOKEN, PAY_CHAT_ID,
      `<b>유저 문의 시작</b>\n` +
      `신청자: ${senderDisplay}\n` +
      `신청번호: <code>${session.requestId}</code>\n` +
      `금액: <b>${req2?.amount.toLocaleString("ko-KR") ?? "-"}원</b>\n\n` +
      `<i>답장: /reply ${chatId} {내용}</i>`,
      []
    ).catch(() => null)

    // 버튼을 "문의 중" 으로 업데이트
    if (chatId && messageId) {
      const currentText = (message?.text as string) ?? ""
      await editPayMessage(
        BOT_TOKEN, String(chatId), messageId,
        currentText,
        [[{ text: "문의 진행 ��...", callback_data: "noop" }]]
      )
    }

    return NextResponse.json({ ok: true })
  }

  // relay_end:<relayId> — 유저가 문의 종료 버튼 클릭
  if (data.startsWith("relay_end:")) {
    const relayId = data.split(":")[1]
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? botToken

    await payDb.update(payRelaySessions)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(payRelaySessions.id, relayId))

    await answerPayCallbackQuery(botToken, callbackQueryId, "문의가 종료되었습니다.")
    await sendPayTelegramMessage(BOT_TOKEN, String(chatId), "문의가 종료되었습니다. 감사합니다.", []).catch(() => null)
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
