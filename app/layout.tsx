import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono, Orbitron } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { BottomNav } from "@/components/dashboard/bottom-nav"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })
// Orbitron: /widget 네온 테마 숫자용 — font-mono 클래스로 매핑
const _orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron", weight: ["400", "700", "900"] })

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: "Trading Market",
  description: "30-second round Long/Short, Odd/Even, Under/Over trading market",
  generator: "Trading Market",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="bg-[oklch(0.12_0.01_155)]">
      <body className={`font-sans antialiased bg-[oklch(0.12_0.01_155)] ${_orbitron.variable}`}>
        <ThemeProvider defaultTheme="dark" storageKey="tasko-theme">
          {/* 모바일 하단 탭바 높이(60px)만큼 콘텐츠 밀어내기 */}
          <div className="md:pb-0 pb-[60px]">
            {children}
          </div>
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  )
}
