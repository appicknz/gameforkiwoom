"use client"

import { useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useTheme } from "@/components/theme-provider"
import { Lock, Eye, EyeOff, Moon, Home, BarChart2, ShoppingBag, Store, Landmark, ChevronRight } from "lucide-react"

function getToken() {
  if (typeof window === "undefined") return null
  return localStorage.getItem("auth_token") ?? sessionStorage.getItem("auth_token")
}

export function SettingsContent() {
  const { theme, setTheme } = useTheme()

  const [newPw, setNewPw]           = useState("")
  const [confirmPw, setConfirmPw]   = useState("")
  const [showNew, setShowNew]       = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwMsg, setPwMsg]           = useState<{ text: string; ok: boolean } | null>(null)
  const [pwLoading, setPwLoading]   = useState(false)

  const handlePwChange = async () => {
    setPwMsg(null)
    if (!newPw)           return setPwMsg({ text: "새 비밀번호를 입력하세요.", ok: false })
    if (newPw.length < 4) return setPwMsg({ text: "비밀번호는 4자 이상이어야 합니다.", ok: false })
    if (newPw !== confirmPw) return setPwMsg({ text: "비밀번호가 일치하지 않습니다.", ok: false })

    setPwLoading(true)
    const token = getToken()
    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ newPassword: newPw }),
    })
    const d = await res.json()
    setPwLoading(false)

    if (res.ok) {
      setPwMsg({ text: "비밀번호가 변경되었습니다.", ok: true })
      setNewPw("")
      setConfirmPw("")
    } else {
      setPwMsg({ text: d.error ?? "오류가 발생했습니다.", ok: false })
    }
  }

  return (
    <div className="space-y-4 max-w-lg">

      {/* 다크모드 */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <Moon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">다크 모드</p>
              <p className="text-xs text-muted-foreground mt-0.5">어두운 테마로 전환합니다</p>
            </div>
          </div>
          <Switch
            checked={theme === "dark"}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          />
        </div>
      </Card>

      {/* 비밀번호 변경 */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">비밀번호 변경</p>
            <p className="text-xs text-muted-foreground mt-0.5">새 비밀번호를 설정합니다</p>
          </div>
        </div>

        <div className="space-y-2.5">
          {/* 새 비밀번호 */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type={showNew ? "text" : "password"}
              placeholder="새 비밀번호"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              className="w-full h-10 pl-9 pr-10 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowNew(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* 비밀번호 확인 */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type={showConfirm ? "text" : "password"}
              placeholder="비밀번호 확인"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handlePwChange()}
              className="w-full h-10 pl-9 pr-10 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>

          {pwMsg && (
            <p className={`text-xs ${pwMsg.ok ? "text-primary" : "text-destructive"}`}>
              {pwMsg.text}
            </p>
          )}

          <Button
            className="w-full h-10 text-sm font-semibold"
            onClick={handlePwChange}
            disabled={pwLoading}
          >
            {pwLoading ? "변경 중..." : "비밀번호 변경"}
          </Button>
        </div>
      </Card>

      {/* 메뉴 */}
      <Card className="p-1 overflow-hidden">
        {[
          { label: "홈",      icon: Home,       href: "/market" },
          { label: "구매내역", icon: ShoppingBag, href: "/purchases" },
          { label: "판매관리", icon: Store,       href: "/seller" },
          { label: "정산관리", icon: Landmark,    href: "/settlement" },
          { label: "시그널",  icon: BarChart2,   href: "/trade" },
        ].map((item, i, arr) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/60 transition-colors ${i < arr.length - 1 ? "border-b border-border/50" : ""}`}
            >
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <span className="text-sm font-medium text-foreground flex-1">{item.label}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
          )
        })}
      </Card>

    </div>
  )
}
