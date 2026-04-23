import { adminSupabase } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, DEFAULT_LP_CONFIG } from "@/lib/lp-system"
import { cookies } from "next/headers"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

async function requireAdmin(token: string | null, req?: Request) {
  // Authorization 헤더 없으면 HTTP-only 쿠키에서 토큰 읽기
  if (!token && req) {
    const cookieStore = await cookies()
    token = cookieStore.get("app_token")?.value ?? null
  }
  if (!token) return null
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await anonClient.auth.getUser(token)
  if (error || !data.user) return null
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single()
  const adminRoles = ["master", "super_admin", "admin", "superadmin", "branch_admin"]
  if (!profile || !adminRoles.includes(profile.role)) return null
  return data.user
}

// 자동배팅 유저 목록 (사용자2~사용자30, 홀수=baka, 짝수=race)
const AUTO_BET_USERNAMES = Array.from({ length: 29 }, (_, i) => `사용자${i + 2}`)
const BET_AMOUNTS = [10000, 50000, 100000]
const BACCARAT_SIDES = ["player", "banker", "tie"] as const
const RACE_SIDES = ["bit", "coin", "tie"] as const

function randomPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
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
    // 30초 라운드: 실제 게임과 동일 기준
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
      await Promise.all([
        redis.set(userBetsKey, JSON.stringify(betPayload), { ex: ttl }),
        redis.set(`bet:round:${gameType}:${p.id}`, roundNumber, { ex: ttl }),
        redis.set(`balance:${p.id}`, newBal as number, { ex: 3600 }),
        redis.incr(`balance_version:${p.id}`),
      ])

      return { username: p.username, gameType, side, amount, success: true, balance: newBal as number, round: roundNumber, odds: null, fee: Math.floor(amount * 0.2) }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      return { username: p.username, gameType, side, amount, success: false, error: msg, balance: currentBalance, round: roundNumber, odds: null, fee: 0 }
    }
  }

  // ── 배팅 구간 내에 무작위 분산 배팅 ──────────────────────────
  // 바카라: 배팅창 15초(5~19초), cron 진입 후 7초 예산 — 게임중(20초) 전에 확실히 완료
  // 레이스: 배팅창 50초(10~59초), cron 진입 후 40초 예산
  const SPREAD_BUDGET_MS = gameType === "baccarat" ? 7000 : 40000

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

  // 전체 배팅이 끝난 후 최종 풀로 odds 한 번만 계산 → odds:final 저장 (단일 소스)
  try {
    const [poolDataFinal, userCountFinal] = await Promise.all([
      redis.hgetall(poolKey),
      redis.scard(userSetKey),
    ])
    const finalOddsKey = `odds:final:${gameType}:${roundNumber}`
    if (gameType === "baccarat") {
      const pool = {
        player: parseInt((poolDataFinal?.player as string) ?? "0") || 0,
        banker: parseInt((poolDataFinal?.banker as string) ?? "0") || 0,
        tie:    parseInt((poolDataFinal?.tie    as string) ?? "0") || 0,
      }
      const r = calcBaccaratOdds(pool, DEFAULT_LP_CONFIG, userCountFinal as number)
      const snap = { player: r.playerOdds, banker: r.bankerOdds, tie: r.tieOdds }
      await redis.set(finalOddsKey, JSON.stringify(snap), { ex: ttl })
      // 각 결과에 본인 사이드 odds 채우기
      for (const res of settled) {
        if (res.success) res.odds = snap[res.side as keyof typeof snap] ?? null
      }
    } else {
      const pool = {
        bit:  parseInt((poolDataFinal?.bit  as string) ?? "0") || 0,
        coin: parseInt((poolDataFinal?.coin as string) ?? "0") || 0,
        tie:  parseInt((poolDataFinal?.tie  as string) ?? "0") || 0,
      }
      const r = calcRaceOdds(pool, DEFAULT_LP_CONFIG, userCountFinal as number)
      const snap = { bit: r.bitOdds, coin: r.coinOdds, tie: r.tieOdds }
      await redis.set(finalOddsKey, JSON.stringify(snap), { ex: ttl })
      for (const res of settled) {
        if (res.success) res.odds = snap[res.side as keyof typeof snap] ?? null
      }
    }
  } catch {}

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
    const [totalFee, baccaratFee] = await Promise.all([
      redis.get<number>("auto_bet:total_fee") ?? 0,
      redis.get<number>("auto_bet:baccarat_fee") ?? 0,
    ])
    const newTotal = (totalFee as number) + r.totalFee
    const newBaccarat = (baccaratFee as number) + r.totalFee
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
    const [totalFee, raceFee] = await Promise.all([
      redis.get<number>("auto_bet:total_fee") ?? 0,
      redis.get<number>("auto_bet:race_fee") ?? 0,
    ])
    const newTotal = (totalFee as number) + r.totalFee
    const newRace = (raceFee as number) + r.totalFee
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
    const [totalFee, baccaratFee] = await Promise.all([
      redis.get<number>("auto_bet:total_fee") ?? 0,
      redis.get<number>("auto_bet:baccarat_fee") ?? 0,
    ])
    const newTotal = (totalFee as number) + r.totalFee
    const newBaccarat = (baccaratFee as number) + r.totalFee
    await Promise.all([
      redis.set("auto_bet:total_fee", newTotal),
      redis.set("auto_bet:baccarat_fee", newBaccarat),
    ])
    const logEntry = JSON.stringify({ ts: Date.now(), results: r.results, totalFee: r.totalFee })
    await redis.lpush("auto_bet:logs", logEntry)
    await redis.ltrim("auto_bet:logs", 0, 99)
    return NextResponse.json({ ok: true, round: r.round, results: r.results, totalFeeThisRound: r.totalFee, accumulatedFee: newTotal })
  }

  // action: "bet_race" — 레���스 유저만 1라운드 배팅
  if (body.action === "bet_race") {
    const r = await runBetForGame("race")
    if (r.skipped) return NextResponse.json({ ok: true, skipped: true, skipReason: r.skipReason, gameType: "race" })
    const existingFee = await redis.get<number>("auto_bet:total_fee") ?? 0
    await redis.set("auto_bet:total_fee", (existingFee as number) + r.totalFee)
    const logEntry = JSON.stringify({ ts: Date.now(), results: r.results, totalFee: r.totalFee, gameType: "race" })
    await redis.lpush("auto_bet:logs", logEntry)
    await redis.ltrim("auto_bet:logs", 0, 99)
    return NextResponse.json({ ok: true, gameType: "race", round: r.round, results: r.results, totalFeeThisRound: r.totalFee, accumulatedFee: (existingFee as number) + r.totalFee })
  }

  // action: "bet" — 하위 호환
  if (body.action === "bet") {
    const r = await runBetForGame("baccarat")
    if (r.skipped) return NextResponse.json({ ok: true, skipped: true, skipReason: r.skipReason })
    const existingFee = await redis.get<number>("auto_bet:total_fee") ?? 0
    await redis.set("auto_bet:total_fee", (existingFee as number) + r.totalFee)
    const logEntry = JSON.stringify({ ts: Date.now(), results: r.results, totalFee: r.totalFee })
    await redis.lpush("auto_bet:logs", logEntry)
    await redis.ltrim("auto_bet:logs", 0, 99)
    return NextResponse.json({ ok: true, round: r.round, results: r.results, totalFeeThisRound: r.totalFee, accumulatedFee: (existingFee as number) + r.totalFee })
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
