import type { Metadata } from "next"
import { PortalShell } from "@/components/dashboard/portal-shell"

export const metadata: Metadata = {
  title: "구매내역 | BitBet",
  description: "내가 구매한 마켓 상품 내역을 확인합니다.",
}

export default function PurchasesLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>
}
