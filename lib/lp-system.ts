/**
 * LP + 파리뮤추얼 하이브리드 배당 시스템
 *
 * 유저가 적을 때 → LP가 상대방이 되어 배당 보장
 * 유저가 많아질수록 → 자동으로 파리뮤추얼 비중 증가
 * 수수료 20% 적용, 배당 캡 1.2 ~ 9.0배
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
  lpAmountBaccarat: number      // 바카라 최소 보장 LP (배팅이 0원일 때 바닥값)
  lpAmountRace: number          // 레이스 최소 보장 LP
  lpMultiplierBaccarat: number  // 배팅풀 대비 LP 배율 (1.0 = 배팅액 100% 대응)
  lpMultiplierRace: number      // 레이스 배율
}

export interface OddsResult {
  playerOdds: number
  bankerOdds: number
  tieOdds: number
  fee: number
  totalPool: number
  mode: "lp-dominant" | "hybrid" | "pari"
}

export interface RaceOddsResult {
  bitOdds: number
  coinOdds: number
  tieOdds: number
  fee: number
  totalPool: number
  mode: "lp-dominant" | "hybrid" | "pari"
}

// 기본 LP 설정 (DB 조회 실패 시 fallback)
export const DEFAULT_LP_CONFIG: LpConfig = {
  enabled: true,
  lpAmountBaccarat: 50000,
  lpAmountRace: 50000,
  lpMultiplierBaccarat: 1.0,  // 배팅액 100% 대응
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
    enabled:              branch.lp_enabled              ?? true,
    lpAmountBaccarat:     branch.lp_amount_baccarat      ?? DEFAULT_LP_CONFIG.lpAmountBaccarat,
    lpAmountRace:         branch.lp_amount_race          ?? DEFAULT_LP_CONFIG.lpAmountRace,
    lpMultiplierBaccarat: branch.lp_multiplier_baccarat  ?? DEFAULT_LP_CONFIG.lpMultiplierBaccarat,
    lpMultiplierRace:     branch.lp_multiplier_race      ?? DEFAULT_LP_CONFIG.lpMultiplierRace,
  }
}

// 수수료율 (20%)
const FEE_RATE = 0.20

// 배당 캡
const MIN_ODDS = 1.05
const MAX_ODDS = 9.0
const MAX_ODDS_TIE = 12.0

// 유저 수에 따른 모드 결정
function getMode(userCount: number): "lp-dominant" | "hybrid" | "pari" {
  if (userCount >= 10) return "pari"
  if (userCount >= 3) return "hybrid"
  return "lp-dominant"
}

// LP 비중 계산 (유저 수에 따라 LP 기여 비율 감소)
function getLpMultiplier(mode: "lp-dominant" | "hybrid" | "pari"): number {
  switch (mode) {
    case "lp-dominant": return 1.0   // LP 100% 기여
    case "hybrid":      return 0.5   // LP 50% 기여
    case "pari":        return 0.1   // LP 10% (최소 유동성만)
  }
}

/**
 * 바카라 배당률 계산
 * @param userPools 유저 배팅 풀
 * @param lpConfig 지점 LP 설정
 * @param userCount 현재 라운드 배팅 유저 수
 */
export function calcBaccaratOdds(
  userPools: BaccaratPools,
  lpConfig: LpConfig,
  userCount: number
): OddsResult {
  const mode = getMode(userCount)
  const lpMult = getLpMultiplier(mode)

  if (!lpConfig.enabled) {
    // LP 비활성: 유저 배팅만으로 계산 (배팅 없으면 MIN_ODDS 반환)
    const totalPool = userPools.player + userPools.banker + userPools.tie
    if (totalPool === 0) return { playerOdds: MIN_ODDS, bankerOdds: MIN_ODDS, tieOdds: MIN_ODDS, fee: 0, totalPool: 0, mode }
    const fee = Math.floor(totalPool * FEE_RATE)
    const giveout = totalPool - fee
    return {
      playerOdds: Math.min(MAX_ODDS, Math.max(MIN_ODDS, parseFloat((giveout / (userPools.player || 1)).toFixed(2)))),
      bankerOdds: Math.min(MAX_ODDS, Math.max(MIN_ODDS, parseFloat((giveout / (userPools.banker || 1)).toFixed(2)))),
      tieOdds:    Math.min(MAX_ODDS_TIE, Math.max(MIN_ODDS, parseFloat((giveout / (userPools.tie || 1)).toFixed(2)))),
      fee, totalPool, mode,
    }
  }

  // 실제 LP = max(최소보장LP, 실제배팅풀합계 × 배율) × 유저수모드보정
  const userBettingTotal = userPools.player + userPools.banker + userPools.tie
  const multiplier = lpConfig.lpMultiplierBaccarat ?? 1.0
  const rawLp = Math.max(
    lpConfig.lpAmountBaccarat,                           // 최소 보장 (바닥값)
    Math.floor(userBettingTotal * multiplier)            // 배팅액 × 배율
  )
  const totalLp = Math.floor(rawLp * lpMult)

  // 타이에 10%, 나머지 90%를 player/banker에 집중 배분
  const tieBase = Math.floor(totalLp * 0.10)
  const mainLp  = totalLp - tieBase   // player+banker에 배분할 LP

  // player/banker 중 더 적은 쪽에 LP를 더 넣어 균형 유지
  const pUser = userPools.player
  const bUser = userPools.banker
  const pBias = bUser > pUser ? 0.65 : pUser > bUser ? 0.35 : 0.50  // 부족한 쪽에 더 배분
  const lpForPlayer = Math.floor(mainLp * pBias)
  const lpForBanker = mainLp - lpForPlayer

  const totalPlayer = pUser + lpForPlayer
  const totalBanker = bUser + lpForBanker
  const totalTie    = userPools.tie + tieBase

  const totalPool = totalPlayer + totalBanker + totalTie
  const fee       = Math.floor(totalPool * FEE_RATE)
  const giveout   = totalPool - fee

  const rawPlayerOdds = giveout / totalPlayer
  const rawBankerOdds = giveout / totalBanker
  const rawTieOdds    = totalTie > 0 ? giveout / totalTie : MAX_ODDS_TIE

  return {
    playerOdds: Math.min(MAX_ODDS,     Math.max(MIN_ODDS, parseFloat(rawPlayerOdds.toFixed(2)))),
    bankerOdds: Math.min(MAX_ODDS,     Math.max(MIN_ODDS, parseFloat(rawBankerOdds.toFixed(2)))),
    tieOdds:    Math.min(MAX_ODDS_TIE, Math.max(MIN_ODDS, parseFloat(rawTieOdds.toFixed(2)))),
    fee,
    totalPool,
    mode,
  }
}

/**
 * 레이스 배당률 계산
 */
export function calcRaceOdds(
  userPools: RacePools,
  lpConfig: LpConfig,
  userCount: number
): RaceOddsResult {
  const mode = getMode(userCount)
  const lpMult = getLpMultiplier(mode)

  if (!lpConfig.enabled) {
    const totalPool = userPools.bit + userPools.coin + userPools.tie
    if (totalPool === 0) return { bitOdds: MIN_ODDS, coinOdds: MIN_ODDS, tieOdds: MIN_ODDS, fee: 0, totalPool: 0, mode }
    const fee = Math.floor(totalPool * FEE_RATE)
    const giveout = totalPool - fee
    return {
      bitOdds:  Math.min(MAX_ODDS, Math.max(MIN_ODDS, parseFloat((giveout / (userPools.bit  || 1)).toFixed(2)))),
      coinOdds: Math.min(MAX_ODDS, Math.max(MIN_ODDS, parseFloat((giveout / (userPools.coin || 1)).toFixed(2)))),
      tieOdds:  Math.min(MAX_ODDS_TIE, Math.max(MIN_ODDS, parseFloat((giveout / (userPools.tie || 1)).toFixed(2)))),
      fee, totalPool, mode,
    }
  }

  const userBettingTotal = userPools.bit + userPools.coin + userPools.tie
  const multiplier = lpConfig.lpMultiplierRace ?? 1.0
  const rawLp = Math.max(
    lpConfig.lpAmountRace,
    Math.floor(userBettingTotal * multiplier)
  )
  const totalLp = Math.floor(rawLp * lpMult)
  const tieBase = Math.floor(totalLp * 0.10)
  const mainLp  = totalLp - tieBase

  // 부족한 쪽(bit/coin)에 LP 집중 투입
  const bUser = userPools.bit
  const cUser = userPools.coin
  const bBias = cUser > bUser ? 0.65 : bUser > cUser ? 0.35 : 0.50
  const lpForBit  = Math.floor(mainLp * bBias)
  const lpForCoin = mainLp - lpForBit

  const totalBit  = bUser + lpForBit
  const totalCoin = cUser + lpForCoin
  const totalTie  = userPools.tie + tieBase

  const totalPool = totalBit + totalCoin + totalTie
  const fee       = Math.floor(totalPool * FEE_RATE)
  const giveout   = totalPool - fee

  const rawBitOdds  = giveout / totalBit
  const rawCoinOdds = giveout / totalCoin
  const rawTieOdds  = totalTie > 0 ? giveout / totalTie : MAX_ODDS_TIE

  return {
    bitOdds:  Math.min(MAX_ODDS,     Math.max(MIN_ODDS, parseFloat(rawBitOdds.toFixed(2)))),
    coinOdds: Math.min(MAX_ODDS,     Math.max(MIN_ODDS, parseFloat(rawCoinOdds.toFixed(2)))),
    tieOdds:  Math.min(MAX_ODDS_TIE, Math.max(MIN_ODDS, parseFloat(rawTieOdds.toFixed(2)))),
    fee,
    totalPool,
    mode,
  }
}

/**
 * 정산 시 하우스 손익 계산
 * winner에게 지급한 금액 - 유저 배팅 수집액 = 하우스 손익 (음수면 하우스 손해)
 */
export function calcHousePnl(params: {
  totalUserBet: number      // 이번 라운드 전체 유저 배팅 합계
  totalPayout: number       // 이번 라운드 전체 지급 합계
  totalLpUsed: number       // LP로 투입된 금액
  fee: number               // 수수료 수입
}): {
  housePnl: number          // 하우스 순손익 (+ 이익, - 손해)
  netFee: number            // 실제 수수료 수입
} {
  // 하우스 손익 = 유저로부터 받은 금액 - 지급액 - LP 투입액 + 수수료
  const housePnl = params.totalUserBet - params.totalPayout - params.totalLpUsed + params.fee
  return {
    housePnl,
    netFee: params.fee,
  }
}

/**
 * LP 투입액 계산 (라운드 정산용)
 */
export function calcLpUsed(
  userPools: BaccaratPools | RacePools,
  lpConfig: LpConfig,
  userCount: number
): number {
  if (!lpConfig.enabled) return 0
  const mode = getMode(userCount)
  const lpMult = getLpMultiplier(mode)
  return Math.floor(lpConfig.lpAmountBaccarat * lpMult)
}
