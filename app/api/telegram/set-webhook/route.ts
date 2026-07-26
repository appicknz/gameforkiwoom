import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

/**
 * POST /api/telegram/set-webhook
 * 텔레그램 봇 웹훅을 배팅 웹훅 URL로 등록합니다.
 * 패널에서 master가 호출하면 됩니다.
 */
export async function POST(req: Request) {
  const session = await verifySession(req)
  if (!session.ok || session.role !== "master") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN 미설정" }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL
  if (!appUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL 미설정" }, { status: 500 })
  }

  const webhookUrl = `${appUrl.startsWith("http") ? appUrl : `https://${appUrl}`}/api/telegram/betting-webhook`

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ["callback_query", "message"],
      drop_pending_updates: true,
    }),
  })

  const data = await res.json()
  return NextResponse.json({ ok: data.ok, description: data.description, webhookUrl })
}

/** GET /api/telegram/set-webhook — 현재 웹훅 정보 조회 */
export async function GET(req: Request) {
  const session = await verifySession(req)
  if (!session.ok || session.role !== "master") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN 미설정" }, { status: 500 })

  const res  = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
  const data = await res.json()
  return NextResponse.json(data.result ?? data)
}
