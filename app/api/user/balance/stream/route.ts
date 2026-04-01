import { adminSupabase as supabase } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token =
    request.headers.get("Authorization")?.replace("Bearer ", "") ??
    url.searchParams.get("token")

  if (!token) return new Response("Unauthorized", { status: 401 })

  const { data: userData, error } = await supabase.auth.getUser(token)
  if (error || !userData?.user?.id) {
    return new Response("Invalid token", { status: 401 })
  }

  const userId = userData.user.id
  const balanceKey = `balance:${userId}`
  const versionKey = `balance_version:${userId}`

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      // 1) 연결 즉시 현재 잔고 전송
      const cached = await redis.get<number>(balanceKey)
      if (cached !== null) {
        send({ balance: cached })
      } else {
        const { data: bal } = await supabase
          .from("balances")
          .select("amount")
          .eq("user_id", userId)
          .single()
        if (bal) {
          await redis.set(balanceKey, bal.amount, { ex: 3600 })
          send({ balance: bal.amount })
        }
      }

      // 2) 버전 카운터 폴링 — incr 발생 시 즉시 잔고 push
      let lastVersion = (await redis.get<number>(versionKey)) ?? 0

      const interval = setInterval(async () => {
        if (closed) { clearInterval(interval); return }
        try {
          const version = (await redis.get<number>(versionKey)) ?? 0
          if (version !== lastVersion) {
            lastVersion = version
            const newBalance = await redis.get<number>(balanceKey)
            if (newBalance !== null) send({ balance: newBalance })
          }
          // keepalive ping
          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch {
          clearInterval(interval)
        }
      }, 2_000)

      request.signal.addEventListener("abort", () => {
        closed = true
        clearInterval(interval)
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
