/**
 * AMM 시드 풀 기반 파리뮤추얼 배당 시스템
 *
 * ── 핵심 설계 원칙 ──────────────────────────────────────────────────────
 *
 * 1. LP 균등 시딩
 *    Player / Banker / Tie 각 사이드에 동일한 금액(seed)을 시딩.
 *    아무도 배팅 안 했을 때 배당 = 3.0x (seed×3 / seed).
 *
 * 2. 수수료는 유저 배팅에서만 차감
 *    LP 시드는 수수료 대상이 아님. 하우스 수익 = 유저 배팅 × 20%.
 *
 * 3. 집중 보호 (Concentration Guard)
 *    한 사이드에 배팅이 몰리면 그 사이드 배당이 낮아지고
 *    반대 사이드 배당이 높아짐 → 자연히 반대 배팅을 유도.
 *    LP 시드가 이 효과를 안정시키는 역할.
 *
 * 4. LP 감쇠 (Decay) — 핵심
 *    유저 배팅이 많아질수록 LP 기여도를 점진적으로 줄임.
 *    LP 총액 대비 유저 배팅 비율(coverage)로 감쇠 계수 결정:
 *
 *      coverage = 유저총배팅 / LP시드총액
 *      lpWeight = 1 / (1 + coverage × DECAY_FACTOR)
 *
 *    예: 시드 30M, DECAY_FACTOR=3
 *      유저 0M    → coverage=0.00 → lpWeight=1.00 (LP 100% 반영)
 *      유저 10M   → coverage=0.33 → lpWeight=0.50 (LP 50%)
 *      유저 30M   → coverage=1.00 → lpWeight=0.25 (LP 25%)
 *      유저 90M   → coverage=3.00 → lpWeight=0.10 (LP 10%)
 *      유저 300M  → coverage=10.0 → lpWeight=0.03 (LP ~0%)
 *
 *    → 초기: LP가 배당을 안정시킴 (이상한 배당 방지)
 *    → 성숙: 유저 풀이 배당을 결정 (순수 파리뮤추얼)
 *    → 자연스러운 전환, 관리자 개입 불필요
 */

export interface BaccaratPools {
  player: number
  banker: number
  tie: number
}

export interface RacePools {
  bit: number
  coin: number
  tie: number
}

export interface LpConfig {
  enabled: boolean
  lpAmountBaccarat: number  // 바카라 사이드당 시드 금액
  lpAmountRace:     number  // 레이스 사이드당 시드 금액
  // 하위호환성 유지용
  lpMultiplierBaccarat: number
  lpMultiplierRace:     number
}

export interface OddsResult {
  playerOdds: number
  bankerOdds: number
  tieOdds:    number
  fee:        number   // 하우스 수수료 (유저 배팅 × 20%)
  totalPool:  number   // 실효 풀 (유저 + 감쇠된 LP)
  lpSeed:     number   // LP 시드 원금 (감쇠 전)
  lpWeight:   number   // 현재 LP 기여 비율 (0~1)
  mode:       "seeded" | "decay" | "natural"
}

export interface RaceOddsResult {
  bitOdds:   number
  coinOdds:  number
  tieOdds:   number
  fee:       number
  totalPool: number
  lpSeed:    number
  lpWeight:  number
  mode:      "seeded" | "decay" | "natural"
}

// 기본 LP 설정
export const DEFAULT_LP_CONFIG: LpConfig = {
  enabled:              true,
  lpAmountBaccarat:     10_000_000,
  lpAmountRace:         10_000_000,
  lpMultiplierBaccarat: 1.0,
  lpMultiplierRace:     1.0,
}

export function branchToLpConfig(branch: {
  lp_enabled?:              boolean | null
  lp_amount_baccarat?:      number  | null
  lp_amount_race?:          number  | null
  lp_multiplier_baccarat?:  number  | null
  lp_multiplier_race?:      number  | null
}): LpConfig {
  return {
    enabled:              branch.lp_enabled             ?? true,
    lpAmountBaccarat:     branch.lp_amount_baccarat     ?? DEFAULT_LP_CONFIG.lpAmountBaccarat,
    lpAmountRace:         branch.lp_amount_race         ?? DEFAULT_LP_CONFIG.lpAmountRace,
    lpMultiplierBaccarat: branch.lp_multiplier_baccarat ?? 1.0,
    lpMultiplierRace:     branch.lp_multiplier_race     ?? 1.0,
  }
}

// ── 상수 ────────────────────────────────────────────────────────────────────
const FEE_RATE    = 0.20   // 수수료율 (유저 배팅에만 적용)
const MIN_ODDS    = 1.01
const MAX_ODDS    = 50.0
const DECAY_FACTOR = 3     // 높을수록 LP가 빨리 감쇠
                           // 3 = 유저 배팅이 LP 시드와 같아질 때 lpWeight ≈ 0.25

// ── 내부 유틸 ────────────────────────────────────────────────────────────────

/**
 * LP 감쇠 계수 계산
 * coverage = totalUserBet / lpSeedTotal
 * lpWeight = 1 / (1 + coverage * DECAY_FACTOR)
 */
function calcLpWeight(totalUserBet: number, lpSeedTotal: number): number {
  if (lpSeedTotal <= 0) return 0
  const coverage = totalUserBet / lpSeedTotal
  return 1 / (1 + coverage * DECAY_FACTOR)
}

/** 배당률 클램핑 */
function clamp(odds: number): number {
  return Math.min(MAX_ODDS, Math.max(MIN_ODDS, odds))
}

/** 현재 모드 레이블 */
function getMode(lpWeight: number): "seeded" | "decay" | "natural" {
  if (lpWeight >= 0.80) return "seeded"   // LP 80% 이상 → 시딩 단계
  if (lpWeight >= 0.10) return "decay"    // LP 10~80%   → 감쇠 단계
  return "natural"                         // LP 10% 미만 → 자연 파리뮤추얼
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * 바카라 배당률 계산
 */
export function calcBaccaratOdds(
  userPools: BaccaratPools,
  lpConfig: LpConfig,
  _userCount?: number
): OddsResult {
  const seed = lpConfig.enabled ? lpConfig.lpAmountBaccarat : 0

  const totalUserBet = userPools.player + userPools.banker + userPools.tie
  const lpSeedTotal  = seed * 3

  // LP 감쇠 계수
  const lpWeight = calcLpWeight(totalUserBet, lpSeedTotal)

  // 감쇠된 LP (각 사이드에 균등 반영)
  const effectiveSeed = seed * lpWeight

  // 사이드별 실효 풀 = 유저 배팅 + 감쇠된 LP 시드
  const totalPlayer = userPools.player + effectiveSeed
  const totalBanker = userPools.banker + effectiveSeed
  const totalTie    = userPools.tie    + effectiveSeed

  // 수수료는 유저 배팅에서만
  const fee     = Math.floor(totalUserBet * FEE_RATE)
  const giveout = (totalUserBet - fee) + (effectiveSeed * 3)
  const totalPool = totalUserBet + lpSeedTotal  // 원금 기준 (UI 표시용)

  const playerOdds = parseFloat((giveout / totalPlayer).toFixed(4))
  const bankerOdds = parseFloat((giveout / totalBanker).toFixed(4))
  const tieOdds    = parseFloat((giveout / totalTie).toFixed(4))

  return {
    playerOdds: clamp(playerOdds),
    bankerOdds: clamp(bankerOdds),
    tieOdds:    clamp(tieOdds),
    fee,
    totalPool,
    lpSeed:   lpSeedTotal,
    lpWeight: parseFloat(lpWeight.toFixed(4)),
    mode:     getMode(lpWeight),
  }
}

/**
 * 레이스 배당률 계산
 */
export function calcRaceOdds(
  userPools: RacePools,
  lpConfig: LpConfig,
  _userCount?: number
): RaceOddsResult {
  const seed = lpConfig.enabled ? lpConfig.lpAmountRace : 0

  const totalUserBet = userPools.bit + userPools.coin + userPools.tie
  const lpSeedTotal  = seed * 3

  const lpWeight      = calcLpWeight(totalUserBet, lpSeedTotal)
  const effectiveSeed = seed * lpWeight

  const totalBit  = userPools.bit  + effectiveSeed
  const totalCoin = userPools.coin + effectiveSeed
  const totalTie  = userPools.tie  + effectiveSeed

  const fee     = Math.floor(totalUserBet * FEE_RATE)
  const giveout = (totalUserBet - fee) + (effectiveSeed * 3)
  const totalPool = totalUserBet + lpSeedTotal

  const bitOdds  = parseFloat((giveout / totalBit).toFixed(4))
  const coinOdds = parseFloat((giveout / totalCoin).toFixed(4))
  const tieOdds  = parseFloat((giveout / totalTie).toFixed(4))

  return {
    bitOdds:  clamp(bitOdds),
    coinOdds: clamp(coinOdds),
    tieOdds:  clamp(tieOdds),
    fee,
    totalPool,
    lpSeed:   lpSeedTotal,
    lpWeight: parseFloat(lpWeight.toFixed(4)),
    mode:     getMode(lpWeight),
  }
}

/**
 * 정산 지급액 계산
 */
export function calcPayout(params: {
  betAmount: number
  side:   "player" | "banker" | "tie" | "bit" | "coin"
  result: string
  odds:   number
}): number {
  if (params.side !== params.result) return 0
  return Math.floor(params.betAmount * params.odds)
}

/**
 * LP 투입액 계산 (하위호환)
 */
export function calcLpUsed(
  _userPools: BaccaratPools | RacePools,
  lpConfig: LpConfig,
  _userCount?: number
): number {
  if (!lpConfig.enabled) return 0
  return lpConfig.lpAmountBaccarat * 3
}

/**
 * 하우스 손익 계산
 */
export function calcHousePnl(params: {
  totalUserBet: number
  totalPayout:  number
  totalLpUsed:  number
  fee:          number
}): { housePnl: number; netFee: number } {
  const housePnl = params.fee + params.totalUserBet - params.totalPayout
  return { housePnl, netFee: params.fee }
}
