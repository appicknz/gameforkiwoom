/**
 * DEPRECATED — Railway WS 게이트웨이로 이전됨
 * 클라이언트: hooks/use-gateway.ts → useGatewayBalance
 */
export const dynamic = "force-dynamic"

export function GET() {
  return new Response(
    JSON.stringify({ error: "Deprecated. Use Railway WebSocket gateway." }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
}
