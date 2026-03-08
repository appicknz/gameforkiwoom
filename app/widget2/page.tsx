"use client"

import { useEffect, useState } from "react"
import { NeonBettingGamePari } from "@/components/widget/neon-betting-game-pari"
import { NeonChart } from "@/components/widget/neon-chart"
import { ClosingPricesBadges } from "@/components/dashboard/closing-prices-badges"
import { ClosingPrices } from "@/components/dashboard/closing-prices"
import { TopBar } from "@/components/dashboard/top-bar"

// /widget2 — 파리뮤추얼 전용 페이지
// 디자인: /widget과 완전 동일한 네온 사이버펑크 테마
// 로직: 고정 배당 대신 pari-mutuel 동적 배당 적용
export default function Widget2Page() {
  const [branchId, setBranchId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // URL 쿼리 또는 사용자 프로필에서 branchId 획득
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const qBranchId = params.get("branchId")

    if (qBranchId) {
      // URL 파라미터로 직접 지정: /widget2?branchId=xxx
      setBranchId(qBranchId)
      setLoading(false)
      return
    }

    // 로그인된 경우 프로필의 branch_id 사용
    try {
      const token = localStorage.getItem("app_token")
      if (!token) { setError("branchId가 필요합니다. ?branchId=xxx 파라미터를 추가하세요."); setLoading(false); return }

      fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => {
          const bid = d.profile?.branch_id ?? null
          if (!bid) { setError("파리뮤추얼 지점에 소속된 계정이 아닙니다."); setLoading(false); return }
          setBranchId(bid)
          setLoading(false)
        })
        .catch(() => { setError("프로필 로드 실패"); setLoading(false) })
    } catch {
      setError("초기화 오류"); setLoading(false)
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#080c18" }}>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: "#00ff88", borderTopColor: "transparent" }} />
      </div>
    )
  }

  if (error || !branchId) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#080c18" }}>
        <div className="text-center p-8">
          <p className="text-sm font-medium mb-2" style={{ color: "#ff4444" }}>파리뮤추얼 설정 오류</p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{error ?? "branchId를 확인하세요."}</p>
          <p className="text-[10px] mt-3" style={{ color: "rgba(255,255,255,0.2)" }}>
            사용법: /widget2?branchId={"<지점ID>"}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "#080c18" }}>
      {/* 네온 TopBar */}
      <div style={{ background: "#0d1526", borderBottom: "1px solid rgba(160,100,255,0.15)" }}>
        <TopBar />
      </div>

      <main className="max-w-7xl mx-auto p-3 md:p-5">
        {/* 파리뮤추얼 배지 */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full"
            style={{ background: "rgba(160,100,255,0.15)", color: "#a78bfa", border: "1px solid rgba(160,100,255,0.3)" }}>
            파리뮤추얼 모드
          </span>
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
            실시간 배당이 참가자 풀에 따라 변동됩니다
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* 왼쪽: 차트 + 파리뮤추얼 배팅 */}
          <div className="lg:col-span-2 space-y-3">
            <div className="rounded-2xl overflow-hidden"
              style={{ border: "1px solid rgba(160,100,255,0.12)", boxShadow: "0 0 40px rgba(160,100,255,0.06)" }}>
              <NeonChart />
            </div>
            <div className="rounded-2xl overflow-hidden"
              style={{ border: "1px solid rgba(160,100,255,0.12)", boxShadow: "0 0 40px rgba(160,100,255,0.05)" }}>
              <NeonBettingGamePari branchId={branchId} />
            </div>
          </div>

          {/* 오른쪽: 끝자리 + 마감가 */}
          <div className="space-y-3">
            <div className="rounded-2xl overflow-hidden"
              style={{ background: "#0d1526", border: "1px solid rgba(160,100,255,0.12)", boxShadow: "0 0 30px rgba(160,100,255,0.05)" }}>
              <ClosingPricesBadges />
            </div>
            <div className="rounded-2xl overflow-hidden"
              style={{ background: "#0d1526", border: "1px solid rgba(160,100,255,0.12)", boxShadow: "0 0 30px rgba(160,100,255,0.05)" }}>
              <ClosingPrices />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
