import { NextResponse } from "next/server"

// DB 조회 제거 — 인메모리 방식으로 전환. 더 이상 DB 호출 없음.
export async function GET() {
  return NextResponse.json({ rounds: [] })
}
