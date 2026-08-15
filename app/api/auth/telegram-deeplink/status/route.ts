export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { redis } from "@/lib/redis"

interface LoginState {
  status: "pending" | "join_required" | "done"
  createdAt: number
  appToken?: string
  username?: string
  role?: string
}

/**
 * 프론트엔드가 2초 간격으로 폴링하는 딥링크 로그인 상태 조회 엔드포인트.
 * status === "done"인 경우 1회만 응답하고 즉시 토큰을 폐기합니다(재사용 방지).
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get("token")
  if (!token) {
    return NextResponse.json({ status: "expired" }, { status: 400 })
  }

  const key = `tglogin:${token}`
  const state = await redis.get<LoginState>(key)
  if (!state) {
    return NextResponse.json({ status: "expired" })
  }

  if (state.status === "done") {
    await redis.del(key) // 1회성 소비 — 폴링 응답이 재사용/유출되어도 재로그인 불가
    return NextResponse.json({
      status: "done",
      token: state.appToken,
      username: state.username,
      role: state.role,
    })
  }

  return NextResponse.json({ status: state.status })
}
