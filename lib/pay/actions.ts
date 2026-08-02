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
  telegramBotToken?: string
  telegramChatId?:   string
  webhookUrl?:       string
  webhookSecret?:    string
  siteId?:           string
  tgBtnText?:        string
  tgBtnUrl?:         string
}) {
  const existing = await payDb.select().from(payMasterSettings).where(eq(payMasterSettings.id, "1"))
  const base = existing[0] ?? {}
  const payload = {
    telegramBotToken: data.telegramBotToken ?? (base as { telegramBotToken?: string }).telegramBotToken ?? "",
    telegramChatId:   data.telegramChatId   ?? (base as { telegramChatId?: string }).telegramChatId   ?? "",
    webhookUrl:       data.webhookUrl    !== undefined ? (data.webhookUrl    || null) : ((base as { webhookUrl?: string }).webhookUrl    ?? null),
    webhookSecret:    data.webhookSecret !== undefined ? (data.webhookSecret || null) : ((base as { webhookSecret?: string }).webhookSecret ?? null),
    siteId:           data.siteId        !== undefined ? (data.siteId        || null) : ((base as { siteId?: string }).siteId        ?? null),
    tgBtnText:        data.tgBtnText     !== undefined ? (data.tgBtnText     || null) : ((base as { tgBtnText?: string }).tgBtnText     ?? null),
    tgBtnUrl:         data.tgBtnUrl      !== undefined ? (data.tgBtnUrl      || null) : ((base as { tgBtnUrl?: string }).tgBtnUrl      ?? null),
    updatedAt:        new Date(),
  }
  if (existing.length === 0) {
    await payDb.insert(payMasterSettings).values({ id: "1", ...payload })
  } else {
    await payDb.update(payMasterSettings).set(payload).where(eq(payMasterSettings.id, "1"))
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
  // 마스터 설정에서 webhookUrl, webhookSecret, siteId 가져오기
  const masterCfg = await getMasterSettings()
  const webhookUrl    = masterCfg?.webhookUrl    ?? process.env.WEBHOOK_URL ?? "https://www.dissig.com/api/webhooks/order"
  const webhookSecret = masterCfg?.webhookSecret ?? process.env.WEBHOOK_SECRET ?? ""
  const siteId        = masterCfg?.siteId        ?? data.siteId ?? ""

  const applyAt = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "long",
    day: "numeric", hour: "2-digit", minute: "2-digit",
  })

  // 텔레그램 표시용 (HTML)
  const tgWhoDisplay = data.telegramUsername
    ? `@${data.telegramUsername}`
    : data.telegramInput
      ? `@${data.telegramInput}`
      : data.telegramId
        ? `<a href="tg://user?id=${data.telegramId}">ID: ${data.telegramId}</a>`
        : "-"
  // webhook payload용 plain text
  const tgWho = data.telegramUsername
    ? `@${data.telegramUsername}`
    : data.telegramInput
      ? `@${data.telegramInput}`
      : data.telegramId ?? ""

  // 스펙에 맞는 payload (recommendCode 빈 문자열, walletAddress/chain 포함)
  const webhookPayload = {
    applyNo:       id,
    siteId,
    recommendCode: "",                  // 없으면 빈 문자열 (스펙 호환)
    amount:        String(data.amount),
    telegram:      tgWho,
    applyAt,
    walletAddress: data.walletAddress ?? "",
    chain:         data.chain ?? "TRX",
  }

  const webhookHeaders: Record<string, string> = { "Content-Type": "application/json" }
  if (webhookSecret) webhookHeaders["x-webhook-secret"] = webhookSecret

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
      // dissig이 즉시 응답에 계정 정보를 포함하는 경우
      if (parsed?.email || parsed?.password || parsed?.link || parsed?.purchaseLink) {
        webhookAccount = {
          email:    parsed.email    ?? parsed.accountEmail,
          password: parsed.password ?? parsed.accountPassword,
          link:     parsed.link     ?? parsed.purchaseLink ?? parsed.paymentUrl ?? parsed.url,
        }
      }
    } catch { /* JSON 파싱 실패 무시 */ }

    // webhook 결과 DB 저장 (copyText는 나중에 병합)
    await payDb.update(payRequests)
      .set({ webhookData: JSON.stringify({
        status:   webhookRes.ok ? "success" : `failed_${webhookRes.status}`,
        response: webhookRawRes,
        // 계정 정보가 즉시 반환된 경우 함께 저장
        ...(webhookAccount ? {
          purchaseLink:    webhookAccount.link     ?? null,
          accountEmail:    webhookAccount.email    ?? null,
          accountPassword: webhookAccount.password ?? null,
        } : {}),
      }) })
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

  // ── 봇 → 유저 먼저 메시지 전송 (양방향 채널 확보) ────────────────────
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ""
  if (BOT_TOKEN && data.telegramId) {
    // pay_members에서 bot_chat_id 조회
    const [member] = await payDb.select().from(payMembers)
      .where(eq(payMembers.telegramId, data.telegramId))
      .limit(1)

    const userChatId = member?.botChatId ?? data.telegramId  // fallback: telegramId === chatId인 경우도 있음

    const userMsg =
      `<b>충전 신청이 접수되었습니다.</b>\n\n` +
      `신청번호: <code>${id}</code>\n` +
      `금액: <b>${data.amount.toLocaleString("ko-KR")}원</b>\n` +
      `체인: ${data.chain ?? "TRX"} | 지갑: <code>${data.walletAddress ?? "-"}</code>\n\n` +
      `아래 버튼을 클릭하여 메세지 복사 후 @cdpaysys 로 전달해 주세요. 전송이 시작됩니다.\n` +
      `<i>*미 전달 시 대기열 그룹에 포함되어 대기 상태로 남습니다.</i>`

    // 복사용 plain text (버튼 클릭 시 봇이 별도 전송)
    const copyText =
      `충전 신청이 접수되었습니다.\n\n` +
      `신청번호: ${id}\n` +
      `금액: ${data.amount.toLocaleString("ko-KR")}원\n` +
      `체인: ${data.chain ?? "TRX"} | 지갑: ${data.walletAddress ?? "-"}`

    // DB 설정에서 인라인 버튼 텍스트/URL 가져오기
    const btnText = masterCfg?.tgBtnText?.trim()
    const btnUrl  = masterCfg?.tgBtnUrl?.trim()

    const userButtons: ({ text: string; callback_data: string } | { text: string; url: string })[][] = [[
      { text: "메세지 복사하기", callback_data: `copy_msg:${id}` },
      ...(btnText && btnUrl ? [{ text: btnText, url: btnUrl }] : []),
    ]]

    await sendPayTelegramMessage(BOT_TOKEN, userChatId, userMsg, userButtons).catch(() => null)

    // 복사용 텍스트를 기존 webhookData에 병합 저장 (덮어쓰지 않음)
    const [existing] = await payDb.select({ webhookData: payRequests.webhookData })
      .from(payRequests).where(eq(payRequests.id, id))
    let prevData: Record<string, unknown> = {}
    try { prevData = JSON.parse(existing?.webhookData ?? "{}") } catch { /* ignore */ }
    await payDb.update(payRequests)
      .set({ webhookData: JSON.stringify({ ...prevData, copyText }) })
      .where(eq(payRequests.id, id))
      .catch(() => null)
  }

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

  // 3) 충전 전용 채널 고정 (자동매매 채널과 분리)
  const envToken       = process.env.TELEGRAM_BOT_TOKEN
  const PAY_CHAT_ID    = "-1004471984422"   // 충전 전용 텔레그램 채널
  if (envToken) {
    notifyTargets.set(PAY_CHAT_ID, { token: envToken, chatId: PAY_CHAT_ID })
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
