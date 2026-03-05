import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { SogirlDashboard } from "@/components/admin/sogirl-dashboard"

export default async function SogirlPage() {
  const cookieStore = await cookies()
  const adminCookie = cookieStore.get("sogirl_admin")

  if (adminCookie?.value !== "1") {
    redirect("/sogirl/login")
  }

  return <SogirlDashboard adminName="본사 관리자" />
}
