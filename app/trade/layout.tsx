export const dynamic = "force-dynamic"
import { PortalShell } from "@/components/dashboard/portal-shell"

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>
}
