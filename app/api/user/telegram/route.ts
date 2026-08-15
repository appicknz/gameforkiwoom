export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

/**
 * Telegram identity must only be written from Telegram-verified server paths:
 * the bot webhook deep-link flow or the signed Mini App login route.
 */
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 })
  }

  return NextResponse.json(
    { error: "Telegram 앱에서 연동을 완료해 주세요." },
    { status: 403 },
  )
}
