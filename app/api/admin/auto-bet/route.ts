export const dynamic = "force-dynamic"
import { redis } from "@/lib/redis"
import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, branchToLpConfig, DEFAULT_LP_CONFIG } from "@/lib/lp-system"
import { cookies } from "next/headers"


/** JWT 로컬 디코딩 — 외부 HTTP 없이 즉시 userId 반환 */
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

async function requireAdmin(token: string | null, req?: Request) {
  if (!token && req) {
    const cookieStore = await cookies()
    token = cookieStore.get("app_token")?.value ?? null
  }
  if (!token) return null
  const userId = decodeJwtUserId(token)
  if (!userId) return null
  const { data: profileRaw } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single()
  const profile = profileRaw as { role: string } | null
  const adminRoles = ["master", "super_admin", "admin", "superadmin", "branch_admin"]
  if (!profile || !adminRoles.includes(profile.role)) return null
  return { id: userId }
}

// 자동배팅 유저 목록 (사용자2~101, 홀수=baccarat 50명, 짝수=race 50명)
const AUTO_BET_USERNAMES = Array.from({ length: 100 }, (_, i) => `사용자${i + 2}`)
const BET_AMOUNTS = [10000, 50000, 100000]
const BACCARAT_SIDES = ["player", "banker", "tie"] as const
const RACE_SIDES = ["bit", "coin", "tie"] as const

function randomPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── 봇 정산 로직 (GET 호출 시 직전 완료 라운드 자동 정산) ─────────
async function settlePendingBots(
  gameType: "baccarat" | "race",
  roundNumber: number,
  profiles: { id: string; username: string; branch_id: string | null }[]
) {
  if (roundNumber < 0) return { skipped: true, reason: "invalid round" }

  // ── 중복 정산 방어 (잠금은 실제 정산 성공 후에만 설정) ──────────
  const settleKey = `bot:settled:${gameType}:${roundNumber}`
  const alreadySettled = await redis.get(settleKey)
  if (alreadySettled) return { skipped: true }

  // ── 결과 조회 ────────────────────────────────────────────────────
  // 1차: settle/route.ts가 저장한 Redis 결과
  // 2차: btc_closing_prices DB (price-server가 매 30초 저장)
  let baccaratResult: "player" | "banker" | "tie" = "tie"
  let wonDirection: "long" | "short"              = "long"
  let wonDigit:     "under" | "over"              = "under"
  let wonParity:    "odd"   | "even"              = "odd"
  let raceWinner:   "bit"   | "coin" | "tie"      = "tie"

  const resultRaw = await redis.get<string>(`game:result:${gameType}:${roundNumber}`)
  if (resultRaw) {
    const gr       = typeof resultRaw === "string" ? JSON.parse(resultRaw) : resultRaw
    baccaratResult = gr.baccaratResult ?? "tie"
    wonDirection   = gr.wonDirection   ?? "long"
    wonDigit       = gr.wonDigit       ?? "under"
    wonParity      = gr.wonParity      ?? "odd"
    raceWinner     = gr.raceWinner     ?? "tie"
  } else {
    // 2차: DB에서 해당 라운드 closeTime = roundNumber * 30 (Unix초)
    const closeTime = roundNumber * 30
    const { data: rowRaw } = await adminSupabase
      .from("btc_closing_prices")
      .select("price, baccarat_result")
      .gte("time", closeTime - 29)
      .lte("time", closeTime + 30)
      .order("time", { ascending: false })
      .limit(1)
      .maybeSingle()
    const row = rowRaw as { price: number | string | null; baccarat_result: string | null } | null

    if (!row) {
      // 결과가 아직 없음 — 잠금 걸지 않고 return (다음 새로고침에서 재시도)
      return { skipped: true, reason: "no result in DB yet" }
    }

    const cp     = typeof row.price === "string" ? parseFloat(row.price) : (row.price as number)
    const decStr = cp.toFixed(2).split(".")[1] ?? "00"
    const d1     = parseInt(decStr[0] ?? "0")
    const d2     = parseInt(decStr[1] ?? "0")

    baccaratResult = (row.baccarat_result as "player" | "banker" | "tie") ?? (d1 === d2 ? "tie" : d1 > d2 ? "banker" : "player")
    wonDigit       = d2 <= 4 ? "under" : "over"
    wonParity      = d2 % 2 === 0 ? "even" : "odd"

    if (gameType === "race") {
      const scoreData = await redis.hgetall(`race:score:${roundNumber}`).catch(() => null)
      const bit  = parseInt((scoreData?.bit  as string) ?? "0") || 0
      const coin = parseInt((scoreData?.coin as string) ?? "0") || 0
      raceWinner = bit > coin ? "bit" : coin > bit ? "coin" : "tie"
    }
  }

  // ── 풀 배당 계산 ──────────────────────────────────────────────
  const poolKey   = `pool:${gameType}:${roundNumber}`
  const userSetKey = `users:${gameType}:${roundNumber}`
  const [poolData, userCount] = await Promise.all([
    redis.hgetall(poolKey).catch(() => null),
    redis.scard(userSetKey).catch(() => 0),
  ])

  let oddsSnap: Record<string, number> = {}
  if (gameType === "baccarat") {
    const pool = {
      player: parseInt((poolData?.player as string) ?? "0") || 0,
      banker: parseInt((poolData?.banker as string) ?? "0") || 0,
      tie:    parseInt((poolData?.tie    as string) ?? "0") || 0,
    }
    if (pool.player + pool.banker + pool.tie > 0) {
      const r = calcBaccaratOdds(pool, DEFAULT_LP_CONFIG, Number(userCount ?? 0))
      oddsSnap = { player: Number(r.playerOdds), banker: Number(r.bankerOdds), tie: Number(r.tieOdds) }
    }
  } else {
    const pool = {
      bit:  parseInt((poolData?.bit  as string) ?? "0") || 0,
      coin: parseInt((poolData?.coin as string) ?? "0") || 0,
      tie:  parseInt((poolData?.tie  as string) ?? "0") || 0,
    }
    if (pool.bit + pool.coin + pool.tie > 0) {
      const r = calcRaceOdds(pool, DEFAULT_LP_CONFIG, Number(userCount ?? 0))
      oddsSnap = { bit: Number(r.bitOdds), coin: Number(r.coinOdds), tie: Number(r.tieOdds) }
    }
  }

  const FIXED_ODDS  = 1.6
  const roundTo100  = (v: number) => Math.floor(v / 100) * 100
  let settledCount  = 0

  await Promise.all(profiles.map(async (p) => {
    // ── 배팅 데이터 찾기: 저장된 라운드 → roundNumber 순으로 탐색 ──
    const storedRound = await redis.get<number>(`bet:round:${gameType}:${p.id}`).catch(() => null)
    const candidates  = storedRound != null ? [Number(storedRound), roundNumber] : [roundNumber]

    let betsRaw: string | null = null
    let resolvedBetsKey        = `bet:bets:${gameType}:${roundNumber}:${p.id}`
    let resolvedRound          = roundNumber

    for (const rn of candidates) {
      const bk = `bet:bets:${gameType}:${rn}:${p.id}`
      const b  = await redis.get<string>(bk)
      if (b) { betsRaw = b; resolvedBetsKey = bk; resolvedRound = rn; break }
    }
    if (!betsRaw) return

    // ── 배팅 시점 odds snap 사용 (없으면 풀 기반 계산값 fallback) ──
    const oddsSnapKey = `odds:snap:${gameType}:${resolvedRound}:${p.id}`
    const oddsSnapRaw = await redis.get<string>(oddsSnapKey).catch(() => null)
    const userOddsSnap: Record<string, number> = oddsSnapRaw
      ? (typeof oddsSnapRaw === "string" ? JSON.parse(oddsSnapRaw) : oddsSnapRaw)
      : oddsSnap

    const bets      = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw
    const branchId  = p.branch_id ?? null
    let totalPayout = 0
    const historyRows: Record<string, unknown>[] = []

    if (gameType === "baccarat") {
      if (bets.direction && bets.directionAmount > 0) {
        const won    = bets.direction === wonDirection
        const payout = won ? roundTo100(bets.directionAmount * FIXED_ODDS) : 0
        totalPayout += payout
        historyRows.push({ user_id: p.id, branch_id: branchId, round_id: null, bet_direction: bets.direction, bet_digit: null, bet_parity: null, bet_amount: bets.directionAmount, payout, result: won ? "win" : "lose" })
      }
      if (bets.digit && bets.digitAmount > 0) {
        const won    = bets.digit === wonDigit
        const payout = won ? roundTo100(bets.digitAmount * FIXED_ODDS) : 0
        totalPayout += payout
        historyRows.push({ user_id: p.id, branch_id: branchId, round_id: null, bet_direction: null, bet_digit: bets.digit, bet_parity: null, bet_amount: bets.digitAmount, payout, result: won ? "win" : "lose" })
      }
      if (bets.parity && bets.parityAmount > 0) {
        const won    = bets.parity === wonParity
        const payout = won ? roundTo100(bets.parityAmount * FIXED_ODDS) : 0
        totalPayout += payout
        historyRows.push({ user_id: p.id, branch_id: branchId, round_id: null, bet_direction: null, bet_digit: null, bet_parity: bets.parity, bet_amount: bets.parityAmount, payout, result: won ? "win" : "lose" })
      }
      if (bets.baccaratSide && bets.baccaratAmount > 0) {
        const side   = bets.baccaratSide as "player" | "banker" | "tie"
        const won    = side === baccaratResult
        const odds   = userOddsSnap[side] ?? FIXED_ODDS
        const payout = won ? roundTo100(bets.baccaratAmount * odds) : 0
        totalPayout += payout
        historyRows.push({ user_id: p.id, branch_id: branchId, round_id: null, bet_direction: `baccarat_${side}`, bet_digit: null, bet_parity: null, bet_amount: bets.baccaratAmount, payout, result: won ? "win" : "lose" })
      }
    } else {
      if (bets.raceSide && bets.raceAmount > 0) {
        const side   = bets.raceSide as "bit" | "coin" | "tie"
        const won    = side === raceWinner
        const odds   = userOddsSnap[side] ?? FIXED_ODDS
        const payout = won ? roundTo100(bets.raceAmount * odds) : 0
        totalPayout += payout
        historyRows.push({ user_id: p.id, branch_id: branchId, round_id: null, bet_direction: `race_${side}`, bet_digit: null, bet_parity: null, bet_amount: bets.raceAmount, payout, result: won ? "win" : "lose" })
      }
    }

    if (historyRows.length === 0) return

    // ── bet_history INSERT ───────────────────────────────────────
    const { error: insertErr } = await (adminSupabase.from("bet_history") as any).insert(historyRows)
    if (insertErr) return  // INSERT 실패 시 잠금 설정 안 함 → 다음 호출에서 재시도

    // ── 승리 시 잔고 환급 ────────────────────────────────────────
    if (totalPayout > 0) {
      await (adminSupabase.rpc as Function)("add_balance_for_payout", { p_user_id: p.id, p_amount: totalPayout })
      await redis.incr(`balance_version:${p.id}`).catch(() => {})
    }

    // ── Redis 배팅 키 정리 ───────────────────────────────────────
    await Promise.all([
      redis.del(resolvedBetsKey).catch(() => {}),
      redis.del(oddsSnapKey).catch(() => {}),
      redis.del(`bet:round:${gameType}:${p.id}`).catch(() => {}),
    ])
    settledCount++
  }))

  // ── 정산 성공한 유저가 1명 이상일 때만 잠금 설정 ────────────────
  if (settledCount > 0) {
    await redis.set(settleKey, 1, { ex: 300 })
  }

  return { settled: settledCount, baccaratResult, raceWinner }
}

// GET: 자동배팅 유저 목록 + 잔고 조회
export async function GET(request: Request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? null
  const admin = await requireAdmin(token, request)
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profilesRaw } = await adminSupabase
    .from("profiles")
    .select("id, username, branch_id")
    .in("username", AUTO_BET_USERNAMES)
    .order("username")
  const profiles = (profilesRaw ?? []) as { id: string; username: string; branch_id: string | null }[]

  if (profiles.length === 0) {
    return NextResponse.json({ users: [] })
  }

  const userIds = profiles.map(p => p.id)
  const { data: balancesRaw } = await adminSupabase
    .from("balances")
    .select("user_id, amount")
    .in("user_id", userIds)
  const balances = (balancesRaw ?? []) as { user_id: string; amount: number }[]

  const balMap = Object.fromEntries(balances.map(b => [b.user_id, b.amount]))

  const nowSec = Math.floor(Date.now() / 1000)
  const baccaratRound = Math.floor(nowSec / 30)
  const raceRound     = Math.floor(nowSec / 180)

  // ── 직전 완료 라운드 자동 정산 (cron 대체) ─────────────────
  // 모든 봇 프로필을 바카라/레이스 양쪽에 넘김 (각 함수 내에서 배팅 키가 없으면 skip)
  await Promise.all([
    settlePendingBots("baccarat", baccaratRound - 1, profiles),
    settlePendingBots("race", raceRound - 1, profiles),
  ])

  // ── bet_history 전수 조회 (통계 집계 + 최근 정산 내역 동시 처리) ──
  const { data: allHistoryRaw } = await adminSupabase
    .from("bet_history")
    .select("user_id, bet_direction, bet_amount, payout, result, created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })  // 최신순 정렬
  const allHistory = (allHistoryRaw ?? []) as { user_id: string; bet_direction: string; bet_amount: number; payout: number; result: string; created_at: string }[]

  // ── 유저별 개인 통계 집계 + 최신 1건 추출 ──────────────────
  type UserStat = { winProfit: number; loss: number; winCount: number; loseCount: number; tieCount: number; fee: number }
  const perUserStats: Record<string, UserStat> = {}
  const lastHistoryMap: Record<string, { bet_direction: string; bet_amount: number; payout: number; result: string; created_at: string }> = {}

  for (const uid of userIds) {
    perUserStats[uid] = { winProfit: 0, loss: 0, winCount: 0, loseCount: 0, tieCount: 0, fee: 0 }
  }

  let totalWinProfit = 0
  let totalLoss      = 0
  let winCount       = 0
  let loseCount      = 0
  let tieCount       = 0

  for (const h of allHistory ?? []) {
    const s = perUserStats[h.user_id]
    if (!s) continue
    // 최신 1건 저장 (이미 desc 정렬되어 있으므로 첫 번째 만나는 것이 최신)
    if (!lastHistoryMap[h.user_id]) {
      lastHistoryMap[h.user_id] = h as any
    }
    s.fee += Math.floor(h.bet_amount * 0.2)
    if (h.result === "win") {
      s.winCount++; s.winProfit += (h.payout - h.bet_amount)
      winCount++; totalWinProfit += (h.payout - h.bet_amount)
    } else if (h.result === "lose") {
      s.loseCount++; s.loss += h.bet_amount
      loseCount++; totalLoss += h.bet_amount
    } else {
      s.tieCount++; tieCount++
    }
  }
  const totalBets = winCount + loseCount + tieCount
  const winRate   = totalBets > 0 ? Math.round((winCount / totalBets) * 1000) / 10 : 0
  const totalBalance = Object.values(balMap).reduce((s, v) => s + v, 0)
  const stats = { totalWinProfit, totalLoss, totalBalance, winRate, winCount, loseCount, tieCount, totalBets }

  // 각 유저의 현재 라운드 배팅 상태 조회 (Redis)
  const users = await Promise.all(profiles.map(async p => {
    const num = parseInt(p.username.replace("사용자", ""))
    const gameType = num % 2 !== 0 ? "baccarat" : "race"
    const round = gameType === "baccarat" ? baccaratRound : raceRound
    const betsKey = `bet:bets:${gameType}:${round}:${p.id}`
    const oddsKey = `odds:snap:${gameType}:${round}:${p.id}`
    const [betsRaw, oddsRaw] = await Promise.all([
      redis.get<string>(betsKey),
      redis.get<string>(oddsKey),
    ])
    const bets = betsRaw ? (typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw) : null
    const odds = oddsRaw ? (typeof oddsRaw === "string" ? JSON.parse(oddsRaw) : oddsRaw) : null
    const side = bets?.baccaratSide ?? bets?.raceSide ?? null
    const appliedOdds = (odds && side && typeof odds[side] === "number") ? odds[side] : null

    const last = lastHistoryMap[p.id] ?? null
    const lastSettled = last ? {
      direction: last.bet_direction,
      betAmount: last.bet_amount,
      payout: last.payout,
      profit: last.payout - last.bet_amount,   // 순수익 (환급포함 payout - 배팅액)
      result: last.result as "win" | "lose" | "tie",
      createdAt: last.created_at,
    } : null

    const us = perUserStats[p.id] ?? { winProfit: 0, loss: 0, winCount: 0, loseCount: 0, tieCount: 0, fee: 0 }
    const uTotalBets = us.winCount + us.loseCount + us.tieCount
    return {
      id: p.id,
      username: p.username,
      num,
      gameType,
      balance: balMap[p.id] ?? 0,
      currentRound: round,
      currentBet: bets ? { side, amount: bets.baccaratAmount ?? bets.raceAmount ?? 0, odds: appliedOdds } : null,
      lastSettled,
      userStats: {
        winProfit:  us.winProfit,
        loss:       us.loss,
        winRate:    uTotalBets > 0 ? Math.round((us.winCount / uTotalBets) * 1000) / 10 : 0,
        winCount:   us.winCount,
        loseCount:  us.loseCount,
        tieCount:   us.tieCount,
        totalBets:  uTotalBets,
        fee:        us.fee,
      },
    }
  }))

  return NextResponse.json({ users, stats })
}

// 페이즈 체크: 현재 시각이 배팅 가능 구간인지 확인
// 바카라 30초 라운드: 30→26초=정산(5초), 25→11초=배팅(15초), 10→0초=게임중(10초)
// secInRound는 라운드 내 경과초 (0~29)
// 라운드 시작(0초) 기준 게임중=0~9, 정산=20~24, 배팅=10~19 가 아니라
// "남은 시간" 기준으로 계산: 30 - secInRound = 남은 초
function isBettingPhase(gameType: "baccarat" | "race"): { allowed: boolean; secInRound: number; reason?: string } {
  const nowSec = Math.floor(Date.now() / 1000)
  if (gameType === "baccarat") {
    // 30초 라운드, secInRound = 경과초(0~29)
    // 남은 초 = 30 - secInRound
    // 배팅 구간: 남은 11초 ~ 25초 → secInRound 5~19
    // 게임중:    남은 0초  ~ 10초 → secInRound 20~29
    // 정산중:    남은 26초 ~ 30초 → secInRound 0~4
    const s = nowSec % 30
    if (s < 5)   return { allowed: false, secInRound: s, reason: `정산중 (secInRound=${s})` }
    if (s >= 20)  return { allowed: false, secInRound: s, reason: `게임중 (secInRound=${s})` }
    return { allowed: true, secInRound: s }
  } else {
    // 180초 라운드: 0~9초=정산, 10~59초=배팅, 60~179초=게임중
    const s = nowSec % 180
    if (s < 10)  return { allowed: false, secInRound: s, reason: `정산중 (secInRound=${s})` }
    if (s >= 60) return { allowed: false, secInRound: s, reason: `게임중 (secInRound=${s})` }
    return { allowed: true, secInRound: s }
  }
}

// 바카라 wave 정의 (secInRound 기준)
// secInRound 5 = 남은 25초 (배팅 시작) → wave 1 (30%)
// secInRound 10 = 남은 20초             → wave 2 (15%)
// secInRound 14 = 남은 16초             → wave 3 (15%)
// secInRound 17 = 남은 13초             → wave 4 (나머지 전부)
const BACCARAT_WAVES = [
  { secInRound: 5,  ratio: 0.30, waveIdx: 1 },
  { secInRound: 10, ratio: 0.15, waveIdx: 2 },
  { secInRound: 14, ratio: 0.15, waveIdx: 3 },
  { secInRound: 17, ratio: 1.00, waveIdx: 4 }, // 나머지 전부
] as const

// 공통: 유저 배팅 1회 실행 (gameType 지정)
async function runBetForGame(gameType: "baccarat" | "race") {
  // ── 페이즈 체크: ��팅 가능 구간이 아니면 즉시 반환 ──
  const phase = isBettingPhase(gameType)
  if (!phase.allowed) {
    return { results: [], totalFee: 0, round: 0, skipped: true, skipReason: phase.reason }
  }

  const { data: profilesRaw2 } = await adminSupabase
    .from("profiles")
    .select("id, username")
    .in("username", AUTO_BET_USERNAMES)
  const profiles2 = (profilesRaw2 ?? []) as { id: string; username: string }[]

  if (profiles2.length === 0) return { results: [], totalFee: 0, round: 0 }

  // 해당 게임 타입 유저만 필터
  const targetProfiles = profiles2.filter(p => {
    const num = parseInt(p.username.replace("사용자", ""))
    return gameType === "baccarat" ? num % 2 !== 0 : num % 2 === 0
  })

  const userIds = targetProfiles.map(p => p.id)
  const { data: balancesRaw2 } = await adminSupabase
    .from("balances").select("user_id, amount").in("user_id", userIds)
  const balances2 = (balancesRaw2 ?? []) as { user_id: string; amount: number }[]
  const balMap = Object.fromEntries(balances2.map(b => [b.user_id, b.amount]))

  const nowSec = Math.floor(Date.now() / 1000)
  // race: 180초(3분) 라운드 — bet/SSE/settle/round-stats 모두 동일 기준
  const roundNumber = gameType === "baccarat"
    ? Math.floor(nowSec / 30)
    : Math.floor(nowSec / 180)
  const ttl = 3600  // settle-me가 라운드 종료 후에도 배당 조회 가능하도록

  const poolKey    = `pool:${gameType}:${roundNumber}`
  const userSetKey = `users:${gameType}:${roundNumber}`
  const roundSec   = gameType === "race" ? 180 : 30
  const currentKey = `odds:current:${gameType}:${roundNumber}`

  // 브랜치 LP 설정 조회 (첫 번째 유저의 branch 기준)
  let lpConfig = DEFAULT_LP_CONFIG
  const firstId = userIds[0]
  if (firstId) {
    const { data: pfRaw } = await adminSupabase.from("profiles").select("branch_id").eq("id", firstId).single()
    const pf = pfRaw as { branch_id: string | null } | null
    if (pf?.branch_id) {
      const { data: brRaw } = await adminSupabase
        .from("branches")
        .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
        .eq("id", pf.branch_id).single()
      const br = brRaw as Record<string, unknown> | null
      if (br) lpConfig = branchToLpConfig(br as Parameters<typeof branchToLpConfig>[0])
    }
  }

  // ── 단일 유저 배팅 실행 함수 ─────────────────────────────────
  const betOne = async (p: { id: string; username: string }) => {
    const side = gameType === "baccarat"
      ? randomPick(BACCARAT_SIDES)
      : randomPick(RACE_SIDES)
    const amount = randomPick(BET_AMOUNTS)
    const currentBalance = balMap[p.id] ?? 0

    if (currentBalance < amount) {
      return { username: p.username, gameType, side, amount, success: false, error: "잔고 부족", balance: currentBalance, round: roundNumber, odds: null, fee: 0 }
    }

    // 바카라·레이스 모두 라운드 내 중복 배팅 방지
    const userBetsKey = `bet:bets:${gameType}:${roundNumber}:${p.id}`
    const existing = await redis.get(userBetsKey)
    if (existing) {
      return { username: p.username, gameType, side, amount, success: false, error: "이미 배팅함", balance: currentBalance, round: roundNumber, odds: null, fee: 0 }
    }

    try {
      const { data: newBalRaw, error: deductErr } = await (adminSupabase.rpc as Function)("deduct_balance_for_bet", { p_user_id: p.id, p_amount: amount })
      const newBal = newBalRaw as number | null
      if (deductErr) {
        return { username: p.username, gameType, side, amount, success: false, error: deductErr.message, balance: currentBalance, round: roundNumber, odds: null, fee: 0 }
      }

      // pool 업데이트 — odds_version incr은 odds:current 캐시 갱신 후 수행
      await Promise.all([
        redis.hincrby(poolKey, side, amount),
        redis.sadd(userSetKey, p.id),
        redis.expire(poolKey, ttl),
        redis.expire(userSetKey, ttl),
      ])

      const betPayload = gameType === "baccarat"
        ? { baccaratSide: side, baccaratAmount: amount }
        : { raceSide: side, raceAmount: amount }
      // 배팅 시점 풀로 odds 계산 → 유저별 odds:snap 저장 (settle-me가 이 값으로 정산)
      const [poolDataNow, userCountNow] = await Promise.all([
        redis.hgetall(poolKey).catch(() => null),
        redis.scard(userSetKey).catch(() => 0),
      ])
      let oddsSnapNow: Record<string, number> = {}
      let oddsCurrentPayload: object | null = null
      if (gameType === "baccarat") {
        const pool = {
          player: parseInt((poolDataNow?.player as string) ?? "0") || 0,
          banker: parseInt((poolDataNow?.banker as string) ?? "0") || 0,
          tie:    parseInt((poolDataNow?.tie    as string) ?? "0") || 0,
        }
        const r = calcBaccaratOdds(pool, lpConfig, (userCountNow as number) ?? 0)
        oddsSnapNow = { player: Number(r.playerOdds), banker: Number(r.bankerOdds), tie: Number(r.tieOdds) }
        // 공유 캐시 갱신 → Railway WS가 폴링 시 최신 배당 push
        oddsCurrentPayload = {
          gameType, roundNumber, userCount: Number(userCountNow ?? 0), pools: pool,
          odds: { player: Number(r.playerOdds), banker: Number(r.bankerOdds), tie: Number(r.tieOdds),
            lpWeight: r.lpWeight, mode: r.mode, available: r.available },
        }
      } else {
        const pool = {
          bit:  parseInt((poolDataNow?.bit  as string) ?? "0") || 0,
          coin: parseInt((poolDataNow?.coin as string) ?? "0") || 0,
          tie:  parseInt((poolDataNow?.tie  as string) ?? "0") || 0,
        }
        const r = calcRaceOdds(pool, lpConfig, Number(userCountNow ?? 0))
        oddsSnapNow = { bit: Number(r.bitOdds), coin: Number(r.coinOdds), tie: Number(r.tieOdds) }
        oddsCurrentPayload = {
          gameType, roundNumber, userCount: Number(userCountNow ?? 0), pools: pool,
          odds: { bit: Number(r.bitOdds), coin: Number(r.coinOdds), tie: Number(r.tieOdds),
            lpWeight: r.lpWeight, mode: r.mode, available: r.available },
        }
      }
      const oddsSnapKey = `odds:snap:${gameType}:${roundNumber}:${p.id}`

      await Promise.all([
        redis.set(userBetsKey, JSON.stringify(betPayload), { ex: ttl }),
        redis.set(`bet:round:${gameType}:${p.id}`, roundNumber, { ex: ttl }),
        redis.set(`balance:${p.id}`, (newBal ?? 0) as number, { ex: 3600 }),
        redis.incr(`balance_version:${p.id}`),
        redis.set(oddsSnapKey, JSON.stringify(oddsSnapNow), { ex: ttl }),
        // odds:current 캐시 갱신 먼저 → 그 다음 version incr (Railway poll이 최신 캐시를 읽음)
        oddsCurrentPayload
          ? redis.set(currentKey, JSON.stringify(oddsCurrentPayload), { ex: roundSec + 30 })
          : Promise.resolve(),
      ])
      // 캐시 갱신 완료 후 version incr — Railway 2초 폴링이 새 캐시를 읽어 WS push
      await redis.incr(`odds_version:${gameType}`)

      const betOdds = oddsSnapNow[side] ?? null
      return { username: p.username, gameType, side, amount, success: true, balance: (newBal ?? 0) as number, round: roundNumber, odds: betOdds, fee: Math.floor(amount * 0.2) }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      return { username: p.username, gameType, side, amount, success: false, error: msg, balance: currentBalance, round: roundNumber, odds: null, fee: 0 }
    }
  }

  // ── Fisher-Yates 셔플 ──────────────────────────────────────────
  const shuffled = [...targetProfiles]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const settled: Awaited<ReturnType<typeof betOne>>[] = []
  // wave별 결과 추적 (클라이언트 상세 로그용)
  const waveLog: { waveLabel: string; ts: number; results: Awaited<ReturnType<typeof betOne>>[] }[] = []

  if (gameType === "baccarat") {
    // ── 바카라: wave 기반 배팅 ────────────────────────────────────
    // wave 1(25초): 30%  wave 2(20초): 15%  wave 3(16초): 15%  wave 4(13초): 나머지
    const total = shuffled.length
    const w1End = Math.round(total * 0.30)
    const w2End = Math.round(total * 0.45)
    const w3End = Math.round(total * 0.60)

    const waveSlices = [
      { users: shuffled.slice(0, w1End),     secTrigger: 5,  waveLabel: "wave1(25초)" },
      { users: shuffled.slice(w1End, w2End), secTrigger: 10, waveLabel: "wave2(20초)" },
      { users: shuffled.slice(w2End, w3End), secTrigger: 14, waveLabel: "wave3(16초)" },
      { users: shuffled.slice(w3End),         secTrigger: 17, waveLabel: "wave4(13초)" },
    ]

    for (const wave of waveSlices) {
      if (wave.users.length === 0) continue

      let phase = isBettingPhase("baccarat")
      if (!phase.allowed) break

      if (phase.secInRound < wave.secTrigger) {
        const remainMs = (wave.secTrigger - phase.secInRound) * 1000
        const jitter = Math.floor(Math.random() * 800)
        await new Promise(r => setTimeout(r, remainMs + jitter))
      }

      phase = isBettingPhase("baccarat")
      if (!phase.allowed) break

      const waveTs = Date.now()
      const waveResults: Awaited<ReturnType<typeof betOne>>[] = []

      const groups: (typeof shuffled)[] = []
      let idx2 = 0
      while (idx2 < wave.users.length) {
        const gs = Math.min(2 + Math.floor(Math.random() * 3), wave.users.length - idx2)
        groups.push(wave.users.slice(idx2, idx2 + gs))
        idx2 += gs
      }
      for (const grp of groups) {
        const stillOk = isBettingPhase("baccarat")
        if (!stillOk.allowed) break
        const grpResults = await Promise.all(grp.map(betOne))
        settled.push(...grpResults)
        waveResults.push(...grpResults)
        if (groups.indexOf(grp) < groups.length - 1) {
          await new Promise(r => setTimeout(r, 200 + Math.floor(Math.random() * 400)))
        }
      }
      waveLog.push({ waveLabel: wave.waveLabel, ts: waveTs, results: waveResults })
    }
  } else {
    // ── 레이스: 배팅창 50초(10~59초) 안에 자연 분산 ─────────────
    const SPREAD_BUDGET_MS = 40000
    const groups: (typeof shuffled)[] = []
    let idx = 0
    while (idx < shuffled.length) {
      const gs = Math.min(2 + Math.floor(Math.random() * 3), shuffled.length - idx)
      groups.push(shuffled.slice(idx, idx + gs))
      idx += gs
    }
    const delayPerGap = groups.length > 1 ? Math.floor(SPREAD_BUDGET_MS / (groups.length - 1)) : 0
    const jitter = () => Math.floor((Math.random() - 0.5) * 2 * delayPerGap * 0.3)
    const raceWaveResults: Awaited<ReturnType<typeof betOne>>[] = []

    for (let g = 0; g < groups.length; g++) {
      if (g === 0) {
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 1500)))
      } else {
        await new Promise(r => setTimeout(r, Math.max(300, delayPerGap + jitter())))
      }
      const stillOk = isBettingPhase("race")
      if (!stillOk.allowed) break
      const grpResults = await Promise.all(groups[g].map(betOne))
      settled.push(...grpResults)
      raceWaveResults.push(...grpResults)
    }
    waveLog.push({ waveLabel: "분산배팅", ts: Date.now(), results: raceWaveResults })
  }

  const results = settled.map(({ fee: _fee, ...rest }) => rest)
  const totalFee = settled.reduce((s, r) => s + r.fee, 0)
  // wave 로그에서 fee 제거 후 반환
  const wavesForClient = waveLog.map(w => ({
    waveLabel: w.waveLabel,
    ts: w.ts,
    results: w.results.map(({ fee: _f, ...r }) => r),
  }))
  return { results, totalFee, round: roundNumber, waves: wavesForClient }
}

// POST: 자동배팅 1회 실행 (또는 잔고 일괄 충전)
export async function POST(request: Request) {
  // 내부 cron 호출 (x-internal-secret) 또는 관리자 토큰 중 하나로 인증
  const internalSecret = request.headers.get("x-internal-secret")
  const isInternal = internalSecret && internalSecret === process.env.CRON_SECRET

  if (!isInternal) {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? null
    const admin = await requireAdmin(token, request)
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()

  // action: "create_accounts" — 기존 사용자N@auto.bet 형식과 동일하게 신규 봇 계정 생성
  // 타임아웃 방지: Auth Admin API를 10개씩 병렬 배치로 처리
  if (body.action === "create_accounts") {
    const { data: existingRaw } = await adminSupabase
      .from("profiles").select("username").like("username", "사용자%")
    const existingSet = new Set(((existingRaw ?? []) as { username: string }[]).map(p => p.username))
    const missing = AUTO_BET_USERNAMES.filter(u => !existingSet.has(u))

    let created = 0
    // 10개씩 병렬 배치 처리 (타임아웃 방지)
    const BATCH = 10
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH)
      await Promise.all(batch.map(async (username) => {
        try {
          const email = `${username}@auto.bet`
          const { data: authUser, error: authErr } = await adminSupabase.auth.admin.createUser({
            email,
            // 기존 봇들과 동일한 bcrypt 해시 비밀번호를 직접 주입
            password: "AutoBet@2024!",
            email_confirm: true,
          })
          if (authErr || !authUser.user) return
          const uid = authUser.user.id
          await Promise.all([
            (adminSupabase.from("profiles") as any).upsert(
              { id: uid, username, role: "user", game_enabled: false },
              { onConflict: "id" }
            ),
            (adminSupabase.from("balances") as any).upsert(
              { user_id: uid, amount: 10000000 },
              { onConflict: "user_id" }
            ),
          ])
          created++
        } catch {}
      }))
    }
    return NextResponse.json({ ok: true, created, total: AUTO_BET_USERNAMES.length })
  }

  // action: "top_up"
  if (body.action === "top_up") {
    const { data: profilesTop } = await adminSupabase
      .from("profiles").select("id").in("username", AUTO_BET_USERNAMES)
    if (!profilesTop) return NextResponse.json({ ok: true, topped: 0 })
    const ids = (profilesTop as { id: string }[]).map(p => p.id)
    const { data: balancesTop } = await adminSupabase
      .from("balances").select("user_id, amount").in("user_id", ids)
    const needTopUp = ((balancesTop ?? []) as { user_id: string; amount: number }[]).filter(b => b.amount < 1000000)
    let topped = 0
    for (const b of needTopUp) {
      await (adminSupabase.from("balances") as any).update({ amount: 10000000 }).eq("user_id", b.user_id)
      topped++
    }
    return NextResponse.json({ ok: true, topped })
  }

  // action: "bet_baccarat" — 바카라 유저만 1라운드 배팅
  if (body.action === "bet_baccarat") {
    const r = await runBetForGame("baccarat")
    if (r.skipped) return NextResponse.json({ ok: true, skipped: true, skipReason: r.skipReason, gameType: "baccarat" })
    const [totalFeeRaw, baccaratFeeRaw] = await Promise.all([
      redis.get("auto_bet:total_fee"),
      redis.get("auto_bet:baccarat_fee"),
    ])
    const newTotal = (Number(totalFeeRaw) || 0) + r.totalFee
    const newBaccarat = (Number(baccaratFeeRaw) || 0) + r.totalFee
    await Promise.all([
      redis.set("auto_bet:total_fee", newTotal),
      redis.set("auto_bet:baccarat_fee", newBaccarat),
    ])
    const logEntry = JSON.stringify({ ts: Date.now(), results: r.results, totalFee: r.totalFee, gameType: "baccarat" })
    await redis.lpush("auto_bet:logs", logEntry)
    await redis.ltrim("auto_bet:logs", 0, 99)
    return NextResponse.json({ ok: true, gameType: "baccarat", round: r.round, results: r.results, totalFeeThisRound: r.totalFee, accumulatedFee: newTotal, baccaratFee: newBaccarat })
  }

  // action: "bet_race" — 레이스 유저만 1라운드 배팅
  if (body.action === "bet_race") {
    const r = await runBetForGame("race")
    if (r.skipped) return NextResponse.json({ ok: true, skipped: true, skipReason: r.skipReason, gameType: "race" })
    const [totalFeeRaw, raceFeeRaw] = await Promise.all([
      redis.get("auto_bet:total_fee"),
      redis.get("auto_bet:race_fee"),
    ])
    const newTotal = (Number(totalFeeRaw) || 0) + r.totalFee
    const newRace = (Number(raceFeeRaw) || 0) + r.totalFee
    await Promise.all([
      redis.set("auto_bet:total_fee", newTotal),
      redis.set("auto_bet:race_fee", newRace),
    ])
    const logEntry = JSON.stringify({ ts: Date.now(), results: r.results, totalFee: r.totalFee, gameType: "race" })
    await redis.lpush("auto_bet:logs", logEntry)
    await redis.ltrim("auto_bet:logs", 0, 99)
    return NextResponse.json({ ok: true, gameType: "race", round: r.round, results: r.results, totalFeeThisRound: r.totalFee, accumulatedFee: newTotal, raceFee: newRace })
  }

  // action: "bet" — 하위 호환
  if (body.action === "bet") {
    const r = await runBetForGame("baccarat")
    if (r.skipped) return NextResponse.json({ ok: true, skipped: true, skipReason: r.skipReason })
    const [totalFeeRaw, baccaratFeeRaw] = await Promise.all([
      redis.get("auto_bet:total_fee"),
      redis.get("auto_bet:baccarat_fee"),
    ])
    const newTotal = (Number(totalFeeRaw) || 0) + r.totalFee
    const newBaccarat = (Number(baccaratFeeRaw) || 0) + r.totalFee
    await Promise.all([
      redis.set("auto_bet:total_fee", newTotal),
      redis.set("auto_bet:baccarat_fee", newBaccarat),
    ])
    const logEntry = JSON.stringify({ ts: Date.now(), results: r.results, totalFee: r.totalFee })
    await redis.lpush("auto_bet:logs", logEntry)
    await redis.ltrim("auto_bet:logs", 0, 99)
    return NextResponse.json({ ok: true, round: r.round, results: r.results, totalFeeThisRound: r.totalFee, accumulatedFee: newTotal })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

// PATCH: 누적 수수료 초기화 또는 로그 조회
export async function PATCH(request: Request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? null
  const admin = await requireAdmin(token, request)
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()

  if (body.action === "reset_fee") {
    await Promise.all([
      redis.set("auto_bet:total_fee", 0),
      redis.set("auto_bet:baccarat_fee", 0),
      redis.set("auto_bet:race_fee", 0),
    ])
    return NextResponse.json({ ok: true })
  }

  if (body.action === "get_logs") {
    const [logs, accumulatedFee, baccaratFee, raceFee] = await Promise.all([
      redis.lrange<string>("auto_bet:logs", 0, 19),
      redis.get<number>("auto_bet:total_fee") ?? 0,
      redis.get<number>("auto_bet:baccarat_fee") ?? 0,
      redis.get<number>("auto_bet:race_fee") ?? 0,
    ])
    return NextResponse.json({ logs, accumulatedFee, baccaratFee, raceFee })
  }

  // action: "full_reset" — 잔고 1천만원 초기화 + bet_history 삭제 + Redis 초기화
  // gameType: "baccarat" | "race" | "all" (기본: "all")
  // 역삼1 비밀번호 검증은 클라이언트에서 /api/admin/verify-password로 먼저 처리
  if (body.action === "full_reset") {
    const gameType: "baccarat" | "race" | "all" = body.gameType ?? "all"

    const { data: profilesReset } = await adminSupabase
      .from("profiles")
      .select("id")
      .in("username", AUTO_BET_USERNAMES)
    const profiles = (profilesReset ?? []) as { id: string }[]

    if (profiles.length === 0) return NextResponse.json({ ok: true, reset: 0 })

    const allIds = profiles.map(p => p.id)

    // gameType 필터: baccarat/race면 해당 게임에 bet_history가 있는 유저만
    let ids = allIds
    if (gameType !== "all") {
      const { data: bhRaw } = await adminSupabase
        .from("bet_history")
        .select("user_id")
        .in("user_id", allIds)
        .eq("game_type", gameType)
      const bh = (bhRaw ?? []) as { user_id: string }[]
      const filtered = [...new Set(bh.map(r => r.user_id))]
      ids = filtered.length > 0 ? filtered : allIds
    }

    // 1. 잔고 1천만원으로 초기화
    for (const id of ids) {
      await (adminSupabase.from("balances") as any).update({ amount: 10000000 }).eq("user_id", id)
      await redis.set(`balance:${id}`, 10000000, { ex: 3600 })
      await redis.incr(`balance_version:${id}`)
    }

    // 2. bet_history 삭제 (gameType 필터 적용)
    if (gameType === "all") {
      await adminSupabase.from("bet_history").delete().in("user_id", ids)
    } else {
      await adminSupabase.from("bet_history").delete().in("user_id", ids).eq("game_type", gameType)
    }

    // 3. Redis 초기화 (누적 수수료, 로그)
    if (gameType === "all") {
      await Promise.all([
        redis.set("auto_bet:total_fee", 0),
        redis.set("auto_bet:baccarat_fee", 0),
        redis.set("auto_bet:race_fee", 0),
        redis.del("auto_bet:logs"),
      ])
    } else if (gameType === "baccarat") {
      const raceFee = await redis.get<number>("auto_bet:race_fee") ?? 0
      await Promise.all([
        redis.set("auto_bet:baccarat_fee", 0),
        redis.set("auto_bet:total_fee", raceFee),
      ])
    } else if (gameType === "race") {
      const baccaratFee = await redis.get<number>("auto_bet:baccarat_fee") ?? 0
      await Promise.all([
        redis.set("auto_bet:race_fee", 0),
        redis.set("auto_bet:total_fee", baccaratFee),
      ])
    }

    return NextResponse.json({ ok: true, reset: ids.length })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
