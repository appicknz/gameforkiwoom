import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { payDb } from "@/lib/pay/db"
import { payMembers } from "@/lib/pay/db/schema"

/** 프론트에서 봇 시작 완료 여부를 폴링하는 엔드포인트 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tgId = searchParams.get("tgId")
  if (!tgId) return NextResponse.json({ started: false })

  const [member] = await payDb
    .select({ botChatId: payMembers.botChatId })
    .from(payMembers)
    .where(eq(payMembers.telegramId, tgId))
    .limit(1)

  return NextResponse.json({ started: !!(member?.botChatId) })
}
