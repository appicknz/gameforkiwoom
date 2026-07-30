import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { payAuth } from "@/lib/pay/auth"
import { ManagerDashboard } from "@/components/pay/manager-dashboard"

export default async function PanelPage() {
  const session = await payAuth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/payments/panel/sign-in")
  return <ManagerDashboard />
}
