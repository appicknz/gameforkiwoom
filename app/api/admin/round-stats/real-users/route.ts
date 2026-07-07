export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { redis } from "@/lib/redis"
import { adminSupabase } from "@/lib/supabase-admin"
import { cookies } from "next/headers"

function decodeJwtUserId(token: string): string | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    )
    if (!payload.sub) return null
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload.sub as string
  } catch { return null }
}

async function requireAdmin(req: Request): Promise<boolean> {
  let token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? null
  if (!token) {
    const cookieStore = await cookies()
    token = cookieStore.get("app_token")?.value ?? null
  }
  if (!token) return false
  const userId = decodeJwtUserId(token)
  if (!userId) return false
  const { data } = await adminSupabase.from("profiles").select("role").eq("id", userId).single()
  const profile = data as { role: string } | null
  const adminRoles = ["master", "super_admin", "admin", "superadmin", "branch_admin"]
  return !!profile && adminRoles.includes(profile.role)
}

// 봇 유저명 패턴 — "사용자2" ~ "사용자101"
const BOT_USERNAMES = new Set(Array.from({ length: 100 }, (_, i) => `사용자${i + 2}`))

export async function GET(request: Request) {
  const ok = await requireAdmin(request)
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const nowSec     = Math.floor(Date.now() / 1000)
  const bacRound   = Math.floor(nowSec / 30)
  const raceRound  = Math.floor(nowSec / 180)

  // 현재 라운드 참여 유저 목록 (Redis Set)
  const [bacMembers, raceMembers] = await Promise.all([
    redis.smembers(`users:baccarat:${bacRound}`).catch(() => [] as string[]),
    redis.smembers(`users:race:${raceRound}`).catch(() => [] as string[]),
  ])

  // 봇 userId 목록 조회
  const allBotProfiles = await adminSupabase
    .from("profiles")
    .select("id, username")
    .in("username", Array.from(BOT_USERNAMES))
  const botIds = new Set((allBotProfiles.data ?? []).map((p: { id: string }) => p.id))

  // 실제 유저만 필터
  const realBacIds  = (bacMembers  as string[]).filter(id => !botIds.has(id))
  const realRaceIds = (raceMembers as string[]).filter(id => !botIds.has(id))

  // 실제 유저 프로필 조회
  const allRealIds = [...new Set([...realBacIds, ...realRaceIds])]
  const profilesRes = allRealIds.length > 0
    ? await adminSupabase.from("profiles").select("id, username").in("id", allRealIds)
    : { data: [] }
  const profileMap = Object.fromEntries(
    ((profilesRes.data ?? []) as { id: string; username: string }[]).map(p => [p.id, p.username])
  )

  // 배팅 데이터 조회 (bet:bets + bet:active oddsAtBet 함께 반환)
  const buildBets = async (ids: string[], gameType: "baccarat" | "race", round: number) => {
    const bets = await Promise.all(ids.map(async id => {
      const [raw, activeRaw] = await Promise.all([
        redis.get<string>(`bet:bets:${gameType}:${round}:${id}`).catch(() => null),
        redis.get<string>(`bet:active:${gameType}:${round}:${id}`).catch(() => null),
      ])
      if (!raw) return null
      const b = typeof raw === "string" ? JSON.parse(raw) : raw
      const side   = b.baccaratSide ?? b.raceSide ?? null
      const amount = b.baccaratAmount ?? b.raceAmount ?? 0
      if (!side) return null

      // bet:active에서 배팅 시점 lock된 배율 추출
      let oddsAtBet: Record<string, number> | null = null
      if (activeRaw) {
        try {
          const active = typeof activeRaw === "string" ? JSON.parse(activeRaw) : activeRaw
          if (active?.oddsAtBet) oddsAtBet = active.oddsAtBet
        } catch {}
      }

      return {
        userId: id,
        username: profileMap[id] ?? id,
        gameType,
        side,
        amount,
        round,
        ts: Date.now(),
        oddsAtBet, // 배팅 시점 lock 배율 (null이면 이전 방식으로 처리)
      }
    }))
    return bets.filter(Boolean)
  }

  const [bacBets, raceBets] = await Promise.all([
    buildBets(realBacIds,  "baccarat", bacRound),
    buildBets(realRaceIds, "race",     raceRound),
  ])

  return NextResponse.json({
    bets: [...bacBets, ...raceBets],
    counts: {
      baccarat: realBacIds.length,
      race:     realRaceIds.length,
    },
  })
}
