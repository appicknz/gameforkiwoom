export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { deriveWalletAddress } from "@/lib/solana-wallet"
import {
  JWT_SECRET,
  getTelegramBotToken,
  issueTelegramSession,
  verifyTelegramInitData,
} from "@/lib/telegram-auth"
import jwt from "jsonwebtoken"
import { NextResponse } from "next/server"
import { randomUUID } from "crypto"

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

// 이 라우트는 텔레그램 Mini App(WebApp) 안에서 열렸을 때만 사용됩니다.
// (일반 PC/모바일 브라우저의 "텔레그램으로 바로 시작하기"는 telegram-widget-login을 사용합니다.)
export async function POST(req: Request) {
  const { initData } = await req.json()

  // initData가 없으면 임시 닉네임으로 익명 계정 즉시 생성
  if (!initData) {
    return handleAnonymousLogin()
  }

  const botToken = getTelegramBotToken()

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

  return issueTelegramSession({
    id: tgUser.id,
    username: tgUser.username,
    first_name: tgUser.first_name,
    last_name: tgUser.last_name,
    photo_url: tgUser.photo_url,
  })
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
