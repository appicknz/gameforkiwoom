/**
 * 파리뮤추얼 배당 시스템
 *
 * 설계 원칙:
 * - 가상 LP 풀 없음. 실제 배팅된 금액만으로 배당 계산.
 * - 총 순수익(수수료 차감 후)을 각 사이드 배팅금 비율로 나눔.
 * - 배팅이 없으면 배당 미확정(available: false) — 버튼에 "-" 표시.
 * - 자동배팅이 들어오는 순간부터 실제 배당 표시.
 * - 한 사이드만 배팅 시: 해당 사이드는 최소(1.01x), 나머지는 최대(50x).
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
  lpAmountBaccarat: number
  lpAmountRace: number
  lpMultiplierBaccarat: number
  lpMultiplierRace: number
}

export interface OddsResult {
  playerOdds: number | null
  bankerOdds: number | null
  tieOdds: number | null
  available: boolean
  fee: number
  totalPool: number
  lpSeed: number
  lpWeight: number
  mode: "seeded" | "decay" | "natural" | "pending"
}

export interface RaceOddsResult {
  bitOdds: number | null
  coinOdds: number | null
  tieOdds: number | null
  available: boolean
  fee: number
  totalPool: number
  lpSeed: number
  lpWeight: number
  mode: "seeded" | "decay" | "natural" | "pending"
}

export const DEFAULT_LP_CONFIG: LpConfig = {
  enabled: true,
  lpAmountBaccarat: 333_000,
  lpAmountRace: 333_000,
  lpMultiplierBaccarat: 1.0,
  lpMultiplierRace: 1.0,
}

export function branchToLpConfig(branch: {
  lp_enabled?: boolean | null
  lp_amount_baccarat?: number | null
  lp_amount_race?: number | null
  lp_multiplier_baccarat?: number | null
  lp_multiplier_race?: number | null
}): LpConfig {
  const enabled = branch.lp_enabled ?? true
  return {
    enabled,
    lpAmountBaccarat: enabled ? (branch.lp_amount_baccarat ?? DEFAULT_LP_CONFIG.lpAmountBaccarat) : 0,
    lpAmountRace: enabled ? (branch.lp_amount_race ?? DEFAULT_LP_CONFIG.lpAmountRace) : 0,
    lpMultiplierBaccarat: branch.lp_multiplier_baccarat ?? 1.0,
    lpMultiplierRace: branch.lp_multiplier_race ?? 1.0,
  }
}

export const FEE_RATE = 0.20
const MIN_ODDS = 1.01
const MAX_ODDS = 50.0

function clamp(odds: number): number {
  return Math.min(MAX_ODDS, Math.max(MIN_ODDS, odds))
}

/**
 * 순수 파리뮤추얼 배당 계산
 *
 * netPool = totalBet × (1 - FEE_RATE)
 * odds_side = netPool / pool_side
 *
 * 한 사이드만 배팅: 해당 사이드 1.01x (모두 돌려받는 구조), 나머지 50x
 * 모두 배팅: 실제 비율대로 계산
 */
function calcPariOdds(pools: number[], total: number): number[] {
  const net = total * (1 - FEE_RATE)
  return pools.map(p => {
    if (p === 0) return MAX_ODDS  // 배팅 없는 사이드는 최대 배당
    return clamp(parseFloat((net / p).toFixed(4)))
  })
}

/**
 * 바카라 배당률 계산 — 순수 파리뮤추얼
 */
export function calcBaccaratOdds(
  userPools: BaccaratPools,
  _lpConfig: LpConfig,
  _userCount: number = 0
): OddsResult {
  const total = userPools.player + userPools.banker + userPools.tie

  // 배팅 없으면 미확정 — 첫 배팅 순간 즉시 실시간 배당 표시
  if (total === 0) {
    return {
      playerOdds: null, bankerOdds: null, tieOdds: null,
      available: false,
      fee: 0, totalPool: 0, lpSeed: 0, lpWeight: 0, mode: "pending",
    }
  }

  const [playerOdds, bankerOdds, tieOdds] = calcPariOdds(
    [userPools.player, userPools.banker, userPools.tie],
    total
  )

  return {
    playerOdds,
    bankerOdds,
    tieOdds,
    available: true,
    fee: Math.floor(total * FEE_RATE),
    totalPool: total,
    lpSeed: 0,
    lpWeight: 0,
    mode: "natural",
  }
}

/**
 * 레이스 배당률 계산 — 순수 파리뮤추얼
 */
export function calcRaceOdds(
  userPools: RacePools,
  _lpConfig: LpConfig,
  _userCount: number = 0
): RaceOddsResult {
  const total = userPools.bit + userPools.coin + userPools.tie

  // 배팅 없으면 미확정 — 첫 배팅 순간 즉시 실시간 배당 표시
  if (total === 0) {
    return {
      bitOdds: null, coinOdds: null, tieOdds: null,
      available: false,
      fee: 0, totalPool: 0, lpSeed: 0, lpWeight: 0, mode: "pending",
    }
  }

  const [bitOdds, coinOdds, tieOdds] = calcPariOdds(
    [userPools.bit, userPools.coin, userPools.tie],
    total
  )

  return {
    bitOdds,
    coinOdds,
    tieOdds,
    available: true,
    fee: Math.floor(total * FEE_RATE),
    totalPool: total,
    lpSeed: 0,
    lpWeight: 0,
    mode: "natural",
  }
}

/**
 * 정산 지급액 계산
 */
export function calcPayout(params: {
  betAmount: number
  side: "player" | "banker" | "tie" | "bit" | "coin"
  result: string
  odds: number
}): number {
  if (params.side !== params.result) return 0
  return Math.floor(params.betAmount * params.odds)
}

/**
 * LP 투입액 계산 (하위호환 — 항상 0)
 */
export function calcLpUsed(
  _userPools: BaccaratPools | RacePools,
  _lpConfig: LpConfig,
  _userCount?: number
): number {
  return 0
}

/**
 * 하우스 손익 계산
 */
export function calcHousePnl(params: {
  totalUserBet: number
  totalPayout: number
  totalLpUsed: number
  fee: number
}): { housePnl: number; netFee: number } {
  const housePnl = params.fee + params.totalUserBet - params.totalPayout
  return { housePnl, netFee: params.fee }
}

// 어드민 패널 하위호환용 헬퍼
export function calcRecommendedSeed(
  _avgBetAmount: number,
  _targetPlayers: number,
  _multiplier: number,
): number {
  return 0
}

export const BET_UNIT_PRESETS = [
  { label: "1만원 단위", avgBet: 10_000, seed10: 0 },
  { label: "5만원 단위", avgBet: 50_000, seed10: 0 },
  { label: "10만원 단위", avgBet: 100_000, seed10: 0 },
  { label: "50만원 단위", avgBet: 500_000, seed10: 0 },
  { label: "100만원 단위", avgBet: 1_000_000, seed10: 0 },
] as const

export function getLpModeLabel(_mode: "seeded" | "decay" | "natural"): string {
  return "파리뮤추얼"
}
