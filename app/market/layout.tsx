import type { Metadata } from "next"
import { PortalShell } from "@/components/dashboard/portal-shell"

export const metadata: Metadata = {
  title: "마켓 | BitBet",
  description: "디지털 상품을 구매하세요.",
}

export default function MarketLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>
}
