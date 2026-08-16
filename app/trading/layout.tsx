import { PortalShell } from "@/components/dashboard/portal-shell"

export const dynamic = "force-dynamic"

export default function TradingLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <PortalShell>{children}</PortalShell>
}
