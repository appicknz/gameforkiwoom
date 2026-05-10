import { redis } from "@/lib/redis"
import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, DEFAULT_LP_CONFIG } from "@/lib/lp-system"
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
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single()
  const adminRoles = ["master", "super_admin", "admin", "superadmin", "branch_admin"]
  if (!profile || !adminRoles.includes(profile.role)) return null
  return { id: userId }
}

// 자동배팅 유저 목록 (사용자2~사용자30, 홀수=baka, 짝수=race)
const AUTO_BET_USERNAMES = Array.from({ length: 29 }, (_, i) => `사용자${i + 2}`)
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
    const { data: row } = await adminSupabase
      .from("btc_closing_prices")
      .select("price, baccarat_result")
      .gte("time", closeTime - 29)
      .lte("time", closeTime + 30)
      .order("time", { ascending: false })
      .limit(1)
      .maybeSingle()

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
      const r = calcBaccaratOdds(pool, DEFAULT_LP_CONFIG, userCount as number)
      oddsSnap = { player: r.playerOdds, banker: r.bankerOdds, tie: r.tieOdds }
    }
  } else {
    const pool = {
      bit:  parseInt((poolData?.bit  as string) ?? "0") || 0,
      coin: parseInt((poolData?.coin as string) ?? "0") || 0,
      tie:  parseInt((poolData?.tie  as string) ?? "0") || 0,
    }
    if (pool.bit + pool.coin + pool.tie > 0) {
      const r = calcRaceOdds(pool, DEFAULT_LP_CONFIG, userCount as number)
      oddsSnap = { bit: r.bitOdds, coin: r.coinOdds, tie: r.tieOdds }
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
    const { error: insertErr } = await adminSupabase.from("bet_history").insert(historyRows)
    if (insertErr) return  // INSERT 실패 시 잠금 설정 안 함 → 다음 호출에서 재시도

    // ── 승리 시 잔고 환급 ────────────────────────────────────────
    if (totalPayout > 0) {
      await adminSupabase.rpc("add_balance_for_payout", { p_user_id: p.id, p_amount: totalPayout })
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

  const { data: profiles } = await adminSupabase
    .from("profiles")
    .select("id, username, branch_id")
    .in("username", AUTO_BET_USERNAMES)
    .order("username")

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ users: [] })
  }

  const userIds = profiles.map(p => p.id)
  const { data: balances } = await adminSupabase
    .from("balances")
    .select("user_id, amount")
    .in("user_id", userIds)

  const balMap = Object.fromEntries((balances ?? []).map(b => [b.user_id, b.amount]))

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
  const { data: allHistory } = await adminSupabase
    .from("bet_history")
    .select("user_id, bet_direction, bet_amount, payout, result, created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })  // 최신순 정렬

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
function isBettingPhase(gameType: "baccarat" | "race"): { allowed: boolean; reason?: string } {
  const nowSec = Math.floor(Date.now() / 1000)
  if (gameType === "baccarat") {
    // 30초 라운드: 실제 게임과 ��일 기준
    // 0~4초: 정산(5초), 5~19초: 배팅(15초), 20~29초: 게임중(10초)
    const s = nowSec % 30
    if (s < 5)  return { allowed: false, reason: `정산중 (secInRound=${s})` }
    if (s >= 20) return { allowed: false, reason: `게임중 (secInRound=${s})` }
    return { allowed: true }
  } else {
    // 180초 라운드: 0~9초: 정산, 10~59초: 배팅, 60~179초: 게임중
    const s = nowSec % 180
    if (s < 10)  return { allowed: false, reason: `정산중 (secInRound=${s})` }
    if (s >= 60) return { allowed: false, reason: `게임중 (secInRound=${s})` }
    return { allowed: true }
  }
}

// 공통: 유저 배팅 1회 실행 (gameType 지정)
async function runBetForGame(gameType: "baccarat" | "race") {
  // ── 페이즈 체크: ��팅 가능 구간이 아니면 즉시 반환 ──
  const phase = isBettingPhase(gameType)
  if (!phase.allowed) {
    return { results: [], totalFee: 0, round: 0, skipped: true, skipReason: phase.reason }
  }

  const { data: profiles } = await adminSupabase
    .from("profiles")
    .select("id, username")
    .in("username", AUTO_BET_USERNAMES)

  if (!profiles || profiles.length === 0) return { results: [], totalFee: 0, round: 0 }

  // 해당 게임 타입 유저만 필터
  const targetProfiles = profiles.filter(p => {
    const num = parseInt(p.username.replace("사용자", ""))
    return gameType === "baccarat" ? num % 2 !== 0 : num % 2 === 0
  })

  const userIds = targetProfiles.map(p => p.id)
  const { data: balances } = await adminSupabase
    .from("balances").select("user_id, amount").in("user_id", userIds)
  const balMap = Object.fromEntries((balances ?? []).map(b => [b.user_id, b.amount]))

  const nowSec = Math.floor(Date.now() / 1000)
  // race: 180초(3분) 라운드 — bet/SSE/settle/round-stats 모두 동일 기준
  const roundNumber = gameType === "baccarat"
    ? Math.floor(nowSec / 30)
    : Math.floor(nowSec / 180)
  const ttl = 3600  // settle-me가 라운드 종료 후에도 배당 조회 가능하도록

  const poolKey    = `pool:${gameType}:${roundNumber}`
  const userSetKey = `users:${gameType}:${roundNumber}`

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

    const userBetsKey = `bet:bets:${gameType}:${roundNumber}:${p.id}`
    if (gameType === "race") {
      const existing = await redis.get(userBetsKey)
      if (existing) {
        return { username: p.username, gameType, side, amount, success: false, error: "이미 배팅함", balance: currentBalance, round: roundNumber, odds: null, fee: 0 }
      }
    }

    try {
      const { data: newBal, error: deductErr } = await adminSupabase
        .rpc("deduct_balance_for_bet", { p_user_id: p.id, p_amount: amount })
      if (deductErr) {
        return { username: p.username, gameType, side, amount, success: false, error: deductErr.message, balance: currentBalance, round: roundNumber, odds: null, fee: 0 }
      }

      await Promise.all([
        redis.hincrby(poolKey, side, amount),
        redis.sadd(userSetKey, p.id),
        redis.expire(poolKey, ttl),
        redis.expire(userSetKey, ttl),
        redis.incr(`odds_version:${gameType}`),
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
      if (gameType === "baccarat") {
        const pool = {
          player: parseInt((poolDataNow?.player as string) ?? "0") || 0,
          banker: parseInt((poolDataNow?.banker as string) ?? "0") || 0,
          tie:    parseInt((poolDataNow?.tie    as string) ?? "0") || 0,
        }
        const r = calcBaccaratOdds(pool, DEFAULT_LP_CONFIG, (userCountNow as number) ?? 0)
        oddsSnapNow = { player: r.playerOdds, banker: r.bankerOdds, tie: r.tieOdds }
      } else {
        const pool = {
          bit:  parseInt((poolDataNow?.bit  as string) ?? "0") || 0,
          coin: parseInt((poolDataNow?.coin as string) ?? "0") || 0,
          tie:  parseInt((poolDataNow?.tie  as string) ?? "0") || 0,
        }
        const r = calcRaceOdds(pool, DEFAULT_LP_CONFIG, (userCountNow as number) ?? 0)
        oddsSnapNow = { bit: r.bitOdds, coin: r.coinOdds, tie: r.tieOdds }
      }
      const oddsSnapKey = `odds:snap:${gameType}:${roundNumber}:${p.id}`

      await Promise.all([
        redis.set(userBetsKey, JSON.stringify(betPayload), { ex: ttl }),
        redis.set(`bet:round:${gameType}:${p.id}`, roundNumber, { ex: ttl }),
        redis.set(`balance:${p.id}`, newBal as number, { ex: 3600 }),
        redis.incr(`balance_version:${p.id}`),
        redis.set(oddsSnapKey, JSON.stringify(oddsSnapNow), { ex: ttl }),
      ])

      const betOdds = oddsSnapNow[side] ?? null
      return { username: p.username, gameType, side, amount, success: true, balance: newBal as number, round: roundNumber, odds: betOdds, fee: Math.floor(amount * 0.2) }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      return { username: p.username, gameType, side, amount, success: false, error: msg, balance: currentBalance, round: roundNumber, odds: null, fee: 0 }
    }
  }

  // ── 배팅 구간 내에 무작위 분산 배팅 ──────────────────────────
  // 바카라: 배팅창 15초(5~19초), cron 진입 후 7초 예산 — 게임중(20초) 전에 확실히 완료
  // 레이스: cron maxDuration=55초 제약으로 분산 배팅 불가 → 5초 예산으로 즉시 완료
  const SPREAD_BUDGET_MS = gameType === "baccarat" ? 7000 : 5000

  // Fisher-Yates 셔플
  const shuffled = [...targetProfiles]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  // 2~4명씩 랜덤 그룹 분할
  const groups: (typeof shuffled)[] = []
  let idx = 0
  while (idx < shuffled.length) {
    const groupSize = Math.min(
      2 + Math.floor(Math.random() * 3),  // 2, 3, 4 중 랜덤
      shuffled.length - idx
    )
    groups.push(shuffled.slice(idx, idx + groupSize))
    idx += groupSize
  }

  // 그룹 간 딜레이 균등 분배 (마지막 그룹은 딜레이 없음)
  const delayPerGap = groups.length > 1
    ? Math.floor(SPREAD_BUDGET_MS / (groups.length - 1))
    : 0
  // ±30% 지터 추가로 더 자연스럽게
  const jitter = () => Math.floor((Math.random() - 0.5) * 2 * delayPerGap * 0.3)

  const settled: Awaited<ReturnType<typeof betOne>>[] = []

  for (let g = 0; g < groups.length; g++) {
    // 첫 그룹도 0~1500ms 랜덤 딜레이로 시작 타이밍 분산
    if (g === 0) {
      const initialDelay = Math.floor(Math.random() * 1500)
      await new Promise(res => setTimeout(res, initialDelay))
    } else {
      const wait = Math.max(300, delayPerGap + jitter())
      await new Promise(res => setTimeout(res, wait))
    }

    // 배팅 구간이 아직 유효한지 재확인
    const stillOk = isBettingPhase(gameType)
    if (!stillOk.allowed) break

    // 그룹 내는 병렬 처리
    const groupResults = await Promise.all(groups[g].map(betOne))
    settled.push(...groupResults)
  }

  // odds:final 저장 제거 — 각 유저의 odds:snap이 betOne에서 저장됨
  const results = settled.map(({ fee: _fee, ...rest }) => rest)
  const totalFee = settled.reduce((s, r) => s + r.fee, 0)
  return { results, totalFee, round: roundNumber }
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

  // action: "top_up"
  if (body.action === "top_up") {
    const { data: profiles } = await adminSupabase
      .from("profiles").select("id").in("username", AUTO_BET_USERNAMES)
    if (!profiles) return NextResponse.json({ ok: true, topped: 0 })
    const ids = profiles.map(p => p.id)
    const { data: balances } = await adminSupabase
      .from("balances").select("user_id, amount").in("user_id", ids)
    const needTopUp = (balances ?? []).filter(b => b.amount < 1000000)
    let topped = 0
    for (const b of needTopUp) {
      await adminSupabase.from("balances").update({ amount: 10000000 }).eq("user_id", b.user_id)
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

    const { data: profiles } = await adminSupabase
      .from("profiles")
      .select("id")
      .in("username", AUTO_BET_USERNAMES)

    if (!profiles || profiles.length === 0) return NextResponse.json({ ok: true, reset: 0 })

    const allIds = profiles.map(p => p.id)

    // gameType 필터: baccarat/race면 해당 게임에 bet_history가 있는 유저만
    let ids = allIds
    if (gameType !== "all") {
      const { data: bh } = await adminSupabase
        .from("bet_history")
        .select("user_id")
        .in("user_id", allIds)
        .eq("game_type", gameType)
      const filtered = [...new Set((bh ?? []).map(r => r.user_id))]
      ids = filtered.length > 0 ? filtered : allIds
    }

    // 1. 잔고 1천만원으로 초기화
    for (const id of ids) {
      await adminSupabase.from("balances").update({ amount: 10000000 }).eq("user_id", id)
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
