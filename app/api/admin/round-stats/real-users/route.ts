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

// 봇 유저명 패턴
const BOT_USERNAMES = new Set(Array.from({ length: 100 }, (_, i) => `사용자${i + 2}`))

// 최근 N개 라운드 (현재 포함)
const ROUND_HISTORY = 10

export async function GET(request: Request) {
  const ok = await requireAdmin(request)
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const nowSec      = Math.floor(Date.now() / 1000)
  const curBacRound = Math.floor(nowSec / 30)
  const curRaceRound = Math.floor(nowSec / 180)

  // 조회할 라운드 범위
  const bacRounds  = Array.from({ length: ROUND_HISTORY }, (_, i) => curBacRound  - i)
  const raceRounds = Array.from({ length: ROUND_HISTORY }, (_, i) => curRaceRound - i)

  // 봇 userId 목록
  const allBotProfiles = await adminSupabase
    .from("profiles")
    .select("id, username")
    .in("username", Array.from(BOT_USERNAMES))
  const botIds = new Set((allBotProfiles.data ?? []).map((p: { id: string }) => p.id))

  // 각 라운드 참여 유저 목록 + 게임 결과 + odds:final 병렬 조회
  const [bacMembersAll, raceMembersAll, bacResultsAll, raceResultsAll, bacOddsAll, raceOddsAll] = await Promise.all([
    Promise.all(bacRounds.map(r  => redis.smembers(`users:baccarat:${r}`).catch(() => [] as string[]))),
    Promise.all(raceRounds.map(r => redis.smembers(`users:race:${r}`).catch(() => [] as string[]))),
    Promise.all(bacRounds.map(r  => redis.get<string>(`game:result:baccarat:${r}`).catch(() => null))),
    Promise.all(raceRounds.map(r => redis.get<string>(`game:result:race:${r}`).catch(() => null))),
    Promise.all(bacRounds.map(r  => redis.get<string>(`odds:final:baccarat:${r}`).catch(() => null))),
    Promise.all(raceRounds.map(r => redis.get<string>(`odds:final:race:${r}`).catch(() => null))),
  ])

  // 전체 실제 유저 ID 수집
  const allRealIds = new Set<string>()
  bacMembersAll.forEach(members => (members as string[]).filter(id => !botIds.has(id)).forEach(id => allRealIds.add(id)))
  raceMembersAll.forEach(members => (members as string[]).filter(id => !botIds.has(id)).forEach(id => allRealIds.add(id)))

  // 프로필 조회
  const allRealIdsArr = Array.from(allRealIds)
  const profilesRes = allRealIdsArr.length > 0
    ? await adminSupabase.from("profiles").select("id, username").in("id", allRealIdsArr)
    : { data: [] }
  const profileMap = Object.fromEntries(
    ((profilesRes.data ?? []) as { id: string; username: string }[]).map(p => [p.id, p.username])
  )

  // 라운드별 배팅 데이터 조회
  type DebugLog = {
    serverOddsAfterBet: Record<string, number> | null  // 배팅 직후 서버 계산 배당
    finalOdds: Record<string, number> | null           // 정산에 사용된 확정 배당
    settledOdds: number | null                         // 해당 side 정산 배당
    payout: number | null                              // 실제 지급액
    result: "win" | "lose" | null
    settleSource: string | null                        // "settle/route.ts" or "settle-me/route.ts"
    oddsSource: string | null                          // "odds:final" | "odds:locked" | "odds:current" | "pool_fallback"
    placedAt: string | null
    settledAt: string | null
    pools: Record<string, number> | null               // 배팅 시점 pool 상태
  }

  type BetEntry = {
    userId: string; username: string; gameType: string
    side: string; amount: number; round: number; ts: number
    result: "win" | "lose" | "tie_refund" | null
    settleOdds: number | null
    winAmount: number | null
    gameResult: string | null
    debug: DebugLog | null
  }

  const buildRoundBets = async (
    ids: string[],
    gameType: "baccarat" | "race",
    round: number,
    gameResultRaw: string | null,
    oddsRaw: string | null,
  ): Promise<BetEntry[]> => {
    const realIds = ids.filter(id => !botIds.has(id))
    if (realIds.length === 0) return []

    // 게임 결과 파싱
    let gameWinner: string | null = null
    if (gameResultRaw) {
      try {
        const parsed = typeof gameResultRaw === "string" ? JSON.parse(gameResultRaw) : gameResultRaw
        gameWinner = parsed.baccaratResult ?? parsed.raceWinner ?? null
      } catch {}
    }

    // 확정 배당 파싱
    let finalOdds: Record<string, number> = {}
    if (oddsRaw) {
      try {
        const parsed = typeof oddsRaw === "string" ? JSON.parse(oddsRaw) : oddsRaw
        finalOdds = parsed?.player !== undefined || parsed?.bit !== undefined ? parsed : (parsed?.odds ?? {})
      } catch {}
    }

    const bets = await Promise.all(realIds.map(async id => {
      const [raw, debugRaw] = await Promise.all([
        redis.get<string>(`bet:bets:${gameType}:${round}:${id}`).catch(() => null),
        redis.get<string>(`bet:debug:${gameType}:${round}:${id}`).catch(() => null),
      ])
      if (!raw) return null
      const b = typeof raw === "string" ? JSON.parse(raw) : raw
      const side   = b.baccaratSide ?? b.raceSide ?? null
      const amount = b.baccaratAmount ?? b.raceAmount ?? 0
      if (!side) return null

      // 디버그 로그 파싱
      let debug: DebugLog | null = null
      if (debugRaw) {
        try {
          const d = typeof debugRaw === "string" ? JSON.parse(debugRaw) : debugRaw
          debug = {
            serverOddsAfterBet: d.serverOddsAfterBet ?? null,
            finalOdds:     d.finalOdds     ?? null,
            settledOdds:   d.settledOdds   ?? null,
            payout:        d.payout        ?? null,
            result:        d.result        ?? null,
            settleSource:  d.settleSource  ?? null,
            oddsSource:    d.oddsSource    ?? null,
            placedAt:      d.placedAt      ?? null,
            settledAt:     d.settledAt     ?? null,
            pools:         d.pools         ?? null,
          }
        } catch {}
      }

      // 표시용 settleOdds: 디버그 로그 확정 배당 > odds:final > null 순
      const settleOdds = debug?.settledOdds ?? finalOdds[side] ?? null

      // 승패 계산
      let result: "win" | "lose" | "tie_refund" | null = null
      let winAmount: number | null = null
      if (gameWinner !== null) {
        if (side === gameWinner) {
          result = "win"
          winAmount = debug?.payout ?? (settleOdds !== null ? Math.floor(amount * settleOdds) : null)
        } else if (gameWinner === "tie" && (side === "player" || side === "banker" || side === "bit" || side === "coin")) {
          result = "tie_refund"
          winAmount = amount
        } else {
          result = "lose"
          winAmount = 0
        }
      }

      return {
        userId: id,
        username: profileMap[id] ?? id,
        gameType,
        side,
        amount,
        round,
        ts: Date.now(),
        result,
        settleOdds,
        winAmount,
        gameResult: gameWinner,
        debug,
      } as BetEntry
    }))

    return bets.filter(Boolean) as BetEntry[]
  }

  // 바카라 / 레이스 전체 라운드 배팅 병렬 조회
  const [allBacBets, allRaceBets] = await Promise.all([
    Promise.all(bacRounds.map((r, i) =>
      buildRoundBets(bacMembersAll[i] as string[], "baccarat", r, bacResultsAll[i], bacOddsAll[i])
    )),
    Promise.all(raceRounds.map((r, i) =>
      buildRoundBets(raceMembersAll[i] as string[], "race", r, raceResultsAll[i], raceOddsAll[i])
    )),
  ])

  // 현재 라운드 참여자 수 (봇 제외)
  const realBacCount  = (bacMembersAll[0]  as string[]).filter(id => !botIds.has(id)).length
  const realRaceCount = (raceMembersAll[0] as string[]).filter(id => !botIds.has(id)).length

  return NextResponse.json({
    bets: [...allBacBets.flat(), ...allRaceBets.flat()],
    counts: {
      baccarat: realBacCount,
      race:     realRaceCount,
    },
    bacRounds,
    raceRounds,
  })
}
