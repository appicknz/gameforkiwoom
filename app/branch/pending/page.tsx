"use client"

import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Clock, LogOut } from "lucide-react"

export default function BranchPendingPage() {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center mx-auto mb-6">
          <Clock size={28} className="text-amber-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">승인 대기 중</h1>
        <p className="text-white/50 text-sm leading-relaxed mb-8">
          지점 가입 신청이 접수되었습니다.<br />
          본사 승인 후 대시보드를 이용하실 수 있습니다.
        </p>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm text-white/70 transition"
        >
          <LogOut size={14} /> 로그아웃
        </button>
      </div>
    </div>
  )
}
