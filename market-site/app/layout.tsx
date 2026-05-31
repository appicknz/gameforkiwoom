import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

const _geist     = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: "Dissig Market",
  description: "트레이딩 정보 마켓플레이스 — 전자책, 채널 구독, 지표 판매",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning className="bg-[oklch(0.12_0.01_155)]">
      <body className="font-sans antialiased bg-[oklch(0.12_0.01_155)]">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="market-theme">
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
