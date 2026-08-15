import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { Redis } from "@upstash/redis"
import { verifySession } from "@/lib/auth"
import { adminSupabase } from "@/lib/supabase-admin"
import { getBotToken } from "@/lib/telegram"

export const dynamic = "force-dynamic"

const redis = Redis.fromEnv()
const LINK_TTL_SECONDS = 10 * 60

type TelegramProfile = {
  telegram_id: string | null
  telegram_username: string | null
  telegram_linked_at?: string | null
}

export async function POST(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
  }

  const { data: profileData, error: profileError } = await adminSupabase
    .from("profiles")
    .select("telegram_id, telegram_username")
    .eq("id", session.userId)
    .single()
  const profile = profileData as TelegramProfile | null

  if (profileError) {
    return NextResponse.json({ error: "회원 정보를 확인할 수 없습니다." }, { status: 500 })
  }
  if (profile?.telegram_id) {
    return NextResponse.json({
      linked: true,
      telegramUsername: profile.telegram_username ?? null,
    })
  }

  const botResponse = await fetch(`https://api.telegram.org/bot${getBotToken()}/getMe`, {
    cache: "no-store",
  })
  const botData = await botResponse.json().catch(() => null)
  const botUsername = botData?.ok ? botData.result?.username : null
  if (!botUsername) {
    return NextResponse.json({ error: "Telegram 봇 정보를 확인할 수 없습니다." }, { status: 503 })
  }

  const token = randomBytes(24).toString("base64url")
  await redis.set(`telegram:link:${token}`, session.userId, { ex: LINK_TTL_SECONDS, nx: true })

  return NextResponse.json({
    linked: false,
    url: `https://t.me/${botUsername}?start=${token}`,
    expiresIn: LINK_TTL_SECONDS,
  })
}

export async function GET(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
  }

  const { data: profileData, error } = await adminSupabase
    .from("profiles")
    .select("telegram_id, telegram_username, telegram_linked_at")
    .eq("id", session.userId)
    .single()
  const profile = profileData as TelegramProfile | null

  if (error) {
    return NextResponse.json({ error: "연동 상태를 확인할 수 없습니다." }, { status: 500 })
  }

  return NextResponse.json({
    linked: Boolean(profile?.telegram_id),
    telegramUsername: profile?.telegram_username ?? null,
    linkedAt: profile?.telegram_linked_at ?? null,
  })
}
