/**
 * DEPRECATED — Railway WS 게이트웨이로 이전됨
 * 클라이언트: hooks/use-gateway.ts → useGatewayOdds
 *
 * 이전: 유저 1명당 Vercel Function 1개 상시 점유 (동시 1,000명 = Function 1,000개)
 * 이후: Railway 단일 프로세스가 수만 WebSocket 연결 처리
 *
 * odds 캐시 갱신은 /api/game/odds/refresh (Railway → Vercel POST) 에서 담당
 */
export const dynamic = "force-dynamic"

export function GET() {
  return new Response(
    JSON.stringify({ error: "Deprecated. Use Railway WebSocket gateway." }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
}
