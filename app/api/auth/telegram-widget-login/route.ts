export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { deriveWalletAddress } from "@/lib/solana-wallet"
import { verifyTelegramWidgetAuth } from "@/lib/telegram-auth"
import { getBotToken } from "@/lib/telegram"
import jwt from "jsonwebtoken"
import { NextResponse } from "next/server"
import { randomUUID } from "crypto"

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? process.env.INTERNAL_SECRET ?? "fallback-secret"

interface WidgetPayload {
  id: number | string
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number | string
  hash: string
}

export async function POST(req: Request) {
  const body = (await req.json()) as WidgetPayload
  if (!body?.id || !body?.hash || !body?.auth_date) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }

  const botToken = getBotToken()
  if (!botToken) {
    return NextResponse.json({ error: "서버에 봇 토큰이 설정되지 않았습니다." }, { status: 500 })
  }

  const isValid = verifyTelegramWidgetAuth(body as unknown as Record<string, string | number>, botToken)
  if (!isValid) {
    return NextResponse.json({ error: "텔레그램 인증 서명이 유효하지 않습니다." }, { status: 401 })
  }

  const telegramId = String(body.id)
  const firstName = body.first_name ?? ""
  const lastName = body.last_name
  const username = body.username
  const photoUrl = body.photo_url

  // 1) 기존 telegram_id로 계정 조회
  const { data: existing } = await adminSupabase
    .from("profiles")
    .select("id, username, role, session_version")
    .eq("telegram_id", telegramId)
    .maybeSingle()

  let userId: string
  let appUsername: string
  let role: string

  if (existing) {
    userId = existing.id
    appUsername = existing.username
    role = existing.role

    await adminSupabase
      .from("profiles")
      .update({
        telegram_username: username ?? null,
        telegram_first_name: firstName || null,
        telegram_last_name: lastName ?? null,
        telegram_photo_url: photoUrl ?? null,
        telegram_linked_at: new Date().toISOString(),
      })
      .eq("id", userId)
  } else {
    const baseName = username ? `tg_${username}` : `tg_${telegramId}`
    let finalUsername = baseName
    const { data: dup } = await adminSupabase.from("profiles").select("id").eq("username", baseName).maybeSingle()
    if (dup) finalUsername = `${baseName}_${Date.now().toString(36)}`

    const uid = randomUUID()
    const email = `${uid}@noreply.app`
    const password = randomUUID()

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
    appUsername = finalUsername
    role = "user"

    let walletIndex: number | null = null
    let walletAddress: string | null = null
    if (process.env.SOLANA_HD_SEED) {
      const { data: maxRow } = await adminSupabase
        .from("profiles")
        .select("wallet_index")
        .not("wallet_index", "is", null)
        .order("wallet_index", { ascending: false })
        .limit(1)
        .single()
      walletIndex = (maxRow?.wallet_index ?? -1) + 1
      walletAddress = deriveWalletAddress(walletIndex)
    }

    const profileData: Record<string, unknown> = {
      id: userId,
      username: finalUsername,
      role: "user",
      telegram_id: telegramId,
      telegram_username: username ?? null,
      telegram_first_name: firstName || null,
      telegram_last_name: lastName ?? null,
      telegram_photo_url: photoUrl ?? null,
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

    const chatId = process.env.TELEGRAM_CHAT_ID
    if (chatId) {
      const msg = `신규 텔레그램 위젯 가입\n이름: ${firstName}${lastName ? " " + lastName : ""}\n@${username ?? telegramId}\nID: ${telegramId}`
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: msg }),
      }).catch(() => {})
    }
  }

  // session_version 증가 → 기존 세션 무효화
  const { data: profileForSv } = await adminSupabase
    .from("profiles")
    .select("session_version")
    .eq("id", userId)
    .single()
  const nextSv = ((profileForSv as any)?.session_version ?? 0) + 1
  await adminSupabase.from("profiles").update({ session_version: nextSv }).eq("id", userId)

  const appToken = jwt.sign({ sub: userId, sv: nextSv, role }, JWT_SECRET, { expiresIn: "30d" })

  const response = NextResponse.json({ token: appToken, username: appUsername, role })
  response.cookies.set("app_token", appToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}
