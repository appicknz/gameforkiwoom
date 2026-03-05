import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { BranchDashboard } from "@/components/admin/branch-dashboard"

export default async function BranchPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, username, branch_id")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "branch_admin") redirect("/")

  // 지점 정보 조회
  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, code, status")
    .eq("id", profile.branch_id!)
    .single()

  if (!branch) redirect("/")

  // 승인된 지점만 대시보드 접근 가능
  if (branch.status !== "approved") {
    redirect("/branch/pending")
  }

  return (
    <BranchDashboard
      adminName={profile.username ?? "관리자"}
      branch={branch}
    />
  )
}
