import { NextRequest, NextResponse } from "next/server"
import { eq, or } from "drizzle-orm"
import { payDb } from "@/lib/pay/db"
import { payMembers } from "@/lib/pay/db/schema"

/** 프론트에서 봇 시작 완료 여부를 폴링하는 엔드포인트
 *  tgId: 숫자 ID 또는 @없는 username 모두 허용
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tgId = searchParams.get("tgId")
  if (!tgId) return NextResponse.json({ started: false })

  // 숫자면 telegram_id, 문자면 username으로 조회
  const isNumeric = /^\d+$/.test(tgId)
  const [member] = await payDb
    .select({ botChatId: payMembers.botChatId })
    .from(payMembers)
    .where(
      isNumeric
        ? eq(payMembers.telegramId, tgId)
        : or(eq(payMembers.username, tgId), eq(payMembers.username, `@${tgId}`))
    )
    .limit(1)

  return NextResponse.json({ started: !!(member?.botChatId) })
}
