import { Sidebar } from "@/components/dashboard/sidebar"
import { TopBar } from "@/components/dashboard/top-bar"
import { BaccaratRoadStats } from "@/components/dashboard/baccarat-road-stats"

export default function BaccaratStatsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64">
          <div className="mt-4 md:mt-5 max-w-3xl">
            <h1
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "rgba(212,175,55,0.85)",
                letterSpacing: "0.1em",
                marginBottom: 16,
              }}
            >
              BACCARAT 통계
            </h1>
            <BaccaratRoadStats />
          </div>
        </main>
      </div>
    </div>
  )
}
