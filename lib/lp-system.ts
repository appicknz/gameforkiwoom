/**
 * AMM 시드 풀 기반 파리뮤추얼 배당 시스템 — 배팅 단위 인식 감쇠
 *
 * ────────────────────────────────────────────────────────────────────────
 * 설계 원칙
 * ────────────────────────────────────────────────────────────────────────
 * 1. LP 균등 시딩: Player/Banker/Tie 각 사이드에 동일한 seed 투입
 * 2. 수수료: 유저 배팅에서만 20% 차감 (LP 시드 비과세)
 * 3. LP 감쇠: 유저 배팅이 halfPoint에 도달하면 LP 비중 50%, 이후 계속 감소
 *
 * ────────────────────────────────────────────────────────────────────────
 * 감쇠 공식
 * ────────────────────────────────────────────────────────────────────────
 *   halfPoint = lpSeedTotal × lp_multiplier
 *   lpWeight  = 1 / (1 + userTotalBet / halfPoint)
 *
 *   lp_multiplier 의미:
 *     0.5 → 유저 배팅이 LP 시드의  50%에 도달하면 LP 50% 감쇠 (빠른 감쇠)
 *     1.0 → 유저 배팅이 LP 시드의 100%에 도달하면 LP 50% 감쇠 (기본)
 *     2.0 → 유저 배팅이 LP 시드의 200%에 도달하면 LP 50% 감쇠 (느린 감쇠)
 *
 * ────────────────────────────────────────────────────────────────────────
 * 시드 설정 가이드 (배팅 단위별 권장값, 목표 10명 기준, multiplier=1.0)
 * ────────────────────────────────────────────────────────────────────────
 *   seed(사이드당) = (목표인원 × 평균배팅) / 3
 *
 *   1만원 단위  → seed ≈  33,000원  (10×1만/3)
 *   5만원 단위  → seed ≈ 167,000원  (10×5만/3)
 *   10만원 단위 → seed ≈ 333,000원  (10×10만/3)
 *   50만원 단위 → seed ≈ 167만원    (10×50만/3)
 *   100만원 단위→ seed ≈ 333만원    (10×100만/3)
 *
 * ────────────────────────────────────────────────────────────────────────
 * 예시: seed=33만(사이드당), 1만원 단위 유저
 * ────────────────────────────────────────────────────────────────────────
 *   유저 0명:          lpWeight=1.00  배당=3.00x  mode=seeded
 *   유저 5명×1만원:    lpWeight=0.67  배당 완충   mode=seeded
 *   유저 10명×1만원:   lpWeight=0.50  배당 중간   mode=decay
 *   유저 30명×1만원:   lpWeight=0.25  LP 25%      mode=decay
 *   유저 100명×1만원:  lpWeight=0.09  LP ~0%      mode=natural
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
  playerOdds: number | null  // null = LP 비활성 + 유저 배팅 없음 → 배당 미표시
  bankerOdds: number | null
  tieOdds:    number | null
  available:  boolean        // false이면 UI에서 배당 숨김
  fee:        number
  totalPool:  number
  lpSeed:     number
  lpWeight:   number
  mode:       "seeded" | "decay" | "natural" | "pending"
}

export interface RaceOddsResult {
  bitOdds:   number | null
  coinOdds:  number | null
  tieOdds:   number | null
  available:  boolean
  fee:       number
  totalPool: number
  lpSeed:    number
  lpWeight:  number
  mode:      "seeded" | "decay" | "natural" | "pending"
}

// 기본 LP 설정
// seed=333,000 → 10만원 단위 × 10명 기준 (10×10만/3)
export const DEFAULT_LP_CONFIG: LpConfig = {
  enabled:              true,
  lpAmountBaccarat:     333_000,
  lpAmountRace:         333_000,
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
  const enabled = branch.lp_enabled ?? true
  // LP 비활성이면 amount를 강제로 0 — 배당 계산에서 seed=0 보장
  return {
    enabled,
    lpAmountBaccarat:     enabled ? (branch.lp_amount_baccarat     ?? DEFAULT_LP_CONFIG.lpAmountBaccarat) : 0,
    lpAmountRace:         enabled ? (branch.lp_amount_race         ?? DEFAULT_LP_CONFIG.lpAmountRace)     : 0,
    lpMultiplierBaccarat: branch.lp_multiplier_baccarat ?? 1.0,
    lpMultiplierRace:     branch.lp_multiplier_race     ?? 1.0,
  }
}

// ── 상수 ────────────────────────────────────────────────────────────────────
export const FEE_RATE = 0.20
const MIN_ODDS        = 1.01
const MAX_ODDS        = 50.0

/**
 * V: 하우스 기준 가상 풀 크기
 * 유저가 아무도 없을 때 dynamic_lp = V×0.8/1.95 로 초기 배당 ~1.95x 유지
 * 유저 배팅이 쌓일수록 multiplier가 감소 → LP 비중 줄어듦
 */
const V = 300_000_000  // 3억 (배팅 단위와 무관하게 고정)

// ── 내부 유틸 ────────────────────────────────────────────────────────────────

/**
 * LP multiplier 계산 (스펙 기반)
 *
 *   multiplier = V / (V + totalBet + userCount × 300_000)
 *
 * userCount가 많을수록, 배팅이 쌓일수록 multiplier 감소 → dynamic_lp 감소
 */
function calcLpMultiplier(totalUserBet: number, userCount: number): number {
  return V / (V + totalUserBet + userCount * 300_000)
}

/**
 * dynamic_lp 계산 (사이드당)
 *
 *   dynamic_lp = (V × 0.8 / 1.95) × multiplier
 *
 * 유저 없을 때 multiplier=1 → dynamic_lp = V×0.8/1.95
 * → 배당 = net_pool / (dynamic_lp + 0) ≈ 1.95x
 */
function calcDynamicLp(multiplier: number): number {
  return (V * 0.8 / 1.95) * multiplier
}

/** 배당률 클램핑 */
function clamp(odds: number): number {
  return Math.min(MAX_ODDS, Math.max(MIN_ODDS, odds))
}

/** 현재 모드 레이블 */
function getMode(multiplier: number): "seeded" | "decay" | "natural" {
  if (multiplier >= 0.80) return "seeded"
  if (multiplier >= 0.10) return "decay"
  return "natural"
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * 바카라 배당률 계산
 */
export function calcBaccaratOdds(
  userPools: BaccaratPools,
  lpConfig: LpConfig,
  userCount: number = 0
): OddsResult {
  const totalUserBet = userPools.player + userPools.banker + userPools.tie

  // LP 비활성 + 유저 배팅 없음 → 배당 미확정 (pending)
  if (!lpConfig.enabled && totalUserBet === 0) {
    return {
      playerOdds: null, bankerOdds: null, tieOdds: null,
      available: false,
      fee: 0, totalPool: 0, lpSeed: 0, lpWeight: 0, mode: "pending",
    }
  }

  const multiplier  = lpConfig.enabled ? calcLpMultiplier(totalUserBet, userCount) : 0
  const dynamicLp   = lpConfig.enabled ? calcDynamicLp(multiplier) : 0

  // net_pool = (dynamic_lp×3 + totalUserBet) × 0.8
  const grossPool = dynamicLp * 3 + totalUserBet
  const netPool   = grossPool * 0.8
  const fee       = Math.floor(totalUserBet * FEE_RATE)

  // 사이드별 실효 풀 = 유저 배팅 + dynamic_lp
  const totalPlayer = userPools.player + dynamicLp
  const totalBanker = userPools.banker + dynamicLp
  const totalTie    = userPools.tie    + dynamicLp

  const playerOdds = parseFloat((netPool / totalPlayer).toFixed(4))
  const bankerOdds = parseFloat((netPool / totalBanker).toFixed(4))
  const tieOdds    = parseFloat((netPool / totalTie).toFixed(4))

  return {
    playerOdds: clamp(playerOdds),
    bankerOdds: clamp(bankerOdds),
    tieOdds:    clamp(tieOdds),
    available:  true,
    fee,
    totalPool:  grossPool,
    lpSeed:     dynamicLp * 3,
    lpWeight:   parseFloat(multiplier.toFixed(4)),
    mode:       getMode(multiplier),
  }
}

/**
 * 레이스 배당률 계산
 */
export function calcRaceOdds(
  userPools: RacePools,
  lpConfig: LpConfig,
  userCount: number = 0
): RaceOddsResult {
  const totalUserBet = userPools.bit + userPools.coin + userPools.tie

  // LP 비활성 + 유저 배팅 없음 → 배당 미확정 (pending)
  if (!lpConfig.enabled && totalUserBet === 0) {
    return {
      bitOdds: null, coinOdds: null, tieOdds: null,
      available: false,
      fee: 0, totalPool: 0, lpSeed: 0, lpWeight: 0, mode: "pending",
    }
  }

  const multiplier = lpConfig.enabled ? calcLpMultiplier(totalUserBet, userCount) : 0
  const dynamicLp  = lpConfig.enabled ? calcDynamicLp(multiplier) : 0

  const grossPool = dynamicLp * 3 + totalUserBet
  const netPool   = grossPool * 0.8
  const fee       = Math.floor(totalUserBet * FEE_RATE)

  const totalBit  = userPools.bit  + dynamicLp
  const totalCoin = userPools.coin + dynamicLp
  const totalTie  = userPools.tie  + dynamicLp

  const bitOdds  = parseFloat((netPool / totalBit).toFixed(4))
  const coinOdds = parseFloat((netPool / totalCoin).toFixed(4))
  const tieOdds  = parseFloat((netPool / totalTie).toFixed(4))

  return {
    bitOdds:  clamp(bitOdds),
    coinOdds: clamp(coinOdds),
    tieOdds:  clamp(tieOdds),
    available: true,
    fee,
    totalPool:  grossPool,
    lpSeed:     dynamicLp * 3,
    lpWeight:   parseFloat(multiplier.toFixed(4)),
    mode:       getMode(multiplier),
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

// ────────────────────────────────────────────────────────────────────────────
// 어드민 패널용 시드 자동 계산 헬퍼
// ────────────────────────────────────────────────────────────────────────────

/**
 * 권장 시드 역산
 * "N명이 평균 X원 배팅할 때 LP가 50% 감쇠" 를 목표로 사이드당 시드 계산
 *
 *   halfPoint = targetPlayers × avgBet
 *   lpSeedTotal = halfPoint / multiplier
 *   seed(사이드당) = lpSeedTotal / 3
 */
export function calcRecommendedSeed(
  avgBetAmount:  number,   // 평균 배팅 단위 (원)
  targetPlayers: number,   // 기준 인원 (이 인원이 배팅하면 LP 50%)
  multiplier:    number,   // lp_multiplier (감쇠 속도)
): number {
  const halfPoint = avgBetAmount * targetPlayers
  return Math.round(halfPoint / (3 * multiplier))
}

/**
 * 배팅 단위 프리셋 — 어드민 드롭다운용
 * seed10: 목표 10명 기준, multiplier=1.0 일 때 권장 시드(사이드당)
 */
export const BET_UNIT_PRESETS = [
  { label: "1만원 단위",    avgBet:     10_000, seed10:     33_000 },
  { label: "5만원 단위",    avgBet:     50_000, seed10:    167_000 },
  { label: "10만원 단위",   avgBet:    100_000, seed10:    333_000 },
  { label: "50만원 단위",   avgBet:    500_000, seed10:  1_667_000 },
  { label: "100만원 단위",  avgBet:  1_000_000, seed10:  3_333_000 },
] as const

/** LP 상태를 한국어로 표시 */
export function getLpModeLabel(mode: "seeded" | "decay" | "natural"): string {
  if (mode === "seeded")  return "유동성 안정 구간"
  if (mode === "decay")   return "유동성 감쇠 중"
  return "자연 배당 구간"
}
