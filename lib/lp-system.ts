/**
 * AMM 시드 풀 기반 파리뮤추얼 배당 시스템
 *
 * 구조:
 *   - LP는 Player / Banker / Tie 각 사이드에 균등 시딩
 *   - 유저 배팅이 추가될수록 해당 사이드 풀이 커지고 배당이 낮아짐
 *   - 수수료는 전체 풀(유저 + LP 시드)의 20% → 하우스 수익
 *   - 배당 = 전체 배당풀 / 해당 사이드 풀
 *
 * 예시 (LP 시드 각 1000만, Banker에 100만 추가):
 *   Player 10M / Banker 11M / Tie 10M = 총 31M
 *   수수료 6.2M → 하우스
 *   배당풀 24.8M
 *   Player 배당 = 24.8 / 10 = 2.48x
 *   Banker 배당 = 24.8 / 11 = 2.25x  ← 많이 걸릴수록 낮아짐
 *   Tie    배당 = 24.8 / 10 = 2.48x
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
  // 각 사이드에 균등 시딩되는 LP 금액
  // Player, Banker, Tie 각각 이 금액으로 시작
  lpAmountBaccarat: number  // 바카라 사이드별 시드 금액
  lpAmountRace: number      // 레이스 사이드별 시드 금액
  // 아래 두 필드는 하위호환성 유지용 (사용하지 않음)
  lpMultiplierBaccarat: number
  lpMultiplierRace: number
}

export interface OddsResult {
  playerOdds: number
  bankerOdds: number
  tieOdds: number
  fee: number         // 하우스 수수료
  totalPool: number   // 전체 풀 (유저 + LP 시드 합계)
  lpSeed: number      // LP 시드 총액 (각 사이드 × 3)
  mode: "seeded"
}

export interface RaceOddsResult {
  bitOdds: number
  coinOdds: number
  tieOdds: number
  fee: number
  totalPool: number
  lpSeed: number
  mode: "seeded"
}

// 기본 LP 설정 (DB 조회 실패 시 fallback)
export const DEFAULT_LP_CONFIG: LpConfig = {
  enabled: true,
  lpAmountBaccarat: 10_000_000,  // 각 사이드 1000만원 시딩
  lpAmountRace:     10_000_000,
  lpMultiplierBaccarat: 1.0,
  lpMultiplierRace: 1.0,
}

/** DB branches 행에서 LpConfig 추출 */
export function branchToLpConfig(branch: {
  lp_enabled?: boolean | null
  lp_amount_baccarat?: number | null
  lp_amount_race?: number | null
  lp_multiplier_baccarat?: number | null
  lp_multiplier_race?: number | null
}): LpConfig {
  return {
    enabled:              branch.lp_enabled             ?? true,
    lpAmountBaccarat:     branch.lp_amount_baccarat     ?? DEFAULT_LP_CONFIG.lpAmountBaccarat,
    lpAmountRace:         branch.lp_amount_race         ?? DEFAULT_LP_CONFIG.lpAmountRace,
    lpMultiplierBaccarat: branch.lp_multiplier_baccarat ?? 1.0,
    lpMultiplierRace:     branch.lp_multiplier_race     ?? 1.0,
  }
}

// 수수료율 20% — 하우스가 무조건 차감
const FEE_RATE = 0.20

// 배당 캡 (비정상 상황 방어용)
const MIN_ODDS = 1.01
const MAX_ODDS = 50.0

/**
 * 바카라 배당률 계산
 *
 * @param userPools  유저가 배팅한 실제 금액
 * @param lpConfig   지점 LP 설정 (lpAmountBaccarat = 각 사이드 시드 금액)
 */
export function calcBaccaratOdds(
  userPools: BaccaratPools,
  lpConfig: LpConfig,
  _userCount?: number   // 하위호환성 유지, 사용하지 않음
): OddsResult {
  // LP 시드: 각 사이드에 균등 투입
  const seed = lpConfig.enabled ? lpConfig.lpAmountBaccarat : 0

  const totalPlayer = userPools.player + seed
  const totalBanker = userPools.banker + seed
  const totalTie    = userPools.tie    + seed

  const totalPool = totalPlayer + totalBanker + totalTie
  const fee       = Math.floor(totalPool * FEE_RATE)   // 하우스 무조건 20%
  const giveout   = totalPool - fee                    // 배당풀

  // 배당 = 배당풀 / 각 사이드 풀
  const playerOdds = parseFloat((giveout / totalPlayer).toFixed(4))
  const bankerOdds = parseFloat((giveout / totalBanker).toFixed(4))
  const tieOdds    = parseFloat((giveout / totalTie).toFixed(4))

  return {
    playerOdds: Math.min(MAX_ODDS, Math.max(MIN_ODDS, playerOdds)),
    bankerOdds: Math.min(MAX_ODDS, Math.max(MIN_ODDS, bankerOdds)),
    tieOdds:    Math.min(MAX_ODDS, Math.max(MIN_ODDS, tieOdds)),
    fee,
    totalPool,
    lpSeed: seed * 3,
    mode: "seeded",
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

  const totalBit  = userPools.bit  + seed
  const totalCoin = userPools.coin + seed
  const totalTie  = userPools.tie  + seed

  const totalPool = totalBit + totalCoin + totalTie
  const fee       = Math.floor(totalPool * FEE_RATE)
  const giveout   = totalPool - fee

  const bitOdds  = parseFloat((giveout / totalBit).toFixed(4))
  const coinOdds = parseFloat((giveout / totalCoin).toFixed(4))
  const tieOdds  = parseFloat((giveout / totalTie).toFixed(4))

  return {
    bitOdds:  Math.min(MAX_ODDS, Math.max(MIN_ODDS, bitOdds)),
    coinOdds: Math.min(MAX_ODDS, Math.max(MIN_ODDS, coinOdds)),
    tieOdds:  Math.min(MAX_ODDS, Math.max(MIN_ODDS, tieOdds)),
    fee,
    totalPool,
    lpSeed: seed * 3,
    mode: "seeded",
  }
}

/**
 * 정산 시 실제 지급액 계산
 *
 * winner에게 지급 = winner 배팅액 × 배당률
 * 하우스 실수익  = 수수료 - (지급액 - 유저 배팅 합계)
 *                = 수수료가 LP 시드 손실을 커버하고 남은 부분
 */
export function calcPayout(params: {
  betAmount: number        // 유저 배팅액
  side: "player" | "banker" | "tie" | "bit" | "coin"
  result: string           // 실제 결과
  odds: number             // 해당 사이드의 배당률
}): number {
  if (params.side !== params.result) return 0
  return Math.floor(params.betAmount * params.odds)
}

/**
 * LP 투입액 계산 (라운드 정산용 — 하위호환)
 */
export function calcLpUsed(
  _userPools: BaccaratPools | RacePools,
  lpConfig: LpConfig,
  _userCount?: number
): number {
  if (!lpConfig.enabled) return 0
  // 시드는 3 사이드에 균등 투입
  return lpConfig.lpAmountBaccarat * 3
}

/**
 * 하우스 손익 계산
 * 수수료(전체 풀의 20%) - LP 시드 중 지급에 사용된 부분
 */
export function calcHousePnl(params: {
  totalUserBet: number
  totalPayout: number
  totalLpUsed: number
  fee: number
}): {
  housePnl: number
  netFee: number
} {
  // 하우스 순손익 = 수수료 + 유저 배팅 수집 - 지급액
  // (LP 시드는 하우스 자금이므로 지급에 LP가 쓰이면 손해)
  const housePnl = params.fee + params.totalUserBet - params.totalPayout
  return {
    housePnl,
    netFee: params.fee,
  }
}
