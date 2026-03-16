import { Sidebar } from "@/components/dashboard/sidebar"
import { TopBar } from "@/components/dashboard/top-bar"
import { BitcoinChart } from "@/components/dashboard/bitcoin-chart"
import { BettingGame } from "@/components/dashboard/betting-game"
import { ProjectAnalytics } from "@/components/dashboard/project-analytics"
import { ClosingPricesBadges } from "@/components/dashboard/closing-prices-badges"
import { ClosingPrices } from "@/components/dashboard/closing-prices"
import { BaccaratRoadStats } from "@/components/dashboard/baccarat-road-stats"

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64">
        <div className="mt-4 md:mt-5 space-y-3 md:space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
            <div className="lg:col-span-2 space-y-3 md:space-y-4">
              <BitcoinChart />
              <BettingGame />
              <ProjectAnalytics />
            </div>

            <div className="space-y-3 md:space-y-4">
              <ClosingPricesBadges />
              <ClosingPrices />
              <BaccaratRoadStats />
            </div>
          </div>
        </div>
      </main>
      </div>
    </div>
  )
}
