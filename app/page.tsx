"use client"

import { Sidebar } from "@/components/dashboard/sidebar"
import { TopBar } from "@/components/dashboard/top-bar"
import { BitcoinChart } from "@/components/dashboard/bitcoin-chart"
import { BettingGame } from "@/components/dashboard/betting-game"
import { ProjectAnalytics } from "@/components/dashboard/project-analytics"
import { ClosingPricesBadges } from "@/components/dashboard/closing-prices-badges"
import { ClosingPrices } from "@/components/dashboard/closing-prices"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const initializeTempAccount = async () => {
      try {
        const supabase = createClient()

        // 현재 세션 확인
        const { data: { session } } = await supabase.auth.getSession()

        if (session) {
          // 이미 로그인된 사용자
          setIsLoading(false)
          return
        }

        // 임시 계정 생성
        const res = await fetch("/api/temp-account/create", {
          method: "POST",
        })

        if (!res.ok) {
          throw new Error("Failed to create temp account")
        }

        const { username, password, email } = await res.json()

        // 자동 로그인
        const signInRes = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInRes.error) {
          throw new Error(signInRes.error.message)
        }

        console.log("[v0] Temp account created and logged in:", username)
      } catch (err) {
        console.error("[v0] Temp account initialization error:", err)
        setError(err instanceof Error ? err.message : "An error occurred")
      } finally {
        setIsLoading(false)
      }
    }

    initializeTempAccount()
  }, [])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-lg font-semibold">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-lg font-semibold text-destructive">Error: {error}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64">
        <div className="mt-4 md:mt-5 space-y-3 md:space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
            <div className="lg:col-span-2 space-y-3 md:space-y-4">
              <BitcoinChart />
              <BettingGame />
              <ProjectAnalytics />
            </div>

            <div className="space-y-3 md:space-y-4">
              <ClosingPricesBadges />
              <ClosingPrices />
            </div>
          </div>
        </div>
      </main>
      </div>
    </div>
  )
}
