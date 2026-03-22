import { NextResponse } from "next/server"

/**
 * 서버 시간 반환 - 클라이언트 타이머 동기화용
 * 클라이언트가 이 값과 로컬 Date.now()의 차이(offset)를 계산해서
 * 기기마다 다른 시스템 시계를 서버 시간 기준으로 보정합니다.
 */
export async function GET() {
  return NextResponse.json({ serverTime: Date.now() })
}
