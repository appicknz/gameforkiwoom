export const dynamic = "force-dynamic"
import "server-only"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

// 클라이언트가 주기적으로 호출해 세션 유효성 확인
// 다른 기기에서 로그인해 session_version이 올라가면 401 반환 → 강제 로그아웃
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) {
    return NextResponse.json({ valid: false }, { status: 401 })
  }
  return NextResponse.json({ valid: true })
}
