import type { Metadata } from "next"
import { PortalShell } from "@/components/dashboard/portal-shell"

export const metadata: Metadata = {
  title: "정산관리 | BitBet",
  description: "판매 수익 정산 내역과 정산수단을 관리합니다.",
}

export default function SettlementLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>
}
