"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { eq, desc, and } from "drizzle-orm"
import { nanoid } from "nanoid"
import { payAuth } from "./auth"
import { payDb } from "./db"
import {
  payManagers, payRequests, payMasterSettings, payMembers,
} from "./db/schema"
import { sendPayTelegramMessage } from "./telegram"

// ── helpers ──────────────────────────────────────────────────────────────────

async function getManagerId() {
  const session = await payAuth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

async function getMasterSettings() {
  const rows = await payDb.select().from(payMasterSettings).where(eq(payMasterSettings.id, "1"))
  return rows[0] ?? null
}

// ── 관리자 설정 ──────────────────────────────────────────────────────────────

export async function getManagerSettings() {
  const id = await getManagerId()
  const rows = await payDb.select().from(payManagers).where(eq(payManagers.id, id))
  return rows[0] ?? null
}

export async function saveManagerSettings(data: {
  telegramBotToken: string
  telegramChatId: string
}) {
  const id = await getManagerId()

  // unique_code: 이미 있으면 유지
  const existing = await payDb.select().from(payManagers).where(eq(payManagers.id, id))
  if (existing.length === 0) {
    await payDb.insert(payManagers).values({
      id,
      uniqueCode: nanoid(8),
      telegramBotToken: data.telegramBotToken,
      telegramChatId:   data.telegramChatId,
    })
  } else {
    await payDb.update(payManagers)
      .set({ telegramBotToken: data.telegramBotToken, telegramChatId: data.telegramChatId })
      .where(eq(payManagers.id, id))
  }
  revalidatePath("/payments/panel")
  return { ok: true }
}

// ── 관리자: 신청 목록 ─────────────────────────────────────────────────────────

export async function getManagerRequests() {
  const id = await getManagerId()
  return payDb
    .select()
    .from(payRequests)
    .where(eq(payRequests.managerId, id))
    .orderBy(desc(payRequests.createdAt))
    .limit(100)
}

export async function confirmRequest(requestId: string) {
  const managerId = await getManagerId()
  const manager   = await payDb.select().from(payManagers).where(eq(payManagers.id, managerId))
  const mgr = manager[0]

  await payDb.update(payRequests)
    .set({ status: "manager_confirmed", managerConfirmedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(payRequests.id, requestId), eq(payRequests.managerId, managerId)))

  // 마스터에게 알림
  const masterSettings = await getMasterSettings()
  const [req] = await payDb.select().from(payRequests).where(eq(payRequests.id, requestId))
  if (masterSettings?.telegramBotToken && masterSettings.telegramChatId && req) {
    const managerCode = mgr?.uniqueCode ?? "unknown"
    await sendPayTelegramMessage(
      masterSettings.telegramBotToken,
      masterSettings.telegramChatId,
      `<b>관리자 확인 완료</b>\n관리자: ${managerCode}\n사이트 ID: <code>${req.siteId}</code>\n추천코드: <code>${req.referralCode}</code>\n금액: <b>${req.amount.toLocaleString("ko-KR")}원</b>`,
      [[{ text: "정산 완료 처리", callback_data: `pay_settle:${requestId}` }]],
    )
  }

  revalidatePath("/payments/panel")
  return { ok: true }
}

// ── 마스터: 전체 신청 ─────────────────────────────────────────────────────────

export async function getAllRequests() {
  return payDb
    .select()
    .from(payRequests)
    .orderBy(desc(payRequests.createdAt))
    .limit(200)
}

export async function masterSettleRequest(requestId: string) {
  await payDb.update(payRequests)
    .set({
      settlementStatus: "settled",
      settlementDate:   new Date(),
      status:           "completed",
      completedAt:      new Date(),
      updatedAt:        new Date(),
    })
    .where(eq(payRequests.id, requestId))
  revalidatePath("/payments/master")
  return { ok: true }
}

export async function getMasterSettingsAction() {
  return getMasterSettings()
}

export async function saveMasterSettings(data: {
  telegramBotToken: string
  telegramChatId: string
}) {
  const existing = await payDb.select().from(payMasterSettings).where(eq(payMasterSettings.id, "1"))
  if (existing.length === 0) {
    await payDb.insert(payMasterSettings).values({
      id: "1",
      telegramBotToken: data.telegramBotToken,
      telegramChatId:   data.telegramChatId,
    })
  } else {
    await payDb.update(payMasterSettings)
      .set({ telegramBotToken: data.telegramBotToken, telegramChatId: data.telegramChatId, updatedAt: new Date() })
      .where(eq(payMasterSettings.id, "1"))
  }
  return { ok: true }
}

export async function getAllManagers() {
  return payDb.select().from(payManagers).orderBy(desc(payManagers.createdAt))
}

// ── 미니앱: 신청 접수 ─────────────────────────────────────────────────────────

export async function submitPayRequest(data: {
  siteId:            string
  amount:            number
  managerId:         string | null | undefined
  walletAddress?:    string
  chain?:            string
  telegramId?:       string
  telegramUsername?: string
  telegramInput?:    string  // 익명 유저가 직접 입력한 텔레그램 아이디
}) {
  const id = nanoid()

  await payDb.insert(payRequests).values({
    id,
    siteId:           data.siteId,
    referralCode:     "",
    walletAddress:    data.walletAddress,
    chain:            data.chain ?? "TRX",
    telegramInput:    data.telegramInput,
    amount:           data.amount,
    managerId:        data.managerId ?? null,
    telegramId:       data.telegramId,
    telegramUsername: data.telegramUsername,
    status:           "pending",
    settlementStatus: "pending",
  })

  // ── dissig.com 외부 웹훅 호출 ──────────────────────────────────────
  const webhookUrl = process.env.WEBHOOK_URL ?? "https://www.dissig.com/api/webhooks/order"
  const applyAt = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "long",
    day: "numeric", hour: "2-digit", minute: "2-digit",
  })
  // username이 있으면 @username (클릭 가능)
  // username이 없고 숫자 ID만 있으면 tg://user?id= 딥링크 (클릭 가능)
  // telegramInput은 직접 입력한 @username
  const tgWhoDisplay = data.telegramUsername
    ? `@${data.telegramUsername}`
    : data.telegramInput
      ? `@${data.telegramInput}`
      : data.telegramId
        ? `<a href="tg://user?id=${data.telegramId}">ID: ${data.telegramId}</a>`
        : "-"
  // webhook payload에는 plain text 전달
  const tgWho = data.telegramUsername
    ? `@${data.telegramUsername}`
    : data.telegramInput
      ? `@${data.telegramInput}`
      : data.telegramId ?? ""

  const webhookPayload = {
    applyNo:       id,
    siteId:        tgWho,          // 사이트 ID 대신 텔레그램 계정 전달
    recommendCode: "",
    amount:        String(data.amount),
    telegram:      tgWho,
    applyAt,
    walletAddress: data.walletAddress ?? "",
    chain:         data.chain ?? "TRX",
  }

  const webhookHeaders: Record<string, string> = { "Content-Type": "application/json" }
  if (process.env.WEBHOOK_SECRET) webhookHeaders["x-webhook-secret"] = process.env.WEBHOOK_SECRET

  // webhook 응답에서 계정 정보 추출 (dissig이 email/password/link 반환)
  let webhookAccount: { email?: string; password?: string; link?: string } | null = null
  let webhookRawRes = ""
  try {
    const webhookRes = await fetch(webhookUrl, {
      method: "POST",
      headers: webhookHeaders,
      body: JSON.stringify(webhookPayload),
    })
    webhookRawRes = await webhookRes.text()
    try {
      const parsed = JSON.parse(webhookRawRes)
      if (parsed?.email || parsed?.password || parsed?.link) {
        webhookAccount = {
          email:    parsed.email,
          password: parsed.password,
          link:     parsed.link ?? parsed.purchaseLink ?? parsed.url,
        }
      }
    } catch { /* JSON 파싱 실패 무시 */ }

    // webhook 결과 DB 저장
    await payDb.update(payRequests)
      .set({ webhookData: JSON.stringify({ status: webhookRes.ok ? "success" : `failed_${webhookRes.status}`, response: webhookRawRes }) })
      .where(eq(payRequests.id, id))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await payDb.update(payRequests)
      .set({ webhookData: JSON.stringify({ status: "error", error: msg }) })
      .where(eq(payRequests.id, id))
  }

  // ── 텔레그램 알림 ──────────────────────────────────────────────────
  const time = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
  const amountStr = data.amount.toLocaleString("ko-KR")

  // 기본 주문 정보
  let msgBody =
    `<b>새 충전 신청</b>\n\n` +
    `신청번호: <code>${id}</code>\n` +
    `금액: <b>${amountStr}원</b>\n` +
    `신청자 텔레그램: ${tgWhoDisplay}\n` +
    `신청일시: ${time}\n\n` +
    `체인: <b>${data.chain ?? "TRX"}</b>\n` +
    `지갑 주소: <code>${data.walletAddress ?? "-"}</code>`

  // dissig이 계정 정보를 반환한 경우 추가
  if (webhookAccount?.email || webhookAccount?.password || webhookAccount?.link) {
    msgBody += `\n\n<b>생성된 계정 정보</b>`
    if (webhookAccount.email)    msgBody += `\n이메일: <code>${webhookAccount.email}</code>`
    if (webhookAccount.password) msgBody += `\n비밀번호: <code>${webhookAccount.password}</code>`
    if (webhookAccount.link)     msgBody += `\n\n구매 링크:\n${webhookAccount.link}`
  }

  const buttons = [[
    { text: "확인 완료", callback_data: `pay_confirm:${id}` },
    { text: "거절",     callback_data: `pay_reject:${id}` },
  ]]

  // 알림을 보낼 채널 목록 수집 (중복 제거)
  const notifyTargets = new Map<string, { token: string; chatId: string }>()

  // 1) 관리자 채널
  if (data.managerId) {
    const [mgr] = await payDb.select().from(payManagers).where(eq(payManagers.id, data.managerId))
    if (mgr?.telegramBotToken && mgr.telegramChatId) {
      notifyTargets.set(mgr.telegramChatId, { token: mgr.telegramBotToken, chatId: mgr.telegramChatId })
    }
  }

  // 2) 마스터 채널 (DB 설정)
  const ms = await getMasterSettings()
  if (ms?.telegramBotToken && ms.telegramChatId) {
    notifyTargets.set(ms.telegramChatId, { token: ms.telegramBotToken, chatId: ms.telegramChatId })
  }

  // 3) 환경변수 fallback — DB에 설정이 없을 때도 항상 전송
  const envToken  = process.env.TELEGRAM_BOT_TOKEN
  const envChatId = process.env.TELEGRAM_CHAT_ID
  if (envToken && envChatId) {
    notifyTargets.set(envChatId, { token: envToken, chatId: envChatId })
  }

  // 실제 전송
  await Promise.allSettled(
    Array.from(notifyTargets.values()).map(({ token, chatId }) =>
      sendPayTelegramMessage(token, chatId, msgBody, buttons)
    )
  )

  return { ok: true, requestId: id }
}

export async function getManagerByCode(code: string) {
  const rows = await payDb.select().from(payManagers).where(eq(payManagers.uniqueCode, code))
  return rows[0] ?? null
}

/** 모달 임베드용: 환경변수 코드 or 첫 번째 관리자 반환 */
export async function getDefaultManager() {
  const defaultCode = process.env.PAY_DEFAULT_MANAGER_CODE
  if (defaultCode) {
    const rows = await payDb.select().from(payManagers).where(eq(payManagers.uniqueCode, defaultCode))
    if (rows[0]) return rows[0]
  }
  const all = await payDb.select().from(payManagers).orderBy(payManagers.createdAt).limit(1)
  return all[0] ?? null
}
