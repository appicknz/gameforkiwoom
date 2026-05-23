"use client"

import { useEffect, useState, useCallback } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Copy, Check, RefreshCw, ArrowDownToLine, ExternalLink, X } from "lucide-react"
import { cn } from "@/lib/utils"

function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("app_token")
}

interface Deposit {
  tx_signature:   string
  token_amount:   number
  amount:         number
  created_at:     string
  wallet_address: string
  status:         string
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function DepositDialog({ open, onClose }: Props) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [walletError,   setWalletError]   = useState<string | null>(null)
  const [deposits,      setDeposits]      = useState<Deposit[]>([])
  const [loading,       setLoading]       = useState(false)
  const [copied,        setCopied]        = useState(false)
  const [refreshing,    setRefreshing]    = useState(false)

  const fetchHistory = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const res = await fetch("/api/deposit/history", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setDeposits(data.deposits ?? [])
      }
    } catch {}
  }, [])

  const fetchWallet = useCallback(async () => {
    const token = getToken()
    if (!token) { setWalletError("로그인이 필요합니다."); return }
    setLoading(true)
    try {
      const res = await fetch("/api/deposit/wallet", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { setWalletError("주소를 불러올 수 없습니다."); return }
      const data = await res.json()
      setWalletAddress(data.walletAddress ?? null)
      if (!data.walletAddress) setWalletError("아직 입금 주소가 없습니다.")
    } catch {
      setWalletError("오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    fetchWallet()
    fetchHistory()
  }, [open, fetchWallet, fetchHistory])

  // ESC 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

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

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border shrink-0">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <ArrowDownToLine className="w-4 h-4 text-primary" />
            토큰 입금
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
          <p className="text-xs text-muted-foreground leading-relaxed">
            아래 주소로 토큰을 전송하면 자동으로 포인트 잔고에 반영됩니다. 이 토큰은 이벤트 전용으로 입금만 지원되며 출금은 지원되지 않으니 각별히 유의하여 주십시오. 본 토큰은 유틸리티 이외에 가치가 없으며 보증되지 않습니다.
          </p>

          {/* 지갑 주소 카드 */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">내 입금 주소</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Solana</span>
            </div>

            {loading ? (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {walletAddress && (
                  <div className="flex justify-center py-1">
                    <div className="p-2.5 bg-white rounded-xl">
                      <QRCodeSVG value={walletAddress} size={140} />
                    </div>
                  </div>
                )}

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
              </>
            )}

            <div className="space-y-1 text-[11px] text-muted-foreground">
              <p className="flex items-start gap-1.5"><span className="text-primary mt-0.5">•</span>이 주소는 나만의 고유 입금 주소입니다.</p>
              <p className="flex items-start gap-1.5"><span className="text-primary mt-0.5">•</span>{tokenSymbol} 토큰만 전송하세요.</p>
              <p className="flex items-start gap-1.5"><span className="text-primary mt-0.5">•</span>입금 후 약 5~30초 내 자동 반영됩니다.</p>
              <p className="flex items-start gap-1.5"><span className="text-amber-400 mt-0.5">•</span>1 {tokenSymbol} = 1 R (고정 환율)</p>
            </div>
          </div>

          {/* 입금 내역 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-foreground">입금 내역</h3>
              <button
                onClick={handleRefresh}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                aria-label="새로고침"
              >
                <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", refreshing && "animate-spin")} />
              </button>
            </div>

            {deposits.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-6 text-center">
                <p className="text-xs text-muted-foreground">아직 입금 내역이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {deposits.map((d) => (
                  <div
                    key={d.tx_signature}
                    className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-semibold text-green-400">+{d.amount.toLocaleString("ko-KR")} R</p>
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
        </div>
      </div>
    </div>
  )
}
