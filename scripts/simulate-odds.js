/**
 * 바카라 배당률 시뮬레이션
 * 플레이어 배팅만 증가하면서 배당률 변화를 보여줌
 */

// LP 시스템 복사본 (시뮬레이션용)
const FEE_RATE = 0.20
const MIN_ODDS = 1.05
const MAX_ODDS = 9.0

function getMode(userCount: number) {
  if (userCount >= 10) return "pari"
  if (userCount >= 3) return "hybrid"
  return "lp-dominant"
}

function getLpMultiplier(mode) {
  switch (mode) {
    case "lp-dominant": return 1.0
    case "hybrid":      return 0.5
    case "pari":        return 0.1
  }
}

function calcBaccaratOdds(userPools, lpConfig, userCount) {
  const mode = getMode(userCount)
  const lpMult = getLpMultiplier(mode)

  const baseLp = lpConfig.enabled ? lpConfig.lpAmountBaccarat : 0
  const lpPerSide = Math.floor((baseLp * lpMult) / 3)

  const totalPlayer = userPools.player + lpPerSide
  const totalBanker = userPools.banker + lpPerSide
  const totalTie    = userPools.tie + Math.floor(lpPerSide * 0.3)

  const totalPool = totalPlayer + totalBanker + totalTie
  const fee = Math.floor(totalPool * FEE_RATE)
  const giveout = totalPool - fee

  const rawPlayerOdds = giveout / totalPlayer
  const rawBankerOdds = giveout / totalBanker
  const rawTieOdds    = giveout / totalTie

  return {
    playerOdds: Math.max(MIN_ODDS, Math.min(MAX_ODDS, rawPlayerOdds)),
    bankerOdds: Math.max(MIN_ODDS, Math.min(MAX_ODDS, rawBankerOdds)),
    tieOdds: Math.max(MIN_ODDS, Math.min(MAX_ODDS * 1.33, rawTieOdds)),
    fee,
    totalPool,
    mode,
    lpPerSide,
  }
}

// 시뮬레이션
const lpConfig = {
  enabled: true,
  lpAmountBaccarat: 50000,
  lpAmountRace: 50000,
}

const scenarios = [
  { users: 1, playerBets: [10000] },
  { users: 2, playerBets: [10000, 10000] },
  { users: 3, playerBets: [10000, 10000, 10000] },
  { users: 4, playerBets: [10000, 10000, 10000, 10000] },
  { users: 5, playerBets: [10000, 10000, 10000, 10000, 10000] },
  { users: 2, playerBets: [10000, 100000] }, // 큰 배팅 유입
  { users: 3, playerBets: [10000, 10000, 100000] },
  { users: 5, playerBets: [10000, 10000, 10000, 10000, 100000] },
  { users: 10, playerBets: Array(10).fill(10000) },
  { users: 10, playerBets: [10000, 10000, 10000, 10000, 10000, 100000, 100000, 100000, 100000, 100000] },
]

console.log("🎰 바카라 배당률 시뮬레이션")
console.log("=".repeat(100))
console.log("기본 LP: 50,000원 | 수수료율: 20% | 배당 캡: 1.05~9.0배\n")

scenarios.forEach((scenario, idx) => {
  const totalPlayerBet = scenario.playerBets.reduce((a, b) => a + b, 0)
  const userPools = {
    player: totalPlayerBet,
    banker: 0, // 뱅커 배팅 없음
    tie: 0,
  }

  const odds = calcBaccaratOdds(userPools, lpConfig, scenario.users)

  // 정산 시나리오 (플레이어 승리)
  const houseProfit = odds.fee
  const lpUsed = odds.lpPerSide
  const playerWinnings = Math.floor(totalPlayerBet * odds.playerOdds)
  const houseLoss = playerWinnings - totalPlayerBet

  console.log(`시나리오 ${idx + 1}: ${scenario.users}명 배팅`)
  console.log(`├─ 배팅 분포: ${scenario.playerBets.join(", ")}`)
  console.log(`├─ 총 배팅액: ₩${totalPlayerBet.toLocaleString()}`)
  console.log(`├─ 모드: ${odds.mode.toUpperCase()} (LP 비중: ${getLpMultiplier(odds.mode) * 100}%)`)
  console.log(`├─ LP 투입 (측): ₩${odds.lpPerSide.toLocaleString()}`)
  console.log(`├─ 총 풀 (배팅 + LP): ₩${odds.totalPool.toLocaleString()}`)
  console.log(`├─ 수수료 (20%): ₩${odds.fee.toLocaleString()}`)
  console.log(`├─ 배당률: ${odds.playerOdds.toFixed(2)}:1 (원본: ${(odds.totalPool / (totalPlayerBet + odds.lpPerSide)).toFixed(2)}:1)`)
  console.log(`├─ [플레이어 승리 시]`)
  console.log(`│  ├─ 플레이어 지급액: ₩${playerWinnings.toLocaleString()} (₩${totalPlayerBet.toLocaleString()} × ${odds.playerOdds.toFixed(2)})`)
  console.log(`│  ├─ 하우스 손익: ₩-${Math.abs(houseLoss).toLocaleString()} (배팅액 회수 ${totalPlayerBet.toLocaleString()} - 지급액 ${playerWinnings.toLocaleString()})`)
  console.log(`│  └─ 하우스 순이익: ₩${(houseProfit - houseLoss).toLocaleString()} (수수료 ${houseProfit.toLocaleString()} - 손실 ${houseLoss.toLocaleString()})`)
  console.log()
})
