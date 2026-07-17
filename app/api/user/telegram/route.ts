export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { sendTelegramMessage } from "@/lib/telegram"

export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  const body = await req.json()
  const {
    telegram_id,
    telegram_username,
    telegram_first_name,
    telegram_last_name,
    telegram_photo_url,
  } = body

  if (!telegram_id) {
    return NextResponse.json({ error: "telegram_id 필수" }, { status: 400 })
  }

  // 이미 연동된 경우 중복 저장하지 않음 (변경 있을 때만 업데이트)
  const { data: current } = await adminSupabase
    .from("profiles")
    .select("username, telegram_id, telegram_username")
    .eq("id", auth.userId)
    .single()

  if (current?.telegram_id === String(telegram_id) &&
      current?.telegram_username === (telegram_username ?? null)) {
    return NextResponse.json({ ok: true, updated: false })
  }

  const { error } = await adminSupabase
    .from("profiles")
    .update({
      telegram_id:         String(telegram_id),
      telegram_username:   telegram_username   ?? null,
      telegram_first_name: telegram_first_name ?? null,
      telegram_last_name:  telegram_last_name  ?? null,
      telegram_photo_url:  telegram_photo_url  ?? null,
      telegram_linked_at:  new Date().toISOString(),
    })
    .eq("id", auth.userId)

  if (error) {
    console.error("[user/telegram] DB error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 최초 연동 시 관리자 알림
  if (!current?.telegram_id) {
    const name = [telegram_first_name, telegram_last_name].filter(Boolean).join(" ") || telegram_first_name || "-"
    const msg = `<b>텔레그램 계정 연동</b>

회원: ${current?.username ?? auth.userId}
이름: ${name}
텔레그램: ${telegram_username ? `@${telegram_username}` : "-"}
ID: ${telegram_id}
연동일시: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`
    await sendTelegramMessage(msg).catch(() => {})
  }

  return NextResponse.json({ ok: true, updated: true })
}
