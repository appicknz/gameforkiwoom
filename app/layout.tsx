import type React from "react"
import type { Metadata } from "next"
import { Noto_Sans_KR, Orbitron } from "next/font/google"
import Script from "next/script"
import { ThemeProvider } from "@/components/theme-provider"
import { PersistentPortalShell } from "@/components/dashboard/persistent-portal-shell"
import "./globals.css"

const _notoSansKr = Noto_Sans_KR({ subsets: ["latin"], variable: "--font-noto-sans-kr" })
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
      <body className={`font-sans antialiased bg-[oklch(0.12_0.01_155)] ${_notoSansKr.variable} ${_orbitron.variable}`}>
        {/* beforeInteractive 외부 스크립트가 v0의 head 주입 스크립트와 순서를 다르게 만들어
            전체 React 트리를 hydration mismatch로 오인시키므로 hydration 이후에 로드한다. */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="afterInteractive"
        />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="tasko-theme">
          <PersistentPortalShell>{children}</PersistentPortalShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
