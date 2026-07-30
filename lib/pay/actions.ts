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
  siteId:       string
  referralCode: string
  amount:       number
  managerId:    string
  telegramId?:  string
  telegramUsername?: string
}) {
  const id = nanoid()

  await payDb.insert(payRequests).values({
    id,
    siteId:           data.siteId,
    referralCode:     data.referralCode,
    amount:           data.amount,
    managerId:        data.managerId,
    telegramId:       data.telegramId,
    telegramUsername: data.telegramUsername,
    status:           "pending",
    settlementStatus: "pending",
  })

  // 관리자 텔레그램 알림
  const [mgr] = await payDb.select().from(payManagers).where(eq(payManagers.id, data.managerId))
  if (mgr?.telegramBotToken && mgr.telegramChatId) {
    await sendPayTelegramMessage(
      mgr.telegramBotToken,
      mgr.telegramChatId,
      `<b>새 충전 신청</b>\n사이트 ID: <code>${data.siteId}</code>\n추천코드: <code>${data.referralCode}</code>\n금액: <b>${data.amount.toLocaleString("ko-KR")}원</b>\n신청자: ${data.telegramUsername ? "@" + data.telegramUsername : data.telegramId ?? "미니앱"}`,
      [[
        { text: "확인 완료", callback_data: `pay_confirm:${id}` },
        { text: "거절",     callback_data: `pay_reject:${id}` },
      ]],
    )
  }

  return { ok: true, requestId: id }
}

export async function getManagerByCode(code: string) {
  const rows = await payDb.select().from(payManagers).where(eq(payManagers.uniqueCode, code))
  return rows[0] ?? null
}
