import { TopBar } from "@/components/dashboard/top-bar"
import { BitcoinChart } from "@/components/dashboard/bitcoin-chart"
import { BettingGame } from "@/components/dashboard/betting-game"
import { ClosingPricesBadges } from "@/components/dashboard/closing-prices-badges"
import { ClosingPrices } from "@/components/dashboard/closing-prices"

export default function WidgetPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopBar />
      <main className="flex-1 p-3 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 space-y-3">
            <BitcoinChart showBackground={true} />
            <BettingGame />
          </div>
          <div className="space-y-3">
            <ClosingPricesBadges />
            <ClosingPrices />
          </div>
        </div>
      </main>
    </div>
  )
}
