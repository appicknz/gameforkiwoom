import "server-only"

import { createHash, createHmac, randomUUID } from "crypto"
import jwt from "jsonwebtoken"
import { NextResponse } from "next/server"

import { adminSupabase } from "@/lib/supabase-admin"
import { deriveWalletAddress } from "@/lib/solana-wallet"

export const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? process.env.INTERNAL_SECRET ?? "fallback-secret"

// 구버전(만료된) 봇 토큰이 환경변수에 남아있을 경우를 대비한 폴백
const FALLBACK_BOT_TOKEN = "8850131651:AAEEvBYRa5dym7lC3To2ajbjLpcVUmMyvlI"

export function getTelegramBotToken(): string {
  const rawToken = process.env.TELEGRAM_BOT_TOKEN ?? ""
  return rawToken.startsWith("8902") ? FALLBACK_BOT_TOKEN : (rawToken || FALLBACK_BOT_TOKEN)
}

/**
 * Telegram Mini App(WebApp) initData 서명 검증
 * secret = HMAC-SHA256("WebAppData", botToken)
 */
export function verifyTelegramInitData(initData: string, botToken: string): boolean {
  try {
    const params = new URLSearchParams(initData)
    const hash = params.get("hash")
    if (!hash) return false

    params.delete("hash")
    const sorted = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n")

    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest()
    const expectedHash = createHmac("sha256", secretKey).update(sorted).digest("hex")
    return expectedHash === hash
  } catch {
    return false
  }
}

/**
 * Telegram Login Widget 서명 검증
 * secret = SHA256(botToken)
 * https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramWidgetAuth(payload: Record<string, string>, hash: string, botToken: string): boolean {
  try {
    if (!hash) return false
    const sorted = Object.keys(payload)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => `${k}=${payload[k]}`)
      .join("\n")

    const secretKey = createHash("sha256").update(botToken).digest()
    const expectedHash = createHmac("sha256", secretKey).update(sorted).digest("hex")
    return expectedHash === hash
  } catch {
    return false
  }
}

export interface TelegramSessionInput {
  id: string | number
  username?: string | null
  first_name?: string | null
  last_name?: string | null
  photo_url?: string | null
}

/**
 * 텔레그램 사용자 정보를 기존/신규 프로필에 연결하고 앱 세션(JWT + 쿠키)을 발급합니다.
 * initData 로그인, Login Widget 로그인이 공통으로 사용합니다.
 */
export async function issueTelegramSession(tg: TelegramSessionInput): Promise<NextResponse> {
  const telegramId = String(tg.id)

  const { data: existing } = await adminSupabase
    .from("profiles")
    .select("id, username, role, session_version")
    .eq("telegram_id", telegramId)
    .maybeSingle()

  let userId: string
  let username: string
  let role: string

  if (existing) {
    // 기존 계정 — 텔레그램 정보 갱신
    userId = existing.id
    username = existing.username
    role = existing.role

    await adminSupabase.from("profiles").update({
      telegram_username: tg.username ?? null,
      telegram_first_name: tg.first_name ?? null,
      telegram_last_name: tg.last_name ?? null,
      telegram_photo_url: tg.photo_url ?? null,
      telegram_linked_at: new Date().toISOString(),
    }).eq("id", userId)
  } else {
    // 신규 계정 자동 생성
    const baseName = tg.username ? `tg_${tg.username}` : `tg_${telegramId}`

    let finalUsername = baseName
    const { data: dup } = await adminSupabase
      .from("profiles").select("id").eq("username", baseName).maybeSingle()
    if (dup) finalUsername = `${baseName}_${Date.now().toString(36)}`

    const uid = randomUUID()
    const email = `${uid}@noreply.app`
    const password = randomUUID() // 임의 비밀번호 (텔레그램 전용 계정)

    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: finalUsername },
    })
    if (authError || !authData.user) {
      return NextResponse.json({ error: "계정 생성 실패: " + (authError?.message ?? "") }, { status: 500 })
    }

    userId = authData.user.id
    username = finalUsername
    role = "user"

    // HD 지갑 주소 할당
    let walletIndex: number | null = null
    let walletAddress: string | null = null
    if (process.env.SOLANA_HD_SEED) {
      const { data: maxRow } = await adminSupabase
        .from("profiles").select("wallet_index")
        .not("wallet_index", "is", null)
        .order("wallet_index", { ascending: false })
        .limit(1).single()
      walletIndex = (maxRow?.wallet_index ?? -1) + 1
      walletAddress = deriveWalletAddress(walletIndex)
    }

    const profileData: Record<string, unknown> = {
      id: userId,
      username: finalUsername,
      role: "user",
      telegram_id: telegramId,
      telegram_username: tg.username ?? null,
      telegram_first_name: tg.first_name ?? null,
      telegram_last_name: tg.last_name ?? null,
      telegram_photo_url: tg.photo_url ?? null,
      telegram_linked_at: new Date().toISOString(),
    }
    if (walletIndex !== null) profileData.wallet_index = walletIndex
    if (walletAddress !== null) profileData.wallet_address = walletAddress

    const { error: profileError } = await adminSupabase.from("profiles").upsert(profileData)
    if (profileError) {
      await adminSupabase.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: "프로필 저장 실패: " + profileError.message }, { status: 500 })
    }

    await adminSupabase.from("balances").upsert({ user_id: userId, amount: 0 })

    // 관리자 알림 (TELEGRAM_CHAT_ID가 있을 때)
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (chatId) {
      const msg = `신규 텔레그램 가입\n이름: ${tg.first_name ?? ""}${tg.last_name ? " " + tg.last_name : ""}\n@${tg.username ?? telegramId}\nID: ${telegramId}`
      fetch(`https://api.telegram.org/bot${getTelegramBotToken()}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: msg }),
      }).catch(() => {})
    }
  }

  // session_version 증가 → 기존 세션 무효화
  const { data: profileForSv } = await adminSupabase
    .from("profiles").select("session_version").eq("id", userId).single()
  const nextSv = ((profileForSv as any)?.session_version ?? 0) + 1
  await adminSupabase.from("profiles").update({ session_version: nextSv }).eq("id", userId)

  // app_token 발행 (30일)
  const appToken = jwt.sign(
    { sub: userId, sv: nextSv, role },
    JWT_SECRET,
    { expiresIn: "30d" }
  )

  const response = NextResponse.json({ token: appToken, username, role })
  response.cookies.set("app_token", appToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}
