import type { Metadata } from "next"
import { SignalStatisticsDashboard } from "@/components/signal-statistics/signal-statistics-dashboard"

export const metadata: Metadata = {
  title: "실제 신호 통계 | Trading Market",
  description: "실제 수신 웹훅 JSON과 Binance 가격으로 계산한 조건별 신호 성과 통계",
}

export default function SignalStatisticsPage() {
  return <SignalStatisticsDashboard />
}
