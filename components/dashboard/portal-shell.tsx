import { Sidebar } from "@/components/dashboard/sidebar"
import { TopBar } from "@/components/dashboard/top-bar"
import { PortalHeader } from "@/components/dashboard/portal-header"
import { PortalRail } from "@/components/dashboard/portal-rail"

export function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-background">
      <TopBar />
      <PortalRail />
      <Sidebar drawerOnly />
      <div className="lg:pl-16">
        <PortalHeader />
        <main className="min-h-[calc(100vh-12rem)] w-full overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
