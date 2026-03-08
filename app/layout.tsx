import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono, Orbitron } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })
// Orbitron: /widget 네온 테마 숫자용 — font-mono 클래스로 매핑
const _orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron", weight: ["400", "700", "900"] })

export const metadata: Metadata = {
  title: "비트코인으로 즐기는 실시간 롱,숏,홀짝 게임 ",
  description: "30초 1라운드 1초 리얼타임 실시간 가격 게임",
  generator: "bitbet",
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
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans antialiased ${_orbitron.variable}`}>
        <ThemeProvider defaultTheme="light" storageKey="tasko-theme">
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
