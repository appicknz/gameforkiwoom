"use client"

import { useState, useEffect } from "react"
import { Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import { LOCALE_LABELS, LOCALE_NEXT, getLocaleCookie, setLocaleCookie, type Locale } from "@/lib/i18n"

export default function LangSwitcher() {
  const [current, setCurrent] = useState<Locale>("ko")

  useEffect(() => {
    setCurrent(getLocaleCookie())
    const onChange = () => setCurrent(getLocaleCookie())
    window.addEventListener("locale:change", onChange)
    return () => window.removeEventListener("locale:change", onChange)
  }, [])

  const cycle = () => {
    const next = LOCALE_NEXT[current]
    setLocaleCookie(next)
    setCurrent(next)
  }

  return (
    <button
      onClick={cycle}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors",
        "bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
      )}
      title="언어 변경"
    >
      <Globe className="w-3.5 h-3.5 shrink-0" />
      <span>{LOCALE_LABELS[current]}</span>
    </button>
  )
}
