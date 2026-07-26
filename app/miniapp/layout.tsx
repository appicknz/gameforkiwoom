import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "BitBaka",
  description: "BitBaka 텔레그램 미니앱",
}

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  // 텔레그램 미니앱 전용 레이아웃 — 사이드바·탑바 없음
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      {children}
    </div>
  )
}
