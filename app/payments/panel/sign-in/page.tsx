import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { payAuth } from "@/lib/pay/auth"
import { PanelAuthForm } from "@/components/pay/panel-auth-form"

export default async function PanelSignInPage() {
  const session = await payAuth.api.getSession({ headers: await headers() })
  if (session?.user) redirect("/payments/panel")
  return <PanelAuthForm mode="sign-in" />
}
