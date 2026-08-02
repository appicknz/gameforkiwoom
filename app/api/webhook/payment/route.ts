/**
 * Step 2 — dissig.com → 이 서버로 오는 결제 완료 웹훅 수신 라우트
 *
 * dissig이 결제창을 생성하고 완료되면 아래 body를 POST 합니다:
 * {
 *   requestId: "신청번호",       // or applyNo
 *   webhookSecret: "시크릿",     // or secret
 *   purchaseLink: "구매URL",     // or paymentUrl, link, url
 *   accountEmail: "이메일",      // or email
 *   accountPassword: "비번",     // or password
 *   selectedCard: "카드명",      // or cardName
 *   amount: "금액"
 * }
 */

import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { payDb } from "@/lib/pay/db"
import { payRequests, payManagers, payMasterSettings } from "@/lib/pay/db/schema"
import { sendPayTelegramMessage } from "@/lib/pay/telegram"

export async function POST(req: NextRequest) {
  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  // ── 시크릿 검증 ──────────────────────────────────────────────────────────
  const [settings] = await payDb.select().from(payMasterSettings).where(eq(payMasterSettings.id, "1"))
  const expectedSecret = settings?.webhookSecret ?? process.env.WEBHOOK_SECRET ?? ""
  const receivedSecret = body.webhookSecret ?? body.secret ?? req.headers.get("x-webhook-secret") ?? ""

  if (expectedSecret && receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // ── 필드 정규화 ───────────────────────────────────────────────────────────
  const requestId     = body.requestId      ?? body.applyNo       ?? ""
  const purchaseLink  = body.purchaseLink   ?? body.paymentUrl    ?? body.link ?? body.url ?? ""
  const accountEmail  = body.accountEmail   ?? body.email         ?? ""
  const accountPw     = body.accountPassword ?? body.password     ?? ""
  const selectedCard  = body.selectedCard   ?? body.cardName      ?? ""

  if (!requestId) {
    return NextResponse.json({ error: "missing requestId" }, { status: 400 })
  }

  // ── DB 업데이트 ───────────────────────────────────────────────────────────
  const [req2] = await payDb.select().from(payRequests).where(eq(payRequests.id, requestId))
  if (!req2) {
    return NextResponse.json({ error: "request not found" }, { status: 404 })
  }

  // 기존 webhookData에 병합
  let prevData: Record<string, unknown> = {}
  try { prevData = JSON.parse(req2.webhookData ?? "{}") } catch { /* ignore */ }

  await payDb.update(payRequests)
    .set({
      status: "payment_confirmed",
      webhookData: JSON.stringify({
        ...prevData,
        paymentConfirmedAt: new Date().toISOString(),
        purchaseLink,
        accountEmail,
        accountPassword: accountPw,
        selectedCard,
      }),
    })
    .where(eq(payRequests.id, requestId))

  // ── 텔레그램 알림 ─────────────────────────────────────────────────────────
  const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN ?? ""
  const PAY_CHAT_ID = "-1004471984422"

  const amountStr = Number(body.amount ?? req2.amount).toLocaleString("ko-KR")

  let adminMsg =
    `<b>결제 확인 완료</b>\n\n` +
    `신청번호: <code>${requestId}</code>\n` +
    `금액: <b>${amountStr}원</b>\n`

  if (selectedCard)   adminMsg += `선택 카드: ${selectedCard}\n`
  if (accountEmail)   adminMsg += `\n이메일: <code>${accountEmail}</code>`
  if (accountPw)      adminMsg += `\n비밀번호: <code>${accountPw}</code>`
  if (purchaseLink)   adminMsg += `\n\n구매 링크:\n${purchaseLink}`

  const adminButtons = purchaseLink
    ? [[{ text: "구매 링크 열기", url: purchaseLink }]]
    : []

  // 관리자 채널로 전송
  if (BOT_TOKEN) {
    // 마스터 채널
    if (settings?.telegramChatId) {
      await sendPayTelegramMessage(BOT_TOKEN, settings.telegramChatId, adminMsg, adminButtons).catch(() => null)
    }
    // 충전 전용 채널
    await sendPayTelegramMessage(BOT_TOKEN, PAY_CHAT_ID, adminMsg, adminButtons).catch(() => null)
  }

  // 담당 관리자 채널
  if (req2.managerId && BOT_TOKEN) {
    const [mgr] = await payDb.select().from(payManagers).where(eq(payManagers.id, req2.managerId))
    if (mgr?.telegramBotToken && mgr.telegramChatId) {
      await sendPayTelegramMessage(mgr.telegramBotToken, mgr.telegramChatId, adminMsg, adminButtons).catch(() => null)
    }
  }

  // ── 유저에게 구매 링크 전달 ───────────────────────────────────────────────
  if (BOT_TOKEN && purchaseLink) {
    const { payMembers } = await import("@/lib/pay/db/schema")
    const tgId = req2.telegramId ?? ""
    if (tgId) {
      const [member] = await payDb.select().from(payMembers).where(eq(payMembers.telegramId, tgId))
      const userChatId = member?.botChatId ?? tgId

      let userMsg =
        `<b>결제가 준비되었습니다!</b>\n\n` +
        `신청번호: <code>${requestId}</code>\n` +
        `금액: <b>${amountStr}원</b>\n`

      if (selectedCard)  userMsg += `\n선택 카드: ${selectedCard}`
      if (accountEmail)  userMsg += `\n이메일: <code>${accountEmail}</code>`
      if (accountPw)     userMsg += `\n비밀번호: <code>${accountPw}</code>`
      if (purchaseLink)  userMsg += `\n\n구매 링크:\n${purchaseLink}`

      await sendPayTelegramMessage(
        BOT_TOKEN, userChatId, userMsg,
        purchaseLink ? [[{ text: "구매하러 가기", url: purchaseLink }]] : []
      ).catch(() => null)
    }
  }

  return NextResponse.json({ ok: true })
}
