import type { Metadata } from "next"
import { Sidebar } from "@/components/dashboard/sidebar"
import { TopBar } from "@/components/dashboard/top-bar"

export const metadata: Metadata = {
  title: "판매관리 | BitBet",
  description: "내 컨텐츠 현황과 상품을 관리합니다.",
}

export default function SellerLayout({ children }: { children: React.ReactNode }) {
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
