import { adminSupabase as supabase } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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
  const channel = `balance:${userId}`

  const encoder = new TextEncoder()
  let closed = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let subscriber: any = null

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

      // 2) Pub/Sub 구독 — publish 시에만 동작, 폴링 없음
      try {
        subscriber = redis.subscribe([channel])

        subscriber.on("message", async (msg: { channel: string; message: unknown }) => {
          if (closed) return
          // publish 페이로드가 직접 잔고값이거나 { balance } 형태
          const raw = msg.message
          if (typeof raw === "number") {
            send({ balance: raw })
          } else if (raw && typeof raw === "object" && "balance" in (raw as object)) {
            send(raw as object)
          } else {
            // fallback: Redis에서 최신값 읽기
            const latest = await redis.get<number>(balanceKey)
            if (latest !== null) send({ balance: latest })
          }
        })

        // keepalive — SSE 연결을 30초마다 ping으로 유지
        const pingTimer = setInterval(() => {
          if (closed) { clearInterval(pingTimer); return }
          try { controller.enqueue(encoder.encode(": ping\n\n")) } catch {}
        }, 30_000)

        request.signal.addEventListener("abort", async () => {
          closed = true
          clearInterval(pingTimer)
          try { await subscriber?.unsubscribe?.() } catch {}
          try { controller.close() } catch {}
        })
      } catch {
        // Pub/Sub 실패 시 3초 폴링으로 fallback
        const versionKey = `balance_version:${userId}`
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
            controller.enqueue(encoder.encode(": ping\n\n"))
          } catch { clearInterval(interval) }
        }, 3_000)

        request.signal.addEventListener("abort", () => {
          closed = true
          clearInterval(interval)
          try { controller.close() } catch {}
        })
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
