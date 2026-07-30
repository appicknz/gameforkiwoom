export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { deriveWalletAddress } from "@/lib/solana-wallet"
import { createHmac } from "crypto"
import jwt from "jsonwebtoken"
import { NextResponse } from "next/server"
import { randomUUID } from "crypto"

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? process.env.INTERNAL_SECRET ?? "fallback-secret"

// Telegram initData 서명 검증 (BOT_TOKEN 기반 HMAC-SHA256)
function verifyTelegramInitData(initData: string, botToken: string): boolean {
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

// initData에서 user 파싱
function parseTelegramUser(initData: string) {
  try {
    const params = new URLSearchParams(initData)
    const raw = params.get("user")
    if (!raw) return null
    return JSON.parse(decodeURIComponent(raw)) as {
      id: number
      first_name: string
      last_name?: string
      username?: string
      photo_url?: string
    }
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const { initData } = await req.json()

  // initData가 없으면 임시 닉네임으로 익명 계정 즉시 생성
  if (!initData) {
    return handleAnonymousLogin()
  }

  // 구버전 토큰 감지 후 최신 토큰으로 fallback
  const CURRENT_BOT_TOKEN = "8850131651:AAEEvBYRa5dym7lC3To2ajbjLpcVUmMyvlI"
  const rawToken = process.env.TELEGRAM_BOT_TOKEN ?? ""
  const botToken = rawToken.startsWith("8902") ? CURRENT_BOT_TOKEN : (rawToken || CURRENT_BOT_TOKEN)

  // 서명 검증 (개발 환경 제외)
  const isDev = process.env.NODE_ENV !== "production"
  const isValid = isDev || verifyTelegramInitData(initData, botToken)
  if (!isValid) {
    return NextResponse.json({ error: "텔레그램 인증 실패" }, { status: 401 })
  }

  const tgUser = parseTelegramUser(initData)
  // tgUser가 없어도 익명 처리 (PC 텔레그램 등 initData는 있지만 user 파싱 실패)
  if (!tgUser?.id) {
    return handleAnonymousLogin()
  }

  const telegramId = String(tgUser.id)

  // 1) 기존 telegram_id로 계정 조회
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
      telegram_username: tgUser.username ?? null,
      telegram_first_name: tgUser.first_name ?? null,
      telegram_last_name: tgUser.last_name ?? null,
      telegram_photo_url: tgUser.photo_url ?? null,
      telegram_linked_at: new Date().toISOString(),
    }).eq("id", userId)
  } else {
    // 신규 계정 자동 생성
    // username: tg_사용자명 or tg_텔레그램ID
    const baseName = tgUser.username
      ? `tg_${tgUser.username}`
      : `tg_${telegramId}`

    // 중복 방지: 이미 있으면 숫자 suffix
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
      telegram_username: tgUser.username ?? null,
      telegram_first_name: tgUser.first_name ?? null,
      telegram_last_name: tgUser.last_name ?? null,
      telegram_photo_url: tgUser.photo_url ?? null,
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
      const msg = `신규 텔레그램 가입\n이름: ${tgUser.first_name}${tgUser.last_name ? " " + tgUser.last_name : ""}\n@${tgUser.username ?? telegramId}\nID: ${telegramId}`
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
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

// 텔레그램 initData 없이 버튼만 눌렀을 때: 임의 닉네임 익명 계정 즉시 생성
async function handleAnonymousLogin(): Promise<NextResponse> {
  const uid = randomUUID()
  const suffix = uid.replace(/-/g, "").slice(0, 6)
  const username = `user_${suffix}`
  const email    = `${uid}@noreply.app`
  const password = randomUUID()

  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  })
  if (authError || !authData?.user) {
    return NextResponse.json({ error: "계정 생성 실패: " + (authError?.message ?? "") }, { status: 500 })
  }

  const userId = authData.user.id
  const role   = "user"

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
    username,
    role,
  }
  if (walletIndex !== null) profileData.wallet_index = walletIndex
  if (walletAddress !== null) profileData.wallet_address = walletAddress

  const { error: profileError } = await adminSupabase.from("profiles").upsert(profileData)
  if (profileError) {
    await adminSupabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: "프로필 저장 실패: " + profileError.message }, { status: 500 })
  }

  await adminSupabase.from("balances").upsert({ user_id: userId, amount: 0 })

  const appToken = jwt.sign(
    { sub: userId, sv: 1, role },
    JWT_SECRET,
    { expiresIn: "30d" }
  )

  const res = NextResponse.json({ token: appToken, username, role })
  res.cookies.set("app_token", appToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
