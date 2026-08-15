export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { redis } from "@/lib/redis"
import { getBotUsername, getJoinChannelUsername } from "@/lib/telegram"

const TOKEN_TTL_SECONDS = 5 * 60 // 5분

/**
 * PC/일반 브라우저에서 "텔레그램으로 시작하기" 클릭 시 호출.
 * 임시 로그인 토큰을 발급하고, 사용자의 텔레그램 앱(데스크톱/모바일)을 여는 딥링크를 반환합니다.
 * 사용자가 봇 채팅에서 /start를 누르면 웹훅(betting-webhook)이 이 토큰을 소비해 로그인을 완료합니다.
 */
export async function POST() {
  const botUsername = await getBotUsername()
  if (!botUsername) {
    return NextResponse.json({ error: "텔레그램 봇 설정을 확인할 수 없습니다." }, { status: 500 })
  }

  const token = randomBytes(16).toString("hex")

  // Upstash Redis 클라이언트는 객체를 자동으로 JSON 직렬화/역직렬화합니다.
  await redis.set(
    `tglogin:${token}`,
    { status: "pending", createdAt: Date.now() },
    { ex: TOKEN_TTL_SECONDS },
  )

  return NextResponse.json({
    token,
    deepLink: `https://t.me/${botUsername}?start=${token}`,
    joinChannelUrl: `https://t.me/${getJoinChannelUsername()}`,
    expiresIn: TOKEN_TTL_SECONDS,
  })
}
