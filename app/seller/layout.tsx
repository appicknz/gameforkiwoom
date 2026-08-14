import type { Metadata } from "next"
import { PortalShell } from "@/components/dashboard/portal-shell"

export const metadata: Metadata = {
  title: "판매관리 | BitBet",
  description: "내 컨텐츠 현황과 상품을 관리합니다.",
}

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>
}
