import { TopBar } from "@/components/dashboard/top-bar"
import { PortalHeader } from "@/components/dashboard/portal-header"
export function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-background">
      <TopBar />
      <PortalHeader />
      <main className="min-h-[calc(100vh-12rem)] w-full overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}
