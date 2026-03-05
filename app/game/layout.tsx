import type { Metadata } from "next"
import { ThemeProvider } from "@/components/theme-provider"

export const metadata: Metadata = {
  title: "BTC 배팅 게임",
  description: "실시간 비트코인 가격 배팅 게임",
}

export default function GameLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="game-theme">
      <div className="min-h-screen bg-[#0a0e1a] text-white flex justify-center">
        <div className="w-full max-w-sm">
          {children}
        </div>
      </div>
    </ThemeProvider>
  )
}
