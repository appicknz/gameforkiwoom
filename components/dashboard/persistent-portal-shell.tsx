"use client"

import { usePathname } from "next/navigation"
import { PortalShell } from "@/components/dashboard/portal-shell"

const persistentRoutes = ["/baka", "/race", "/trading", "/board", "/market"]

export function PersistentPortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const usesPortal = persistentRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))

  if (!usesPortal) return children

  return (
    <PortalShell>
      <div key={pathname} data-route-content={pathname}>
        {children}
      </div>
    </PortalShell>
  )
}
