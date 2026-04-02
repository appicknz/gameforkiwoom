/**
 * LP 시드 자동 계산 — 역대 실시간 배팅 데이터 기반
 *
 * 관리자가 시드를 수동으로 설정하는 대신,
 * 지점의 역대 라운드 평균 배팅액으로 LP 시드를 자동 결정합니다.
 *
 *   seed(사이드당) = 역대 평균 라운드 배팅 / 3
 *
 * 이유:
 *   - 1만원 단위 유저 10명이 LP 시드 1000만원을 절대 극복 못함 → 배당 왜곡
 *   - 시드를 "실제 배팅 규모"에 맞추면 LP가 자연스럽게 감쇠
 *   - 라운드가 쌓일수록 시드가 정교해져서 별도 관리 불필요
 *
 * 데이터가 부족하면 브랜치 설정의 기본값(fallbackSeed) 사용
 */

import { adminSupabase as admin } from "@/lib/supabase-admin"

const MINIMUM_ROUNDS = 3  // 이 라운드 수 이상 쌓여야 자동 계산 적용

/**
 * 지점의 역대 평균 라운드 배팅 기반 LP 시드 자동 계산
 *
 * @param gameType    "baccarat" | "race"
 * @param branchId    지점 UUID (null이면 fallbackSeed 반환)
 * @param fallbackSeed 데이터 부족 시 사용할 기본 시드 (어드민 설정값)
 * @returns 사이드당 시드 금액
 */
export async function calcAutoLpSeed(
  gameType:     string,
  branchId:     string | null,
  fallbackSeed: number,
): Promise<number> {
  if (!branchId) return fallbackSeed

  try {
    // house_stats: 지점+게임타입별 누적 배팅액
    // fee_logs: 정산된 라운드 수 추정 (round_number distinct count)
    const [statsResult, roundCountResult] = await Promise.all([
      admin
        .from("house_stats")
        .select("total_bet")
        .eq("branch_id", branchId)
        .eq("game_type", gameType)
        .single(),
      admin
        .from("fee_logs")
        .select("round_number")
        .eq("branch_id", branchId)
        .eq("game_type", gameType)
        .order("round_number", { ascending: false })
        .limit(1000),
    ])

    const totalBet = statsResult.data?.total_bet ?? 0
    if (totalBet <= 0) return fallbackSeed

    // distinct round_number 수 계산
    const uniqueRounds = new Set(
      (roundCountResult.data ?? []).map((r: { round_number: number }) => r.round_number)
    ).size

    if (uniqueRounds < MINIMUM_ROUNDS) return fallbackSeed

    // 라운드당 평균 배팅 / 3 = 사이드당 시드
    const avgRoundBet = totalBet / uniqueRounds
    const autoSeed    = Math.round(avgRoundBet / 3)

    // 최소 fallbackSeed, 최대 1억
    return Math.min(100_000_000, Math.max(fallbackSeed, autoSeed))
  } catch {
    return fallbackSeed
  }
}
