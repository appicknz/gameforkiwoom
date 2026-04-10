import { adminSupabase } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"

async function getUserFromToken(token: string) {
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await anonClient.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const FIXED_ODDS = 3.0

async function buildStats(gameType: "baccarat" | "race", roundId: string) {
  const poolKey    = `pool:${gameType}:${roundId}`
  const userSetKey = `users:${gameType}:${roundId}`

  const [pools, userIds] = await Promise.all([
    redis.hgetall(poolKey).catch(() => null),
    redis.smembers(userSetKey).catch(() => []),
  ])

  const poolData = gameType === "baccarat"
    ? {
        player: Number((pools as Record<string, unknown>)?.player ?? 0) || 0,
        banker: Number((pools as Record<string, unknown>)?.banker ?? 0) || 0,
        tie:    Number((pools as Record<string, unknown>)?.tie    ?? 0) || 0,
      }
    : {
        bit:  Number((pools as Record<string, unknown>)?.bit  ?? 0) || 0,
        coin: Number((pools as Record<string, unknown>)?.coin ?? 0) || 0,
        tie:  Number((pools as Record<string, unknown>)?.tie  ?? 0) || 0,
      }

  const userCount = Array.isArray(userIds) ? userIds.length : 0
  const totalBet  = Object.values(poolData).reduce((a, b) => a + b, 0)

  // 고정 배당 (LP/파리뮤추얼 제거) — odds는 항상 3.0x
  const odds = gameType === "baccarat"
    ? { player: FIXED_ODDS, banker: FIXED_ODDS, tie: FIXED_ODDS }
    : { bit: FIXED_ODDS, coin: FIXED_ODDS, tie: FIXED_ODDS }

  return {
    round: roundId,
    gameType,
    timestamp: new Date().toISOString(),
    pools: poolData,
    userCount,
    totalBet,
    feeRate: 0.20,
    odds,
  }
}

export async function GET(request: Request) {
  try {
    const url   = new URL(request.url)
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const authUser = await getUserFromToken(token)
    if (!authUser) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const { data: profile } = await adminSupabase
      .from("profiles").select("role").eq("id", authUser.id).single()
    if (!profile || !["master", "super_admin", "branch_admin"].includes(profile.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const nowSec = Math.floor(Date.now() / 1000)
    const baccaratRound = url.searchParams.get("roundId") || String(Math.floor(nowSec / 30))
    const raceRound     = String(Math.floor(nowSec / 300))

    const [baccarat, race] = await Promise.all([
      buildStats("baccarat", baccaratRound),
      buildStats("race",     raceRound),
    ])

    return NextResponse.json({ baccarat, race })
  } catch (error) {
    console.error("[round-stats] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
