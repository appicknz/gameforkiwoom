"use client"

import { useState, useEffect } from "react"
import { Globe } from "lucide-react"
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
      type="button"
      onClick={cycle}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
      title="언어 변경"
    >
      <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{LOCALE_LABELS[current]}</span>
    </button>
  )
}
