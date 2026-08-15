export const dynamic = "force-dynamic"
import "server-only"
import { verifyTelegramWidgetAuth } from "@/lib/telegram-auth"
import { getBotToken } from "@/lib/telegram"
import { upsertTelegramProfileAndIssueToken } from "@/lib/telegram-session"
import { NextResponse } from "next/server"

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

  const result = await upsertTelegramProfileAndIssueToken({
    id: String(body.id),
    firstName: body.first_name ?? "",
    lastName: body.last_name,
    username: body.username,
    photoUrl: body.photo_url,
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
