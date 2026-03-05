import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { SogirlDashboard } from "@/components/admin/sogirl-dashboard"

export default async function SogirlPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, username")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "super_admin") redirect("/")

  return <SogirlDashboard adminName={profile.username ?? "관리자"} />
}
