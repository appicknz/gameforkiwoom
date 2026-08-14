import { GameAccessGate } from "@/components/dashboard/game-access-gate"
import { PortalShell } from "@/components/dashboard/portal-shell"

export default function RaceLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell><GameAccessGate>{children}</GameAccessGate></PortalShell>
}
