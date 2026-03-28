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
  lpAmountBaccarat: number  // 바카라용 LP 기본 투입액
  lpAmountRace: number      // 레이스용 LP 기본 투입액
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

  // LP 투입량 (유저 수에 따라 조정)
  const baseLp = lpConfig.enabled ? lpConfig.lpAmountBaccarat : 0
  const lpPerSide = Math.floor((baseLp * lpMult) / 3)

  // 총 풀 = 유저 배팅 + LP
  const totalPlayer = userPools.player + lpPerSide
  const totalBanker = userPools.banker + lpPerSide
  const totalTie    = userPools.tie + Math.floor(lpPerSide * 0.3) // 타이 LP는 더 적게

  const totalPool = totalPlayer + totalBanker + totalTie
  const fee = Math.floor(totalPool * FEE_RATE)
  const giveout = totalPool - fee

  // 배당률 계산 (수익 풀 / 해당 사이드 풀)
  const rawPlayerOdds = giveout / totalPlayer
  const rawBankerOdds = giveout / totalBanker
  const rawTieOdds    = giveout / totalTie

  return {
    playerOdds: Math.min(MAX_ODDS, Math.max(MIN_ODDS, parseFloat(rawPlayerOdds.toFixed(2)))),
    bankerOdds: Math.min(MAX_ODDS, Math.max(MIN_ODDS, parseFloat(rawBankerOdds.toFixed(2)))),
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

  const baseLp = lpConfig.enabled ? lpConfig.lpAmountRace : 0
  const lpPerSide = Math.floor((baseLp * lpMult) / 3)

  const totalBit  = userPools.bit + lpPerSide
  const totalCoin = userPools.coin + lpPerSide
  const totalTie  = userPools.tie + Math.floor(lpPerSide * 0.3)

  const totalPool = totalBit + totalCoin + totalTie
  const fee = Math.floor(totalPool * FEE_RATE)
  const giveout = totalPool - fee

  const rawBitOdds  = giveout / totalBit
  const rawCoinOdds = giveout / totalCoin
  const rawTieOdds  = giveout / totalTie

  return {
    bitOdds:  Math.min(MAX_ODDS, Math.max(MIN_ODDS, parseFloat(rawBitOdds.toFixed(2)))),
    coinOdds: Math.min(MAX_ODDS, Math.max(MIN_ODDS, parseFloat(rawCoinOdds.toFixed(2)))),
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
