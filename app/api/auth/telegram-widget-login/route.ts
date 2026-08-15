export const dynamic = "force-dynamic"
import "server-only"

import { NextResponse } from "next/server"
import { getTelegramBotToken, issueTelegramSession, verifyTelegramWidgetAuth } from "@/lib/telegram-auth"

// PC/일반 브라우저의 "텔레그램으로 바로 시작하기".
// Telegram Login Widget이 사용자의 실제 텔레그램 앱(데스크톱/모바일)에 로그인 승인 알림을 보내고,
// 사용자가 승인하면 서명된 사용자 정보(hash 포함)를 이 라우트로 전달해 검증합니다.
// https://core.telegram.org/widgets/login#checking-authorization
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || (typeof body.id !== "number" && typeof body.id !== "string") || typeof body.hash !== "string") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }

  const { hash, ...rest } = body as Record<string, unknown>
  const payload: Record<string, string> = {}
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== null) payload[key] = String(value)
  }

  const botToken = getTelegramBotToken()
  const isValid = verifyTelegramWidgetAuth(payload, hash, botToken)
  if (!isValid) {
    return NextResponse.json({ error: "텔레그램 인증 서명이 유효하지 않습니다." }, { status: 401 })
  }

  // 재생 공격 방지: auth_date가 1일 이상 지난 요청은 거부
  const authDate = Number(payload.auth_date ?? 0)
  if (!authDate || Date.now() / 1000 - authDate > 60 * 60 * 24) {
    return NextResponse.json({ error: "인증 시간이 만료되었습니다. 다시 시도해주세요." }, { status: 401 })
  }

  return issueTelegramSession({
    id: payload.id,
    username: payload.username,
    first_name: payload.first_name ?? "텔레그램 사용자",
    last_name: payload.last_name,
    photo_url: payload.photo_url,
  })
}
