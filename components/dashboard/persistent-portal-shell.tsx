"use client"

import { usePathname } from "next/navigation"
import { PortalShell } from "@/components/dashboard/portal-shell"

const persistentRoutes = ["/baka", "/race", "/trading"]

export function PersistentPortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const usesPortal = persistentRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))

  return usesPortal ? <PortalShell>{children}</PortalShell> : children
}
