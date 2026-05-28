"use client"

import { Suspense, useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"

const MARKET_DOMAIN = "https://market.dissig.com"

function Redirector() {
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const qs = searchParams.toString()
    window.location.replace(`${MARKET_DOMAIN}${pathname}${qs ? `?${qs}` : ""}`)
  }, [pathname, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[oklch(0.12_0.01_155)]">
      <p className="text-sm text-[oklch(0.65_0.02_155)]">구매내역 페이지로 이동 중...</p>
    </div>
  )
}

export default function PurchasesPage() {
  return (
    <Suspense fallback={null}>
      <Redirector />
    </Suspense>
  )
}
