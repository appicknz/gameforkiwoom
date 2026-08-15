export const dynamic = "force-dynamic"
import "server-only"
import { verifyTelegramIdToken } from "@/lib/telegram-oidc"
import { getBotToken } from "@/lib/telegram"
import { upsertTelegramProfileAndIssueToken } from "@/lib/telegram-session"
import { NextResponse } from "next/server"

/**
 * 신규 텔레그램 OIDC 로그인 (core.telegram.org/bots/telegram-login)
 * 클라이언트(telegram-login.js)가 돌려준 id_token은 서버에서 JWKS로
 * 서명을 검증한 뒤에만 신뢰한다. client_id(=bot id)와 aud가 일치해야 통과.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id_token?: string } | null
  const idToken = body?.id_token
  if (!idToken) {
    return NextResponse.json({ error: "id_token이 없습니다." }, { status: 400 })
  }

  const botToken = getBotToken()
  const botId = botToken.split(":")[0]
  if (!botId) {
    return NextResponse.json({ error: "서버에 봇 토큰이 설정되지 않았습니다." }, { status: 500 })
  }

  const claims = await verifyTelegramIdToken(idToken, botId)
  if (!claims) {
    return NextResponse.json({ error: "텔레그램 id_token 서명이 유효하지 않습니다." }, { status: 401 })
  }

  const result = await upsertTelegramProfileAndIssueToken({
    id: String(claims.id),
    firstName: claims.given_name ?? claims.name ?? "",
    lastName: claims.family_name,
    username: claims.preferred_username,
    photoUrl: claims.picture,
  })

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  const response = NextResponse.json({ token: result.appToken, username: result.username, role: result.role })
  response.cookies.set("app_token", result.appToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}
