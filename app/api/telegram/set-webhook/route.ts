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

  const token = process.env.TELEGRAM_BOT_TOKEN ?? "8850131651:AAEEvBYRa5dym7lC3To2ajbjLpcVUmMyvlI"

  // 요청 호스트에서 동적으로 URL 구성 (배포 URL이 바뀌어도 항상 올바른 URL)
  const host    = req.headers.get("host") ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL
  const appUrl  = host ? (host.startsWith("http") ? host : `https://${host}`) : null
  if (!appUrl) {
    return NextResponse.json({ error: "앱 URL을 확인할 수 없습니다" }, { status: 500 })
  }

  const webhookUrl = `${appUrl}/api/telegram/betting-webhook`

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

  const token = process.env.TELEGRAM_BOT_TOKEN ?? "8850131651:AAEEvBYRa5dym7lC3To2ajbjLpcVUmMyvlI"

  const res  = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
  const data = await res.json()
  return NextResponse.json(data.result ?? data)
}
