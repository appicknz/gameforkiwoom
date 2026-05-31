"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"
import { Copy, Check, RefreshCw, ArrowDownToLine, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslation } from "@/lib/i18n"

function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("app_token")
}

interface Deposit {
  tx_signature:   string
  token_amount:   number
  amount:         number   // R 적립량
  created_at:     string
  wallet_address: string
  status:         string
}

export default function DepositPage() {
  const router = useRouter()
  const { t }  = useTranslation()
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [walletError,   setWalletError]   = useState<string | null>(null)
  const [deposits,      setDeposits]      = useState<Deposit[]>([])
  const [loading,       setLoading]       = useState(true)
  const [copied,        setCopied]        = useState(false)
  const [refreshing,    setRefreshing]    = useState(false)

  // 로그아웃 감지 — 데이터 초기화 후 홈으로 이동
  useEffect(() => {
    const onLogout = () => {
      setWalletAddress(null)
      setDeposits([])
      router.push("/")
    }
    window.addEventListener("auth:logout", onLogout)
    return () => window.removeEventListener("auth:logout", onLogout)
  }, [])

  const fetchWallet = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setWalletError(t("auth.loginRequired") as string)
      return
    }
    try {
      const res = await fetch("/api/deposit/wallet", {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setWalletAddress(data.walletAddress ?? null)
        if (!data.walletAddress) setWalletError(t("deposit.addressError") as string)
      } else {
        setWalletError(data.error ?? `오류 (${res.status})`)
      }
    } catch {
      setWalletError(t("deposit.networkError") as string)
    }
  }, [])

  const fetchHistory = useCallback(async () => {
    const token = getToken()
    if (!token) return
    const res = await fetch("/api/deposit/history", {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setDeposits(data.deposits ?? [])
    }
  }, [])

  useEffect(() => {
    Promise.all([fetchWallet(), fetchHistory()]).finally(() => setLoading(false))
  }, [fetchWallet, fetchHistory])

  const handleCopy = () => {
    if (!walletAddress) return
    navigator.clipboard.writeText(walletAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchHistory()
    setRefreshing(false)
  }

  const tokenSymbol = process.env.NEXT_PUBLIC_TOKEN_SYMBOL ?? "TOKEN"

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
      {/* 헤더 */}
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ArrowDownToLine className="w-5 h-5 text-primary" />
          {t("deposit.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {(t("deposit.desc") as string).replace("{token}", tokenSymbol)}
        </p>
      </div>

      {/* 지갑 주소 카드 */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("deposit.myAddress")}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Solana</span>
        </div>

        {/* QR 코드 */}
        {walletAddress && (
          <div className="flex justify-center py-2">
            <div className="p-3 bg-white rounded-xl">
              <QRCodeSVG value={walletAddress} size={160} />
            </div>
          </div>
        )}

        {/* 주소 텍스트 */}
        <div className="flex items-center gap-2 rounded-xl bg-secondary/30 border border-border px-3 py-2.5">
          <span className={cn(
            "flex-1 text-[11px] font-mono break-all leading-relaxed",
            walletError ? "text-destructive" : "text-foreground"
          )}>
            {walletAddress ?? walletError ?? t("deposit.addressLoading")}
          </span>
          <button
            onClick={handleCopy}
            className="shrink-0 p-1.5 rounded-lg hover:bg-secondary transition-colors"
            aria-label={t("deposit.copyAddress") as string}
          >
            {copied
              ? <Check className="w-4 h-4 text-green-400" />
              : <Copy className="w-4 h-4 text-muted-foreground" />
            }
          </button>
        </div>

        {/* 안내 */}
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <p className="flex items-start gap-1.5">
            <span className="text-primary mt-0.5">•</span>
            {t("deposit.notice1")}
          </p>
          <p className="flex items-start gap-1.5">
            <span className="text-primary mt-0.5">•</span>
            {(t("deposit.notice2") as string).replace("{token}", tokenSymbol)}
          </p>
          <p className="flex items-start gap-1.5">
            <span className="text-primary mt-0.5">•</span>
            {t("deposit.notice3")}
          </p>
          <p className="flex items-start gap-1.5">
            <span className="text-amber-400 mt-0.5">•</span>
            {(t("deposit.notice4") as string).replace("{token}", tokenSymbol)}
          </p>
        </div>
      </div>

      {/* 입금 내역 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t("deposit.history")}</h2>
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
            aria-label={t("deposit.refresh") as string}
          >
            <RefreshCw className={cn("w-4 h-4 text-muted-foreground", refreshing && "animate-spin")} />
          </button>
        </div>

        {deposits.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">{t("deposit.noHistory")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {deposits.map((d) => (
              <div
                key={d.tx_signature}
                className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm font-semibold text-green-400">
                    +{d.amount.toLocaleString("ko-KR")} R
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {d.token_amount} {tokenSymbol} &nbsp;·&nbsp;
                    {new Date(d.created_at).toLocaleString("ko-KR", {
                      month: "2-digit", day: "2-digit",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
                <a
                  href={`https://solscan.io/tx/${d.tx_signature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-1.5 rounded-lg hover:bg-secondary transition-colors"
                  aria-label="Solscan에서 확인"
                >
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
