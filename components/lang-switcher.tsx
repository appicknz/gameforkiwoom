"use client"

import { useState, useEffect, useRef } from "react"
import { Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import { LOCALES, LOCALE_LABELS, getLocaleCookie, setLocaleCookie, type Locale } from "@/lib/i18n"

export default function LangSwitcher() {
  const [current, setCurrent] = useState<Locale>("ko")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCurrent(getLocaleCookie())
    const onChange = () => setCurrent(getLocaleCookie())
    window.addEventListener("locale:change", onChange)
    return () => window.removeEventListener("locale:change", onChange)
  }, [])

  // 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const select = (locale: Locale) => {
    setLocaleCookie(locale)
    setCurrent(locale)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors",
          open
            ? "bg-primary/10 border-primary/30 text-primary"
            : "bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
        )}
        title="언어 변경"
      >
        <Globe className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">{LOCALE_LABELS[current]}</span>
        <span className="sm:hidden">{current.toUpperCase()}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[120px] rounded-xl border border-border bg-background shadow-lg overflow-hidden">
          {LOCALES.map(locale => (
            <button
              key={locale}
              onClick={() => select(locale)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-left",
                locale === current
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <span className="text-[10px] font-mono opacity-60 w-4">{locale.toUpperCase()}</span>
              {LOCALE_LABELS[locale]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
