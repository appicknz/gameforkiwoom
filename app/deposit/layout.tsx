import type { Metadata } from "next"
import { PortalShell } from "@/components/dashboard/portal-shell"

export const metadata: Metadata = {
  title: "토큰 입금 | Tasko",
  description: "토큰을 입금해 잔고를 충전하세요.",
}

export default function DepositLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>
}
