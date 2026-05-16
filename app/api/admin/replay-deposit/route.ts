export const dynamic = "force-dynamic"
/**
 * POST /api/admin/replay-deposit
 * master/super_admin 전용 — 미반영 입금 수동 재처리 프록시
 * INTERNAL_SECRET을 서버에서 직접 붙여 /api/deposit/replay 를 호출
 */
import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    )
    return payload.sub ?? null
  } catch { return null }
}

export async function POST(req: Request) {
  // 1) 인증
  const token    = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""
  const callerId = decodeJwtSub(token)
  if (!callerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: caller } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .single()

  if (!caller || !["master", "super_admin"].includes(caller.role)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  // 2) 요청에서 signature 추출
  const { signature } = await req.json().catch(() => ({}))
  if (!signature) return NextResponse.json({ error: "signature required" }, { status: 400 })

  // 3) 내부 replay API 호출 (INTERNAL_SECRET을 서버에서 붙임)
  const baseUrl = process.env.VERCEL_URL?.startsWith("https://")
    ? process.env.VERCEL_URL
    : `https://${process.env.VERCEL_URL}`

  const replayRes = await fetch(`${baseUrl}/api/deposit/replay`, {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-internal-secret": process.env.INTERNAL_SECRET ?? "tasko-internal",
    },
    body: JSON.stringify({ signature }),
  }).catch(() => null)

  if (!replayRes) return NextResponse.json({ error: "replay 서버 연결 실패" }, { status: 502 })

  const data = await replayRes.json().catch(() => ({}))
  if (!replayRes.ok) return NextResponse.json(data, { status: replayRes.status })

  return NextResponse.json(data)
}
