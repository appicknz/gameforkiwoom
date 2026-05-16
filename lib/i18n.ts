"use client"

import { useState, useEffect, useCallback } from "react"
import ko from "@/messages/ko.json"
import en from "@/messages/en.json"
import ja from "@/messages/ja.json"

export type Locale = "ko" | "en" | "ja"
export const LOCALES: Locale[] = ["ko", "ja", "en"]
export const LOCALE_LABELS: Record<Locale, string> = { ko: "KR", en: "EN", ja: "JP" }
export const LOCALE_NEXT: Record<Locale, Locale> = { ko: "ja", ja: "en", en: "ko" }

const MESSAGES = { ko, en, ja } as const
const COOKIE_KEY = "locale"
const DEFAULT_LOCALE: Locale = "ko"

// ── 쿠키 유틸 ───────────────────────────────────────────────────
export function getLocaleCookie(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`))
  const val = match?.[1]
  return (val && LOCALES.includes(val as Locale) ? val : DEFAULT_LOCALE) as Locale
}

export function setLocaleCookie(locale: Locale) {
  document.cookie = `${COOKIE_KEY}=${locale};path=/;max-age=31536000;SameSite=Lax`
  window.dispatchEvent(new Event("locale:change"))
}

// ── 중첩 키 접근 헬퍼: "auth.login" → 번역 문자열 ──────────────
type Messages = typeof ko
type DeepValue<T, K extends string> =
  K extends `${infer A}.${infer B}`
    ? A extends keyof T ? DeepValue<T[A], B> : string
    : K extends keyof T ? T[K] : string

function get(obj: Record<string, unknown>, path: string): string | string[] {
  const keys = path.split(".")
  let cur: unknown = obj
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return path
    cur = (cur as Record<string, unknown>)[k]
  }
  if (typeof cur === "string") return cur
  if (Array.isArray(cur) && cur.every(v => typeof v === "string")) return cur as string[]
  return path
}

// ── useTranslation 훅 ─────────────────────────────────────────
export function useTranslation() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE)

  useEffect(() => {
    setLocale(getLocaleCookie())
    const onLocaleChange = () => setLocale(getLocaleCookie())
    window.addEventListener("locale:change", onLocaleChange)
    return () => window.removeEventListener("locale:change", onLocaleChange)
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string | string[] => {
      const messages = MESSAGES[locale] as Record<string, unknown>
      let val = get(messages, key)
      // 폴백: 현재 언어에 없으면 ko로
      if (val === key) val = get(MESSAGES.ko as Record<string, unknown>, key)
      // 배열이면 그대로 반환
      if (Array.isArray(val)) return val
      const str = val as string
      if (!vars) return str
      return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
    },
    [locale]
  )

  return { t, locale }
}

// ── 서버 컴포넌트용 (쿠키 헤더에서 읽기) ───────────────────────
export function getServerLocale(cookieHeader?: string): Locale {
  if (!cookieHeader) return DEFAULT_LOCALE
  const match = cookieHeader.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`))
  const val = match?.[1]
  return (val && LOCALES.includes(val as Locale) ? val : DEFAULT_LOCALE) as Locale
}
