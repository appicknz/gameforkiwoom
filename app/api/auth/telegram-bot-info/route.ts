import { NextResponse } from "next/server"
import { getBotToken } from "@/lib/telegram"

/**
 * GET /api/auth/telegram-bot-info
 * 로그인 위젯이 항상 "실제로 사용 중인 봇"의 username을 쓰도록
 * 서버에 설정된 TELEGRAM_BOT_TOKEN 기준으로 username을 조회해 내려준다.
 * (코드에 봇 이름을 하드코딩하면 BotFather에 등록한 도메인과 어긋날 수 있음)
 */
export async function GET() {
  try {
    const token = getBotToken()
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const data = await res.json()
    if (!data.ok || !data.result?.username) {
      return NextResponse.json({ username: null }, { status: 200 })
    }
    return NextResponse.json({ username: data.result.username as string })
  } catch {
    return NextResponse.json({ username: null }, { status: 200 })
  }
}
