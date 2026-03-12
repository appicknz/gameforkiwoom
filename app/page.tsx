"use client"

import { useState, useCallback, useEffect } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { TopBar } from "@/components/dashboard/top-bar"
import { BitcoinChart } from "@/components/dashboard/bitcoin-chart"
import { BettingGame } from "@/components/dashboard/betting-game"
import BaccaratGame from "@/components/baka/baccarat-game"
import { ProjectAnalytics } from "@/components/dashboard/project-analytics"
import { ClosingPricesBadges } from "@/components/dashboard/closing-prices-badges"
import { ClosingPrices } from "@/components/dashboard/closing-prices"

interface BacCard { suit: string; value: number; label: string; id: string }
interface CardOverlayData {
  playerCards: BacCard[]
  bankerCards: BacCard[]
  pScore: number
  bScore: number
  result: "player" | "banker" | "tie" | null
}

export default function DashboardPage() {
  const [cardData, setCardData] = useState<CardOverlayData | null>(null)
  const [balance, setBalance] = useState<number | null>(null)

  const handleCardsChange = useCallback((data: CardOverlayData) => setCardData(data), [])
  const handleBalanceChange = useCallback((newBalance: number) => {
    setBalance(newBalance)
    window.dispatchEvent(new CustomEvent("balance:update", { detail: newBalance }))
  }, [])

  // BettingGame이 잔고를 업데이트하면 BaccaratGame에도 동기화
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (typeof e.detail === "number") setBalance(e.detail)
    }
    window.addEventListener("balance:update", handler as EventListener)
    return () => window.removeEventListener("balance:update", handler as EventListener)
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64">
          <div className="mt-4 md:mt-5 space-y-3 md:space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
              <div className="lg:col-span-2 space-y-3 md:space-y-4">
                {/* /baka와 동일: 차트 + 카드 오버레이 */}
                <style>{`@keyframes cardDeal{from{opacity:0;transform:rotateY(90deg)}to{opacity:1;transform:rotateY(0deg)}}`}</style>
                <BitcoinChart cardData={cardData} />
                <BettingGame />
                <ProjectAnalytics />
              </div>

              <div className="space-y-3 md:space-y-4">
                <ClosingPricesBadges />
                {/* 바카라 게임 패널 — 잔고 공유 */}
                <div className="rounded-2xl overflow-hidden border border-border/40">
                  <BaccaratGame
                    onCardsChange={handleCardsChange}
                    externalBalance={balance}
                    onBalanceChange={handleBalanceChange}
                  />
                </div>
                <ClosingPrices />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
