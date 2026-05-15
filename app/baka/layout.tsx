import { Sidebar } from "@/components/dashboard/sidebar"
import { TopBar } from "@/components/dashboard/top-bar"
import { GameAccessGate } from "@/components/dashboard/game-access-gate"

export default function BakaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark flex min-h-screen flex-col bg-background">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto lg:ml-64">
          <GameAccessGate>
            {children}
          </GameAccessGate>
        </main>
      </div>
    </div>
  )
}
