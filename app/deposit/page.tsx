"use client"

import { useEffect, useState, useCallback } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Copy, Check, RefreshCw, ArrowDownToLine, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("app_token")
}

interface Deposit {
  signature:    string
  token_amount: number
  r_amount:     number
  confirmed_at: string
  tx_url:       string | null
}

export default function DepositPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [walletError,   setWalletError]   = useState<string | null>(null)
  const [deposits,      setDeposits]      = useState<Deposit[]>([])
  const [loading,       setLoading]       = useState(true)
  const [copied,        setCopied]        = useState(false)
  const [refreshing,    setRefreshing]    = useState(false)

  const fetchWallet = useCallback(async () => {
    const token = getToken()
    console.log("[v0] fetchWallet: token exists?", !!token)
    if (!token) {
      setWalletError("로그인이 필요합니다.")
      return
    }
    try {
      const res = await fetch("/api/deposit/wallet", {
        headers: { Authorization: `Bearer ${token}` },
      })
      console.log("[v0] wallet API status:", res.status)
      const data = await res.json().catch(() => ({}))
      console.log("[v0] wallet API data:", data)
      if (res.ok) {
        setWalletAddress(data.walletAddress ?? null)
        if (!data.walletAddress) setWalletError("주소가 반환되지 않았습니다.")
      } else {
        setWalletError(data.error ?? `오류 (${res.status})`)
      }
    } catch (e) {
      console.error("[v0] wallet fetch error:", e)
      setWalletError("네트워크 오류")
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
          토큰 입금
        </h1>
        <p className="text-sm text-muted-foreground">
          아래 주소로 {tokenSymbol} 토큰을 전송하면 자동으로 잔고에 반영됩니다.
        </p>
      </div>

      {/* 지갑 주소 카드 */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">내 입금 주소</span>
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
            {walletAddress ?? walletError ?? "주소를 불러오는 중..."}
          </span>
          <button
            onClick={handleCopy}
            className="shrink-0 p-1.5 rounded-lg hover:bg-secondary transition-colors"
            aria-label="주소 복사"
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
            이 주소는 나만의 고유 입금 주소입니다. 타인과 공유하지 마세요.
          </p>
          <p className="flex items-start gap-1.5">
            <span className="text-primary mt-0.5">•</span>
            {tokenSymbol} 토큰만 전송하세요. 다른 토큰은 잔고에 반영되지 않습니다.
          </p>
          <p className="flex items-start gap-1.5">
            <span className="text-primary mt-0.5">•</span>
            입금 후 약 5~30초 내 자동 반영됩니다.
          </p>
          <p className="flex items-start gap-1.5">
            <span className="text-amber-400 mt-0.5">•</span>
            1 {tokenSymbol} = 1 R (고정 환율)
          </p>
        </div>
      </div>

      {/* 입금 내역 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">입금 내역</h2>
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
            aria-label="새로고침"
          >
            <RefreshCw className={cn("w-4 h-4 text-muted-foreground", refreshing && "animate-spin")} />
          </button>
        </div>

        {deposits.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">아직 입금 내역이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {deposits.map((d) => (
              <div
                key={d.signature}
                className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm font-semibold text-green-400">
                    +{d.r_amount.toLocaleString("ko-KR")} R
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {d.token_amount} {tokenSymbol} &nbsp;·&nbsp;
                    {new Date(d.confirmed_at).toLocaleString("ko-KR", {
                      month: "2-digit", day: "2-digit",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
                {d.tx_url && (
                  <a
                    href={d.tx_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 p-1.5 rounded-lg hover:bg-secondary transition-colors"
                    aria-label="Solscan에서 확인"
                  >
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
