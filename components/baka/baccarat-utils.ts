// ─── 바카라 공통 타입/유틸 ──────────────────────────────────────────────────

export type Suit = "♠" | "♥" | "♦" | "♣"
export type BacBetSide = "player" | "banker" | "tie" | null
export type BacResult = "player" | "banker" | "tie"

export interface BacCard {
  suit: Suit
  value: number   // 0~9 (바카라 점수)
  label: string   // "A", "2", ..., "K"
  id: string
}

export interface BacRoundResult {
  round: number
  result: BacResult
  playerCards: BacCard[]
  bankerCards: BacCard[]
  pScore: number
  bScore: number
  bet: BacBetSide
  betAmount: number
  won: boolean
  payout: number  // 순수익 (배팅금 제외)
}

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"]

// 끝자리 숫자 → 바카라 카드 변환
// 0 = 10/J/Q/K (점수 0), 1 = A (점수 1), 2~9 = 액면가
export function digitToCard(digit: number, seed: number): BacCard {
  const suit = SUITS[seed % 4]
  if (digit === 0) {
    const zeroLabels = ["10", "J", "Q", "K"]
    const label = zeroLabels[seed % 4]
    return { suit, value: 0, label, id: `${Date.now()}-${Math.random()}` }
  }
  if (digit === 1) {
    return { suit, value: 1, label: "A", id: `${Date.now()}-${Math.random()}` }
  }
  return { suit, value: digit, label: String(digit), id: `${Date.now()}-${Math.random()}` }
}

export function handScore(cards: BacCard[]) {
  return cards.reduce((s, c) => s + c.value, 0) % 10
}

// 바카라 3번째 카드 규칙
export function shouldPlayerDraw(pScore: number) {
  return pScore <= 5
}

export function shouldBankerDraw(bScore: number, pThird: BacCard | null): boolean {
  if (!pThird) return bScore <= 5
  const pt = pThird.value
  if (bScore <= 2) return true
  if (bScore === 3) return pt !== 8
  if (bScore === 4) return pt >= 2 && pt <= 7
  if (bScore === 5) return pt >= 4 && pt <= 7
  if (bScore === 6) return pt === 6 || pt === 7
  return false
}

// 배당률
export const BAC_PAYOUT: Record<"player" | "banker" | "tie", number> = {
  player: 2.0,   // 1배
  banker: 1.95,  // 0.95배 (커미션)
  tie: 9.0,      // 8배
}
