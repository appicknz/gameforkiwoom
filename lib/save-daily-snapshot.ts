/**
 * lib/save-daily-snapshot.ts
 *
 * day-close cron 과 positions DELETE (confirmed_by_master) 양쪽에서 호출.
 * 해당 날짜의 포지션들을 집계해 daily_snapshots 테이블에 저장.
 * 이미 같은 date_label 스냅샷이 있으면 덮어씀(upsert).
 */
import "server-only"
import { adminSupabase as _admin } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = _admin as any

type SnapshotInput = {
  dateLabel:    string          // "2026-07-28"
  closeType:    "day_close" | "confirmed_by_master"
  margin:       number          // 시작 확정 잔고
  cfgSizeUsd:   number          // 포지션 1건당 USD
  cfgLeverage:  number          // 기본 레버리지
  cfgSlPct:     number          // 기본 SL%
}

export async function saveDailySnapshot(input: SnapshotInput) {
  const { dateLabel, closeType, margin, cfgSizeUsd, cfgLeverage, cfgSlPct } = input

  // 해당 날짜의 전체 종료 포지션 조회
  const { data: positions } = await admin
    .from("auto_signal_positions")
    .select("direction, entry_price, size_usd, leverage, close_reason, closed_roi, final_roi, final_pnl")
    .eq("date_label", dateLabel)
    .eq("is_closed", true)

  if (!positions || positions.length === 0) return

  let totalPnl  = 0
  let totalRoi  = 0
  let slPnl     = 0
  let slCount   = 0
  let profitCnt = 0
  let lossCnt   = 0

  for (const p of positions) {
    const isSl  = p.close_reason === "stop_loss"
    const size  = Number(p.size_usd  ?? cfgSizeUsd)
    const lev   = Number(p.leverage  ?? cfgLeverage)
    let   pnl   = 0
    let   roi   = 0

    if (p.final_pnl != null) {
      pnl = Number(p.final_pnl)
      roi = size > 0 ? pnl / size * 100 : 0
    } else if (p.final_roi != null) {
      roi = Number(p.final_roi)
      pnl = size * (roi / 100)
    } else if (p.closed_roi != null) {
      roi = Number(p.closed_roi)
      pnl = size * (roi / 100)
    } else if (isSl) {
      // SL이지만 roi null → 기본 SL% × leverage
      roi = -(cfgSlPct * lev)
      pnl = size * (roi / 100)
    }
    // roi 끝내 0이면 그대로 0으로 집계 (DB 미저장 레코드)

    totalPnl += pnl
    totalRoi += roi

    if (isSl) {
      slPnl  += pnl
      slCount++
    } else if (roi > 0) {
      profitCnt++
    } else {
      lossCnt++
    }
  }

  const avgRoi   = positions.length > 0 ? totalRoi / positions.length : 0
  const estValue = margin + totalPnl

  await admin
    .from("daily_snapshots")
    .upsert({
      date_label:     dateLabel,
      close_type:     closeType,
      snapped_at:     new Date().toISOString(),
      margin:         margin,
      est_value:      estValue,
      total_pnl:      totalPnl,
      total_roi:      avgRoi,
      sl_pnl:         slPnl,
      sl_count:       slCount,
      position_count: positions.length,
      profit_count:   profitCnt,
      loss_count:     lossCnt,
      liq_count:      slCount,
    }, { onConflict: "date_label" })
}
