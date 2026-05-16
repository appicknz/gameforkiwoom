import type { Metadata } from "next"
import { Sidebar } from "@/components/dashboard/sidebar"
import { TopBar } from "@/components/dashboard/top-bar"

export const metadata: Metadata = {
  title: "구매내역 | BitBet",
  description: "내가 구매한 마켓 상품 내역을 확인합니다.",
}

export default function PurchasesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark flex min-h-screen flex-col bg-background">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto lg:ml-64">
          {children}
        </main>
      </div>
    </div>
  )
}
