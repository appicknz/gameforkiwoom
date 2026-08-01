import { NextRequest, NextResponse } from "next/server"

const PAY_CHAT_ID = "-1004471984422"

export async function POST(req: NextRequest) {
  const { message, buttonText, buttonUrl } = await req.json()

  if (!message?.trim()) {
    return NextResponse.json({ error: "메시지를 입력하세요." }, { status: 400 })
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "봇 토큰이 설정되지 않았습니다." }, { status: 500 })
  }

  const body: Record<string, unknown> = {
    chat_id:    PAY_CHAT_ID,
    text:       message,
    parse_mode: "HTML",
  }

  // 버튼 텍스트와 URL이 모두 있을 때만 인라인 키보드 추가
  if (buttonText?.trim() && buttonUrl?.trim()) {
    body.reply_markup = {
      inline_keyboard: [[{ text: buttonText.trim(), url: buttonUrl.trim() }]],
    }
  }

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  })

  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json({ error: data.description ?? "전송 실패" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
