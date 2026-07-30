"use client"

import { useState, useEffect, useRef } from "react"
import { submitPayRequest, getManagerByCode } from "@/lib/pay/actions"
import { CheckCircle2, HelpCircle, X } from "lucide-react"
import { cn } from "@/lib/utils"

const AMOUNTS = [10000, 30000, 50000, 100000, 300000, 500000]

const CHAINS = [
  { id: "TRX",  label: "TRX",      color: "#EF4444" },
  { id: "ETH",  label: "ETH",      color: "#627EEA" },
  { id: "BNB",  label: "BNB",      color: "#F3BA2F" },
  { id: "SOL",  label: "SOL",      color: "#9945FF" },
  { id: "MATIC",label: "MATIC",    color: "#8247E5" },
  { id: "XRP",  label: "XRP",      color: "#346AA9" },
]

interface TgUser {
  id: number
  first_name: string
  username?: string
}

interface Props {
  managerCode?:     string
  /** 모달에서 미리 resolve된 managerId를 직접 주입 */
  resolvedManagerId?: string
  /** 이미 알고 있는 텔레그램 계정 정보 (TopupModal에서 주입) */
  knownTgId?:       string
  knownTgUsername?: string
  /** username이 user_xxxxxx 패턴이면 익명 계정 */
  isAnonymous?:     boolean
  /** 모달 안에서 사용할 때 완료 콜백 */
  onDone?: (amount: number) => void
}

export function PayRequestForm({
  managerCode,
  resolvedManagerId,
  knownTgId,
  knownTgUsername,
  isAnonymous,
  onDone,
}: Props) {
  const [tgTooltipOpen, setTgTooltipOpen] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [walletAddress, setWalletAddress] = useState("")
  const [chain,         setChain]         = useState("TRX")
  const [amount,        setAmount]        = useState<number>(0)
  const [customAmount,  setCustomAmount]  = useState("")
  const [tgInput,       setTgInput]       = useState("")  // 익명 유저 텔레그램 ID 입력
  const [tgUser,        setTgUser]        = useState<TgUser | null>(null)
  const [managerId,     setManagerId]     = useState<string | null>(resolvedManagerId ?? null)
  const [loading,       setLoading]       = useState(false)
  const [done,          setDone]          = useState(false)
  const [error,         setError]         = useState("")
  const [finalAmountDone, setFinalAmountDone] = useState(0)

  useEffect(() => {
    // Telegram WebApp에서 유저 정보 가져오기
    if (typeof window !== "undefined") {
      const twa = (window as unknown as {
        Telegram?: { WebApp?: { initDataUnsafe?: { user?: TgUser }; ready?: () => void } }
      }).Telegram?.WebApp
      if (twa) {
        twa.ready?.()
        const user = twa.initDataUnsafe?.user
        if (user) setTgUser(user)
      }
    }
    // 관리자 코드로 managerId 조회 (이미 주입된 경우 스킵)
    if (!resolvedManagerId && managerCode) {
      getManagerByCode(managerCode).then(mgr => {
        if (mgr) setManagerId(mgr.id)
        else setError("유효하지 않은 관리자 코드입니다.")
      })
    }
  }, [managerCode])

  const finalAmount = customAmount ? parseInt(customAmount.replace(/[^0-9]/g, "")) : amount

  // 텔레그램 정보 결정: WebApp > props > 입력값
  const resolvedTgId       = tgUser ? String(tgUser.id) : knownTgId
  const resolvedTgUsername = tgUser?.username ?? knownTgUsername
  const needsTgInput       = isAnonymous && !tgUser && !knownTgId

  const handleSubmit = async () => {
    if (!walletAddress.trim()) { setError("지갑 주소를 입력해주세요."); return }
    if (!finalAmount || finalAmount < 10000) { setError("금액을 선택하거나 입력해주세요. (최소 10,000원)"); return }
    if (needsTgInput && !tgInput.trim()) { setError("텔레그램 아이디를 입력해주세요."); return }

    setLoading(true); setError("")
    try {
      await submitPayRequest({
        siteId:           resolvedTgUsername ?? resolvedTgId ?? tgInput.trim() ?? "unknown",
        amount:           finalAmount,
        managerId:        managerId ?? "",
        walletAddress:    walletAddress.trim(),
        chain,
        telegramId:       resolvedTgId,
        telegramUsername: resolvedTgUsername,
        telegramInput:    needsTgInput ? tgInput.trim() : undefined,
      })
      setFinalAmountDone(finalAmount)
      setDone(true)
      onDone?.(finalAmount)
    } catch {
      setError("신청 중 오류가 발생했습니다. 다시 시도해주세요.")
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-7 h-7 text-green-400" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-1">신청 완료</h3>
        <p className="text-sm text-muted-foreground mb-1">관리자가 확인 후 처리해드립니다.</p>
        <p className="text-sm text-muted-foreground">
          신청 금액: <span className="text-foreground font-semibold">{finalAmountDone.toLocaleString("ko-KR")}원</span>
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 py-2">

      {/* 체인 선택 */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">체인 선택</label>
        <div className="flex gap-2 flex-wrap">
          {CHAINS.map(c => (
            <button
              key={c.id}
              onClick={() => setChain(c.id)}
              className={cn(
                "h-8 px-3 rounded-lg text-xs font-semibold border transition-all",
                chain === c.id
                  ? "border-transparent text-black"
                  : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
              )}
              style={chain === c.id ? { background: c.color } : undefined}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* 지갑 주소 */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          지갑 주소 <span className="text-muted-foreground/60">({chain})</span>
        </label>
        <input
          type="text"
          value={walletAddress}
          onChange={e => setWalletAddress(e.target.value)}
          placeholder={`${chain} 지갑 주소 입력`}
          className="w-full h-11 px-3.5 rounded-xl border border-border bg-secondary/40 text-foreground placeholder:text-muted-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* 금액 선택 */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">충전 금액</label>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {AMOUNTS.map(a => (
            <button
              key={a}
              onClick={() => { setAmount(a); setCustomAmount("") }}
              className={cn(
                "h-10 rounded-xl text-sm font-medium border transition-all",
                amount === a && !customAmount
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {(a / 10000).toLocaleString()}만원
            </button>
          ))}
        </div>
        <input
          type="number"
          value={customAmount}
          onChange={e => { setCustomAmount(e.target.value); setAmount(0) }}
          placeholder="직접 입력 (원)"
          className="w-full h-11 px-3.5 rounded-xl border border-border bg-secondary/40 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {finalAmount > 0 && (
          <p className="mt-1.5 text-xs text-primary font-medium">
            선택된 금액: {finalAmount.toLocaleString("ko-KR")}원
          </p>
        )}
      </div>

      {/* 텔레그램 ID 입력 (익명 유저) */}
      {needsTgInput && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <label className="text-xs font-medium text-muted-foreground">텔레그램 아이디</label>
            <span className="text-muted-foreground/60 text-xs">(완료 알림 수신용)</span>
            {/* 물음표 툴팁 버튼 */}
            <div className="relative ml-auto" ref={tooltipRef}>
              <button
                type="button"
                onClick={() => setTgTooltipOpen(v => !v)}
                className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="텔레그램 ID 확인 방법"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
              {tgTooltipOpen && (
                <div className="absolute right-0 bottom-6 z-50 w-64 rounded-xl border border-border bg-popover shadow-xl p-3.5 text-xs text-muted-foreground leading-relaxed">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-foreground">텔레그램 ID 확인 방법</span>
                    <button onClick={() => setTgTooltipOpen(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>텔레그램 앱을 엽니다.</li>
                    <li>설정(Settings) 메뉴로 이동합니다.</li>
                    <li><span className="text-foreground font-medium">Username</span> 항목에서<br/>본인의 사용자명을 확인합니다.</li>
                    <li>@ 없이 입력하시면 됩니다.<br/>예: <span className="font-mono text-foreground">bvs_official</span></li>
                  </ol>
                  <p className="mt-2 text-[10px] text-muted-foreground/70">
                    Username이 없는 경우 텔레그램 설정에서 먼저 만들어주세요.
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">@</span>
            <input
              type="text"
              value={tgInput}
              onChange={e => setTgInput(e.target.value.replace(/^@/, ""))}
              placeholder="텔레그램 사용자명"
              className="w-full h-11 pl-8 pr-3.5 rounded-xl border border-border bg-secondary/40 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground/70">
            처리 완료 시 해당 텔레그램으로 결과를 전송합니다.
          </p>
        </div>
      )}

      {/* 연동된 텔레그램 표시 */}
      {!needsTgInput && (resolvedTgUsername || resolvedTgId) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/8 border border-blue-500/15">
          <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
          <p className="text-xs text-blue-400">
            {resolvedTgUsername ? `@${resolvedTgUsername}` : resolvedTgId} 으로 완료 알림을 전송합니다.
          </p>
        </div>
      )}

      {error && (
        <div className="px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* 신청 버튼 */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50 transition-all active:scale-[0.98] mt-1"
      >
        {loading ? "신청 중..." : "충전 신청하기"}
      </button>
    </div>
  )
}
