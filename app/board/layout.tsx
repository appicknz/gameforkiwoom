import type { Metadata } from "next"
import { PortalShell } from "@/components/dashboard/portal-shell"

export const metadata: Metadata = {
  title: "게시판 | BitBet",
  description: "지표와 트레이딩 정보를 공유하는 게시판입니다.",
}

export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>
}
