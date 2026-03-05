"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BranchDashboard } from "@/components/admin/branch-dashboard"

export default function BranchPage() {
  const router = useRouter()
  const [data, setData] = useState<{ adminName: string; branch: any } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/branch/me")
      .then(r => r.json())
      .then(json => {
        if (json.error) {
          // 미로그인 또는 권한 없음
          router.push("/login")
        } else if (json.branch?.status === "pending") {
          router.push("/branch/pending")
        } else if (!json.branch) {
          setError("지점 정보를 찾을 수 없습니다.")
        } else {
          setData(json)
        }
      })
      .catch(() => setError("오류가 발생했습니다."))
  }, [router])

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center text-white/60 text-sm">
        {error}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center text-white/40 text-sm">
        불러오는 중...
      </div>
    )
  }

  return <BranchDashboard adminName={data.adminName} branch={data.branch} />
}
