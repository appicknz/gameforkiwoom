"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Users, Wallet, RefreshCw, Plus, Minus, Shield, LogOut, GitBranch, Trash2, UserCheck, Settings, ToggleLeft, ToggleRight, Activity, TrendingDown, TrendingUp, Download, Banknote, CalendarDays, ArrowLeftRight, KeyRound, ChevronDown, ChevronRight, Trophy, ImageIcon, Upload, Percent, Eye, EyeOff, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { RoundMonitor } from "@/components/admin/round-monitor"
import { RoundHistory } from "@/components/admin/round-history"
import MarketItemUploadModal from "@/components/market/market-item-upload-modal"
import MyMarketItemsPanel from "@/components/market/my-market-items-panel"
import MarketMasterPanel from "@/components/market/market-master-panel"

const SUPER_ROLES = ["master"] // master 전용 권한 (지점관리, 라운드모니터 등)
const ADMIN_ROLES = ["master", "super_admin", "branch_admin", "admin", "seller"]

// 역할별 기본 탭
const DEFAULT_TAB: Record<string, "users" | "branches" | "branches_sa" | "monitor" | "history" | "points" | "cash" | "calendar" | "pnl" | "cards" | "accounts"> = {
  master:       "users",
  super_admin:  "branches_sa", // 대총판: 총판 목록 탭
  branch_admin: "branches",    // 총판: 지점관리 탭
  admin:        "cash",        // 지점: 현금/환전 탭
}

function getToken(): string | null {
  try { return localStorage.getItem("app_token") } catch { return null }
}
function clearToken() {
  try { localStorage.removeItem("app_token") } catch {}
}
const PW_CACHE_KEY = "panel_admin_pw_cache"
function getCachedPw(): string | null {
  try { return sessionStorage.getItem(PW_CACHE_KEY) } catch { return null }
}
function setCachedPw(pw: string) {
  try { sessionStorage.setItem(PW_CACHE_KEY, pw) } catch {}
}
function clearCachedPw() {
  try { sessionStorage.removeItem(PW_CACHE_KEY) } catch {}
}

interface User {
  id: string
  username: string
  role: string
  created_at: string
  balance: number
  branch_code: string | null
  game_enabled: boolean
  allow_mock_trade: boolean
  allow_token_deposit: boolean
  telegram_id: string | null
  telegram_username: string | null
  telegram_first_name: string | null
  telegram_linked_at: string | null
  tg_bet_amount: number | null
  menu_group1: boolean
  menu_group2: boolean
  menu_group3: boolean
}

interface Branch {
  id: string
  code: string
  name: string
  status: string
  owner_email: string | null
  created_at: string
  betting_mode: "fixed" | "pari"
  lp_enabled: boolean
  lp_amount: number
  lp_amount_baccarat?: number
  lp_amount_race?: number
  lp_multiplier_baccarat?: number
  lp_multiplier_race?: number
}

// LP 설정 행 컴포넌트
// 시드는 역대 실시간 배팅 데이터로 자동 계산됨.
// 여기서는 "초기 기본 시드(데이터 없을 때 사용)" 와 "감쇠 속도"만 설정.
function LpBranchRow({ branch, onSaved }: { branch: Branch; onSaved: () => void }) {
  const [fallbackSeed, setFallbackSeed] = useState(
    String(branch.lp_amount_baccarat ?? 100_000)
  )
  const [multiplier, setMultiplier] = useState(branch.lp_multiplier_baccarat ?? 1.0)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const handleSave = async () => {
    setSaving(true); setMsg(null)
    const token = getToken(); if (!token) return
    const seed = parseInt(fallbackSeed) || 100_000
    const res = await fetch("/api/admin/branches/betting", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        branchId:             branch.id,
        lpAmountBaccarat:     seed,
        lpAmountRace:         seed,
        lpMultiplierBaccarat: multiplier,
        lpMultiplierRace:     multiplier,
      }),
    })
    if (res.ok) { setMsg({ text: "저장됨", ok: true }); onSaved() }
    else { setMsg({ text: "저장 실패", ok: false }) }
    setSaving(false)
    setTimeout(() => setMsg(null), 2000)
  }

  const DECAY_OPTIONS = [
    { label: "빠름", val: 0.5, desc: "유저 배팅이 시드×1.5 되면 LP 50% 감쇠" },
    { label: "기본", val: 1.0, desc: "유저 배팅이 시드×3 되면 LP 50% 감쇠"   },
    { label: "느림", val: 2.0, desc: "유저 배팅이 시드×6 되면 LP 50% 감쇠"   },
  ]

  return (
    <div className="px-5 py-4 space-y-4">
      <p className="text-sm font-semibold text-foreground">{branch.name}</p>

      {/* 자동 계산 안내 */}
      <div className="rounded-lg bg-muted/60 border border-border p-3 text-xs space-y-1">
        <p className="font-medium text-foreground">LP 시드 자동 계산 활성</p>
        <p className="text-muted-foreground">
          3라운드 이상 데이터가 쌓이면 역대 라운드 평균 배팅액으로 시드를 자동 결정합니다.
          초기에만 아래 기본값을 사용합니다.
        </p>
      </div>

      <div className="flex gap-4 flex-wrap items-end">
        {/* 초기 기본 시드 */}
        <div>
          <p className="text-xs font-medium text-foreground mb-1">초기 기본 시드 (사이드당)</p>
          <p className="text-[11px] text-muted-foreground mb-1.5">데이터 부족 시 사용, 3라운드 후 자동 대체</p>
          <Input
            type="number" step="10000" min="0"
            value={fallbackSeed}
            onChange={e => setFallbackSeed(e.target.value)}
            className="h-8 w-36 text-sm"
          />
        </div>

        {/* 감쇠 속도 */}
        <div>
          <p className="text-xs font-medium text-foreground mb-1">감쇠 속도</p>
          <p className="text-[11px] text-muted-foreground mb-1.5">유저 배팅이 얼마나 쌓이면 LP가 줄어드는지</p>
          <div className="flex gap-1.5">
            {DECAY_OPTIONS.map(({ label, val, desc }) => (
              <button
                key={val}
                onClick={() => setMultiplier(val)}
                title={desc}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  multiplier === val
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </Button>
        {msg && (
          <span className={`text-xs font-medium ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  )
}

export default function PanelPage() {
  const router = useRouter()
  const [myRole, setMyRole] = useState<string>("")
  const [myUserId, setMyUserId] = useState<string>("")
  const [myBranchCode, setMyBranchCode] = useState<string | null>(null)
  const [myBalance, setMyBalance] = useState<number>(0)
  const [myBranchId, setMyBranchId] = useState<string | undefined>(undefined)
  const [profile, setProfile] = useState<{ username: string; role: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [adminPw, setAdminPw] = useState<string>(() => {
    // sessionStorage 캐시 우선, 없�����면 admin 역할은 빈 문자열로 시작 (게이트 스���)
    if (typeof window !== "undefined") return getCachedPw() ?? ""
    return ""
  })
  const [pwInput, setPwInput] = useState("")
  const [pwError, setPwError] = useState("")

  // 충전 웹훅 탭 state
  const [pwWebhookUrl,    setPwWebhookUrl]    = useState("")
  const [pwWebhookSecret, setPwWebhookSecret] = useState("")
  const [pwSiteId,        setPwSiteId]        = useState("")
  const [pwBtnText,       setPwBtnText]       = useState("")
  const [pwBtnUrl,        setPwBtnUrl]        = useState("")
  const [pwSaving,        setPwSaving]        = useState(false)
  const [pwSaveMsg,       setPwSaveMsg]       = useState("")
  const [pwTestPayload,   setPwTestPayload]   = useState("")
  const [pwTestResult,    setPwTestResult]    = useState<{ ok: boolean; status: number; body: string } | null>(null)
  const [pwTestLoading,   setPwTestLoading]   = useState(false)
  const [pwTgMsg,         setPwTgMsg]         = useState("")
  const [pwTgSending,     setPwTgSending]     = useState(false)
  const [pwTgResult,      setPwTgResult]      = useState<{ ok: boolean; msg: string } | null>(null)

  const [activeTab, setActiveTab] = useState<"users" | "branches" | "branches_sa" | "monitor" | "history" | "points" | "cash" | "calendar" | "pnl" | "cards" | "accounts" | "commission" | "write_requests" | "market" | "wallets" | "auto_trade" | "pay_webhook">("users")
  // 자동매매 탭 state
  type AutoSignalPos = {
    id: string; signal_type: string; symbol: string; direction: string
    entry_price: number; size_usd: number; leverage: number
    signal_time: string; date_label: string; is_closed: boolean
    closed_price: number | null
  }
  type SignalRule = { signal_type: string; direction: "long" | "short"; enabled: boolean }
  const [autoPositions,    setAutoPositions]    = useState<AutoSignalPos[]>([])
  const [autoSettings,     setAutoSettings]     = useState<{ size_usd: number; leverage: number; enabled: boolean; stop_loss_pct: number | null } | null>(null)
  const [autoSettingsEdit, setAutoSettingsEdit] = useState<{ size_usd: string; leverage: string; enabled: boolean; stop_loss_pct: string } | null>(null)
  const [signalRules,      setSignalRules]      = useState<SignalRule[]>([])
  const [rulesSaving,      setRulesSaving]      = useState<string | null>(null)  // 저장 중인 signal_type
  const [autoLoading,      setAutoLoading]      = useState(false)
  const [autoSaving,       setAutoSaving]       = useState(false)
  const [autoMsg,          setAutoMsg]          = useState<string | null>(null)
  const [webhookUrl,       setWebhookUrl]       = useState("")
  const [seedCapital,      setSeedCapital]      = useState<string>("640")
  const [seedSaving,       setSeedSaving]       = useState(false)
  const [seedMsg,          setSeedMsg]          = useState<string | null>(null)
  const [rebalSaving,      setRebalSaving]      = useState(false)
  const [rebalMsg,         setRebalMsg]         = useState<string | null>(null)

  // 자동주문 서브탭 state
  const [autoSubTab, setAutoSubTab] = useState<"signal" | "order" | "logs" | "seed">("signal")
  const [initialSeed,     setInitialSeed]     = useState<string>("")
  const [withdrawAmount,  setWithdrawAmount]  = useState<string>("")
  const [withdrawnTotal,  setWithdrawnTotal]  = useState<number>(0)
  const [seedSettingsMsg, setSeedSettingsMsg] = useState<string | null>(null)
  const [withdrawMsg,     setWithdrawMsg]     = useState<string | null>(null)
  const [withdrawSaving,  setWithdrawSaving]  = useState(false)
  const [initialSeedSaving, setInitialSeedSaving] = useState(false)
  type ProfitRow = { id: number; label: string; pct: string }
  const [profitRows, setProfitRows] = useState<ProfitRow[]>([{ id: 1, label: "", pct: "" }])
  const [profitSaving, setProfitSaving] = useState(false)
  const [profitMsg, setProfitMsg] = useState<string | null>(null)
  const [showProfitDist, setShowProfitDist] = useState(false)
  type TradingAccount = {
    id: string; account_name: string; auth_token: string; leverage: number
    base_amount: number; enabled: boolean
    take_profit_enabled: boolean; take_profit_percent: number | null
    stop_loss_enabled: boolean;   stop_loss_percent: number | null
    memo: string
  }
  type TradingSettings = { id: number; webhook_url: string; enabled: boolean }
  const [tradingAccounts,    setTradingAccounts]    = useState<TradingAccount[]>([])
  const [tradingSettings,    setTradingSettings]    = useState<TradingSettings | null>(null)
  const [tradingSettingsEdit, setTradingSettingsEdit] = useState<{ webhook_url: string; enabled: boolean } | null>(null)
  const [tradingLoaded,      setTradingLoaded]      = useState(false)
  const [tradingSetupMsg,    setTradingSetupMsg]    = useState<string | null>(null)
  const [tradingSettingsSaving, setTradingSettingsSaving] = useState(false)
  const [tradingSettingsMsg, setTradingSettingsMsg] = useState<string | null>(null)
  // 계정 추가/수정 폼
  const [accFormOpen,   setAccFormOpen]   = useState(false)
  const [accEditTarget, setAccEditTarget] = useState<TradingAccount | null>(null)
  const [accForm, setAccForm] = useState({
    account_name: "", auth_token: "", leverage: "20", base_amount: "100",
    enabled: true, take_profit_enabled: false, take_profit_percent: "",
    stop_loss_enabled: false, stop_loss_percent: "", memo: "",
  })
  const [accSaving, setAccSaving]   = useState(false)
  const [accMsg,    setAccMsg]      = useState<string | null>(null)
  // 테스트 주문
  const [testAccountId,  setTestAccountId]  = useState("")
  const [testSymbol,     setTestSymbol]     = useState("BTCUSDT")
  const [testDirection,  setTestDirection]  = useState<"LONG" | "SHORT">("LONG")
  const [testAction,     setTestAction]     = useState<"open" | "close">("open")
  const [testLoading,    setTestLoading]    = useState(false)
  const [testResult,     setTestResult]     = useState<Record<string, unknown> | null>(null)
  // 주문 로그
  type OrderLog = {
    id: string; created_at: string; symbol: string; direction: string
    account_name: string | null; tvm_str: string | null; tvm_status: number | null
    tvm_response: string | null; ok: boolean; error_msg: string | null; position_id: string | null
  }
  const [orderLogs,       setOrderLogs]       = useState<OrderLog[]>([])
  const [orderLogsLoaded, setOrderLogsLoaded] = useState(false)
  const [orderLogsLoading, setOrderLogsLoading] = useState(false)

  const loadOrderLogs = async () => {
    setOrderLogsLoading(true)
    const tok = localStorage.getItem("app_token") ?? ""
    const res = await fetch("/api/auto-trading/logs?limit=100", { headers: { Authorization: `Bearer ${tok}` } })
    if (res.ok) { const d = await res.json(); setOrderLogs(d.logs ?? []) }
    setOrderLogsLoaded(true)
    setOrderLogsLoading(false)
  }

  const loadTradingData = async () => {
    const tok = localStorage.getItem("app_token") ?? ""
    const [resAcc, resCfg] = await Promise.all([
      fetch("/api/auto-trading/accounts",  { headers: { Authorization: `Bearer ${tok}` } }),
      fetch("/api/auto-trading/settings",  { headers: { Authorization: `Bearer ${tok}` } }),
    ])
    if (resAcc.ok) { const d = await resAcc.json(); setTradingAccounts(d.accounts ?? []) }
    if (resCfg.ok) {
      const d = await resCfg.json()
      setTradingSettings(d)
      setTradingSettingsEdit({ webhook_url: d.webhook_url ?? "", enabled: !!d.enabled })
    }
    setTradingLoaded(true)
  }

  // 지갑 복구 (master 전용)
  const [walletRepairLoading, setWalletRepairLoading] = useState(false)
  const [walletRepairResult, setWalletRepairResult]   = useState<{ repairedCount: number; skippedCount: number; repaired: { id: string; username: string; oldAddress: string | null; newAddress: string }[] } | null>(null)
  const [walletRepairError, setWalletRepairError]     = useState<string | null>(null)
  // 미반영 입금 수동 재처리 (master 전���)
  const [replaySig, setReplaySig]         = useState("")
  const [replayLoading, setReplayLoading] = useState(false)
  const [replayResult, setReplayResult]   = useState<{ replayed: { owner: string; delta: number; creditAmount: number }[] } | null>(null)
  const [replayError, setReplayError]     = useState<string | null>(null)
  // 수수료 설정 (마스터 전용)
  const [commRates, setCommRates]         = useState<{ role: string; rate: number }[]>([])
  const [commEditing, setCommEditing]     = useState<Record<string, string>>({}) // role → 입력 중인 % 문자열
  const [commSaving, setCommSaving]       = useState(false)
  const [commMsg, setCommMsg]             = useState<{ text: string; ok: boolean } | null>(null)
  // 내 수수료 잔고
  const [myCommBalance, setMyCommBalance] = useState<number>(0)

  // 계정 생성 (master 전용)
  const [acUsername, setAcUsername]   = useState("")
  const [acPassword, setAcPassword]   = useState("")
  const [acRole, setAcRole]           = useState<"super_admin" | "branch_admin" | "admin">("super_admin")
  const [acMemo, setAcMemo]           = useState("")
  const [acSubmitting, setAcSubmitting] = useState(false)
  const [acMsg, setAcMsg]             = useState<{ text: string; ok: boolean } | null>(null)

  const handleCreateAccount = async () => {
    if (!acUsername.trim() || !acPassword.trim()) { setAcMsg({ text: "아이디와 비밀번호를 모두 입력하세요.", ok: false }); return }
    const token = getToken(); if (!token) return
    setAcSubmitting(true); setAcMsg(null)
    try {
      const res = await fetch("/api/admin/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: acUsername.trim(), password: acPassword, role: acRole, memo: acMemo }),
      })
      const d = await res.json()
      if (res.ok) {
        setAcMsg({ text: `계정이 생���되었습니다. (${acUsername})`, ok: true })
        setAcUsername(""); setAcPassword(""); setAcMemo("")
        loadUsers(adminPw)
      } else {
        setAcMsg({ text: d.error ?? "계정 생성에 실패했습니다.", ok: false })
      }
    } catch { setAcMsg({ text: "오류가 발생했습니다.", ok: false }) }
    finally { setAcSubmitting(false) }
  }

  // 총판 전용: 지점 생성 모달 state
  const [baCreateOpen, setBaCreateOpen]       = useState(false)
  const [baNewBranchName, setBaNewBranchName] = useState("")
  const [baNewBranchCode, setBaNewBranchCode] = useState("")
  const [baNewBranchPw, setBaNewBranchPw]     = useState("")
  const [baNewBranchShowPw, setBaNewBranchShowPw] = useState(false)
  const [baCreateLoading, setBaCreateLoading] = useState(false)
  const [baCreateMsg, setBaCreateMsg]         = useState<{ text: string; ok: boolean } | null>(null)
  const [baCreatedInfo, setBaCreatedInfo]     = useState<{ code: string; password: string } | null>(null)

  // 대총판 전용: 총판 계정 생성 모달 state
  const [saOpen, setSaOpen]           = useState(false)
  const [saUsername, setSaUsername]   = useState("")
  const [saPassword, setSaPassword]   = useState("")
  const [saSubmitting, setSaSubmitting] = useState(false)
  const [saMsg, setSaMsg]             = useState<{ text: string; ok: boolean } | null>(null)
  // 대총판 전용: 총판 목록 state
  const [saBranchAdmins, setSaBranchAdmins] = useState<User[]>([])
  const [saListLoading, setSaListLoading]   = useState(false)
  const [saSelectedBa, setSaSelectedBa]     = useState<User | null>(null)
  const [saSearch, setSaSearch]             = useState("")     // 총판 검색
  const [saPage, setSaPage]                 = useState(1)      // 총판 목록 페이지
  const [saReqPage, setSaReqPage]           = useState(1)      // 충전 요청 페이지

  const handleCreateBranchAdmin = async () => {
    if (!saUsername.trim() || !saPassword.trim()) { setSaMsg({ text: "아이디와 비밀번호를 모두 입력하세요.", ok: false }); return }
    const token = getToken(); if (!token) return
    setSaSubmitting(true); setSaMsg(null)
    try {
      const res = await fetch("/api/admin/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: saUsername.trim(), password: saPassword, role: "branch_admin" }),
      })
      const d = await res.json()
      if (res.ok) {
        setSaMsg({ text: `총판 계정 "${saUsername}" 이 생성되었습니다.`, ok: true })
        setSaUsername(""); setSaPassword("")
        loadUsers(adminPw)
        loadBranchAdmins()
      } else {
        setSaMsg({ text: d.error ?? "계정 생성에 실패했습니다.", ok: false })
      }
    } catch { setSaMsg({ text: "오류가 발생했습니다.", ok: false }) }
    finally { setSaSubmitting(false) }
  }

  const loadBranchAdmins = useCallback(async () => {
    const token = getToken(); if (!token) return
    setSaListLoading(true)
    const res = await fetch("/api/admin/users?role=branch_admin", { headers: { Authorization: `Bearer ${token}` } })
    const d = await res.json()
    if (res.ok) setSaBranchAdmins(d.users ?? [])
    setSaListLoading(false)
  }, [])

  const handleDeleteAccount = async (targetId: string, targetUsername: string) => {
    if (!confirm(`"${targetUsername}" 계정을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/create-account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetId }),
    })
    const d = await res.json()
    if (res.ok) {
      setAcMsg({ text: `"${targetUsername}" 계정이 삭제되었습니다.`, ok: true })
      loadUsers(adminPw)
    } else {
      alert(d.error ?? "삭제 중 오류가 발생했습니다.")
    }
  }

  // 카드 이미지 관리 state (master 전용)
  interface CardImage { url: string; pathname: string; uploadedAt: string }
  const [cardImages, setCardImages] = useState<CardImage[]>([])
  const [cardLoading, setCardLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const cardFileInputRef = useRef<HTMLInputElement>(null)

  const fetchCardImages = useCallback(async () => {
    const token = getToken(); if (!token) return
    setCardLoading(true)
    try {
      const res = await fetch(`/api/admin/card-images`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) { const d = await res.json(); setCardImages(d.images ?? []) }
    } finally { setCardLoading(false) }
  }, [])

  const handleCardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files || files.length === 0) return
    const token = getToken(); if (!token) return
    setUploading(true); setUploadError("")
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData(); fd.append("file", file)
        const res = await fetch("/api/admin/card-images", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd })
        if (!res.ok) throw new Error("업로드 실패")
      }
      await fetchCardImages()
    } catch { setUploadError("업로드 중 오류가 발생했습니다.") }
    finally { setUploading(false); if (cardFileInputRef.current) cardFileInputRef.current.value = "" }
  }

  const handleCardDelete = async (url: string) => {
    if (!confirm("이 이미지를 삭제하시겠습니까?")) return
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/card-images", { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ url }) })
    if (res.ok) await fetchCardImages()
    else alert("삭제 중 오류가 발생했습니다.")
  }

  // 손익 state
  interface PnlData { rate_profit: number; fee_total: number; exchange_payout: number; net_pnl: number; balance: number; cash_balance: number }
  const [pnlData, setPnlData] = useState<PnlData | null>(null)
  const [pnlLoading, setPnlLoading] = useState(false)
  const [pnlPeriod, setPnlPeriod] = useState<"all" | "month" | "last_month">("all")

  const loadPnl = useCallback(async (period: "all" | "month" | "last_month" = "all") => {
    const token = getToken(); if (!token) return
    setPnlLoading(true)
    const params = period !== "all" ? `?period=${period}` : ""
    const res = await fetch(`/api/admin/distributor-pnl${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setPnlData(d) }
    setPnlLoading(false)
  }, [])


  // LP 히스토리
  interface LpTx { id: number; branch_id: string; round_time: number; pool_type: string; side: string; lp_amount: number; user_amount: number; settled_odds: number | null; created_at: string }
  const [lpHistory, setLpHistory] = useState<LpTx[]>([])
  const [lpTotal, setLpTotal] = useState(0)
  const [lpLoading, setLpLoading] = useState(false)

  const loadLpHistory = useCallback(async (branchId?: string) => {
    const token = getToken(); if (!token) return
    setLpLoading(true)
    const url = branchId ? `/api/admin/lp-history?branchId=${branchId}` : "/api/admin/lp-history"
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setLpHistory(d.history ?? []); setLpTotal(d.totalLpUsed ?? 0) }
    setLpLoading(false)
  }, [])

  // 하우스 손익 통계
  interface HouseStat {
    id: number; branch_id: string; game_type: string
    total_bet: number; total_payout: number; total_lp_used: number
    total_fee: number; total_collected: number; updated_at: string
    branches: { name: string; code: string } | null
  }
  interface FeeCollection { id: number; branch_id: string; game_type: string; collected_amount: number; note: string; created_at: string; branches: { name: string } | null }
  interface MasterSummary { totalBet: number; totalPayout: number; totalLpUsed: number; totalFee: number; totalCollected: number; pendingFee: number; houseProfit: number }

  const [houseStats, setHouseStats] = useState<HouseStat[]>([])
  const [feeCollections, setFeeCollections] = useState<FeeCollection[]>([])
  const [masterSummary, setMasterSummary] = useState<MasterSummary | null>(null)
  const [houseLoading, setHouseLoading] = useState(false)
  const [collectingId, setCollectingId] = useState<string | null>(null)

  const loadHouseStats = useCallback(async () => {
    const token = getToken(); if (!token) return
    setHouseLoading(true)
    const res = await fetch("/api/admin/house-stats", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      setHouseStats(d.stats ?? [])
      setFeeCollections(d.collections ?? [])
      setMasterSummary(d.masterSummary ?? null)
    }
    setHouseLoading(false)
  }, [])

  const handleCollect = async (branchId: string, gameType: string) => {
    const key = `${branchId}-${gameType}`
    setCollectingId(key)
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/house-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ branch_id: branchId, game_type: gameType, note: "수금 처리" }),
    })
    if (res.ok) await loadHouseStats()
    setCollectingId(null)
  }

  // 회원 목록
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [chargeUserId, setChargeUserId] = useState<string | null>(null)
  const [mockChecks,    setMockChecks]    = useState<Record<string, boolean>>({})
  const [mockSaving,    setMockSaving]    = useState<string | null>(null)
  const [tgBetAmounts,  setTgBetAmounts]  = useState<Record<string, string>>({})  // userId → 입력값
  const [tgBetSaving,   setTgBetSaving]   = useState<string | null>(null)
  const [tgWebhookInfo,    setTgWebhookInfo]    = useState<string | null>(null)
  const [tgWebhookLoading, setTgWebhookLoading] = useState(false)

  // 날짜별 수익/손실/청산 통계
  type DailyStat = { date: string; profit: number; loss: number; liq: number; total: number; liqRate: number }
  const [dailyStats,       setDailyStats]       = useState<DailyStat[]>([])
  const [dailyStatsLoaded, setDailyStatsLoaded] = useState(false)
  const [dailyStatsLoading, setDailyStatsLoading] = useState(false)

  const loadDailyStats = async () => {
    setDailyStatsLoading(true)
    const token = getToken(); if (!token) return
    const res  = await fetch("/api/auto-signal/daily-stats", { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setDailyStats(data.stats ?? [])
    setDailyStatsLoaded(true)
    setDailyStatsLoading(false)
  }

  // 텔레그램 주문 탭 state
  type TgSendLog = {
    id: string; created_at: string; round_number: number; type: "betting_button" | "result"
    ok: boolean; tg_message_id: number | null; error_msg: string | null
    payload: Record<string, unknown> | null
  }
  const [tgSendLogs,       setTgSendLogs]       = useState<TgSendLog[]>([])
  const [tgSendLogsLoaded, setTgSendLogsLoaded] = useState(false)
  const [tgSendLogsLoading, setTgSendLogsLoading] = useState(false)
  const [tgTableExists,    setTgTableExists]    = useState<boolean | null>(null)
  const [tgTestResult,     setTgTestResult]     = useState<string | null>(null)
  const [tgTestLoading,    setTgTestLoading]    = useState(false)
  const [tgSetupSql,       setTgSetupSql]       = useState<string | null>(null)

  const loadTgSendLogs = async () => {
    const token = getToken(); if (!token) return
    setTgSendLogsLoading(true)
    const res  = await fetch("/api/telegram/send-logs", { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setTgSendLogs(data.logs ?? [])
    setTgTableExists(data.tableExists ?? false)
    setTgSendLogsLoaded(true)
    setTgSendLogsLoading(false)
  }

  const runTgTest = async (type: "betting_button" | "result") => {
    const token = getToken(); if (!token) return
    setTgTestLoading(true); setTgTestResult(null)
    try {
      const res  = await fetch("/api/telegram/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type }),
      })
      const text = await res.text()
      const data = text ? JSON.parse(text) : {}
      if (!res.ok) {
        setTgTestResult(`오류 HTTP ${res.status} — ${data.error ?? text}`)
      } else if (data.ok) {
        setTgTestResult(`전송 성공 — round=${data.roundNumber} / BOT=${data.env?.botToken ? "설정됨" : "미설정"} / CHANNEL=${data.env?.channelId}`)
      } else {
        setTgTestResult(`전송 실패 — BOT=${data.env?.botToken ? "설정됨" : "미설정"} / CHANNEL=${data.env?.channelId}`)
      }
      setTimeout(loadTgSendLogs, 800)
    } catch (e) {
      setTgTestResult(`네트워크 오류 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTgTestLoading(false)
    }
  }

  const fetchTgSetupSql = async () => {
    const token = getToken(); if (!token) return
    const res  = await fetch("/api/telegram/send-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "setup" }),
    })
    const data = await res.json()
    setTgSetupSql(data.sql ?? null)
  }
  const [depositChecks, setDepositChecks] = useState<Record<string, boolean>>({})
  const [depositSaving, setDepositSaving] = useState<string | null>(null)
  const [groupChecks,   setGroupChecks]   = useState<Record<string, { g1: boolean; g2: boolean; g3: boolean }>>({})
  const [groupSaving,   setGroupSaving]   = useState<string | null>(null)
  const [pwResetSaving, setPwResetSaving] = useState<string | null>(null)
  const [chargeAmount, setChargeAmount] = useState("")
  const [chargeLoading, setChargeLoading] = useState(false)
  const [chargeMsg, setChargeMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // 지점 관리
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [newBranchName, setNewBranchName] = useState("")
  const [newBranchCode, setNewBranchCode] = useState("")
  const [newBranchOwner, setNewBranchOwner] = useState("")
  const [ownerSearch, setOwnerSearch] = useState("")
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false)
  const [branchMsg, setBranchMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [branchLoading, setBranchLoading] = useState(false)
  const [bettingSettingId, setBettingSettingId] = useState<string | null>(null)
  const [lpInput, setLpInput] = useState("")
  const [bettingMsg, setBettingMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // 권한 확인
  useEffect(() => {
    const token = getToken()
    if (!token) { router.replace("/"); return }
    fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) { router.replace("/"); return }
        const data = await res.json()
        const role = data.profile?.role ?? ""
        if (!ADMIN_ROLES.includes(role)) { router.replace("/"); return }
        setMyUserId(data.profile?.id ?? "")
        setMyRole(role)
        setMyBranchCode(data.profile?.branch_code ?? null)
        setProfile({ username: data.profile?.username ?? "", role })
        // 역할에 맞는 기�� 탭���로 자동 이동
        if (DEFAULT_TAB[role]) setActiveTab(DEFAULT_TAB[role])
        setLoading(false)
        // 역할별 초기 데이터 로드
        const tok = getToken()
        if (!tok) return
        // 내 잔고 즉시 ��드 (모든 역할)
        fetch("/api/admin/my-balance", { headers: { Authorization: `Bearer ${tok}` } })
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d && typeof d.balance === "number") setMyBalance(d.balance) })
          .catch(() => {})
        // 수수료 잔고 즉시 로드 (모든 역할)
        fetch("/api/admin/commission-balances", { headers: { Authorization: `Bearer ${tok}` } })
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d) setMyCommBalance(d.balance ?? 0) })
          .catch(() => {})
        if (role === "super_admin") {
          fetch("/api/admin/point-purchase", { headers: { Authorization: `Bearer ${tok}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.requests) setPpRequests(d.requests) })
            .catch(() => {})
          fetch("/api/admin/users?role=branch_admin", { headers: { Authorization: `Bearer ${tok}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.users) setSaBranchAdmins(d.users) })
            .catch(() => {})
        } else if (role === "branch_admin") {
          // 유저 계정 생성 요청 초기 로드
          fetch("/api/admin/user-account-requests", { headers: { Authorization: `Bearer ${tok}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.requests) setAcctRequests(d.requests) })
            .catch(() => {})
          fetch("/api/admin/point-purchase", { headers: { Authorization: `Bearer ${tok}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.requests) setBaChargeRequests(d.requests) })
            .catch(() => {})
          // 지점이 올린 충전 요청 초기 로드
          fetch("/api/admin/point-purchase?from=branches", { headers: { Authorization: `Bearer ${tok}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.requests) setBranchChargeReqs(d.requests) })
            .catch(() => {})
          fetch("/api/admin/exchange-request", { headers: { Authorization: `Bearer ${tok}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.requests) setBaExRequests(d.requests) })
            .catch(() => {})
          fetch("/api/admin/point-charge", { headers: { Authorization: `Bearer ${tok}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (d?.requests) {
                const total = d.requests
                  .filter((r: any) => ["approved","activated"].includes(r.status))
                  .reduce((s: number, r: any) => s + (r.point_amount ?? 0), 0)
                setBaTotalCharged(total)
              }
            })
            .catch(() => {})
        } else if (role === "admin") {
          // 지점: 회원 목록 + 환전 요청 초기 로드
          fetch("/api/admin/branch-users", { headers: { Authorization: `Bearer ${tok}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (d) {
                setAdminMembers(d.members ?? [])
                setBranchBets(d.bets ?? [])
              }
            })
            .catch(() => {})
          fetch("/api/admin/exchange-request", { headers: { Authorization: `Bearer ${tok}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (d?.requests) {
                const reqs = d.requests
                setBranchExReqs(reqs)
                setBranchPendingEx(reqs.filter((r: any) => r.status === "pending").length)
                setBranchTotalEx(reqs.filter((r: any) => r.status === "approved").reduce((s: number, r: any) => s + (r.point_amount ?? 0), 0))
              }
            })
            .catch(() => {})
          fetch("/api/admin/point-purchase", { headers: { Authorization: `Bearer ${tok}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.requests) setPrRequests(d.requests) })
            .catch(() => {})
        }
      })
      .catch(() => router.replace("/"))
  }, [])

  const [pwChecking, setPwChecking] = useState(false)

  const handlePwSubmit = async () => {
    if (!pwInput.trim()) return
    setPwError("")
    setPwChecking(true)

    const token = getToken()
    const res = await fetch("/api/admin/verify-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        username: profile?.username,
        password: pwInput,
      }),
    })

    setPwChecking(false)

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setPwError(d.error ?? "비밀번호가 올바르지 않습니다.")
      return
    }

    setCachedPw(pwInput)
    setAdminPw(pwInput)
    setPwInput("")
  }

  // 회원 목록 로드 (branch_admin은 자기 지점만)
  const loadUsers = useCallback(async (pw: string) => {
    setUsersLoading(true)
    const token = getToken()
    if (!token) { setUsersLoading(false); return }
    const res = await fetch(`/api/admin/users`, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    })
    const data = await res.json()
    if (!res.ok) {
      setPwError("인증에 실패했습니다.")
      setAdminPw("")
    } else {
      const loaded: User[] = data.users ?? []
      setUsers(loaded)
      setMockChecks(Object.fromEntries(loaded.map(u => [u.id, u.allow_mock_trade ?? false])))
      setDepositChecks(Object.fromEntries(loaded.map(u => [u.id, u.allow_token_deposit ?? false])))
      setGroupChecks(Object.fromEntries(loaded.map(u => [u.id, {
        g1: u.menu_group1 ?? false,
        g2: u.menu_group2 ?? false,
        g3: u.menu_group3 ?? false,
      }])))
    }
    setUsersLoading(false)
  }, [myUserId])

  // �����판/총판: 5초마다 충전 요청 목록 + 내 잔고 자동 갱신
  useEffect(() => {
    if (myRole !== "super_admin" && myRole !== "branch_admin") return
    const poll = () => {
      const tok = getToken(); if (!tok) return
      // 충전 요청 목록
      fetch("/api/admin/point-purchase", { headers: { Authorization: `Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d?.requests) return
          if (myRole === "super_admin") setPpRequests(d.requests)
          else setBaChargeRequests(d.requests)
        })
        .catch(() => {})
      // 내 잔고 갱신
      fetch("/api/admin/my-balance", { headers: { Authorization: `Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && typeof d.balance === "number") setMyBalance(d.balance) })
        .catch(() => {})
      // 총판: 환전 요청 목록 갱신
      if (myRole === "branch_admin") {
        fetch("/api/admin/exchange-request", { headers: { Authorization: `Bearer ${tok}` } })
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.requests) setBaExRequests(d.requests) })
          .catch(() => {})
      }
      // 대총판: 총판 목록 잔고 동기화
      if (myRole === "super_admin") {
        fetch("/api/admin/users?role=branch_admin", { headers: { Authorization: `Bearer ${tok}` } })
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (!d?.users) return
            setSaBranchAdmins(d.users)
            setSaSelectedBa((prev: User | null) => prev ? (d.users.find((u: User) => u.id === prev.id) ?? prev) : null)
          })
          .catch(() => {})
      }
    }
    // 즉시 1회 실행 후 5초 폴링
    poll()
    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [myRole])

  // 지점 목록 로드
  const loadBranches = useCallback(async (pw: string) => {
    setBranchesLoading(true)
    const token = getToken()
    if (!token) { setBranchesLoading(false); return }
    try {
      const res = await fetch(`/api/admin/branches`, {
        headers: { "Authorization": `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setBranches(data.branches ?? [])
      }
    } catch (e) {
      // 응답 파싱 실��� 무시
    }
    setBranchesLoading(false)
  }, [myUserId])



  useEffect(() => {
    if (adminPw && myUserId) {
      loadUsers(adminPw)
      // superadmin: 전체 지점 로��
      // branch_admin: 자기 지점 id 파악을 위해 branches 로드 후 myBranchId 설정
      loadBranches(adminPw).then(() => {
        // branches 상태는 비동기로 업데이트되므로 직접 fetch
        if (myRole === "branch_admin" && myBranchCode) {
          const token = getToken()
          if (!token) return
          fetch("/api/admin/branches", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => {
              const found = (d.branches ?? []).find((b: { code: string; id: string }) => b.code === myBranchCode)
              if (found) setMyBranchId(found.id)
            })
            .catch(() => {})
        }
      })
    }
  }, [adminPw, myRole, myUserId, myBranchCode])

  // 잔고 충전/차감
  const handleCharge = async (userId: string, delta: number) => {
    setChargeLoading(true)
    setChargeMsg(null)
    const token = getToken()
    if (!token) {
      setChargeMsg({ text: "세션이 만료되었습니다.", ok: false })
      setChargeLoading(false)
      return
    }
    const amount = parseInt(chargeAmount)
    if (!chargeAmount || isNaN(amount) || amount <= 0) {
      setChargeMsg({ text: "올바른 금액을 ���력하세요.", ok: false })
      setChargeLoading(false)
      return
    }
    const res = await fetch("/api/admin/charge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ userId, amount: delta * amount }),
    })
    const data = await res.json()
    if (!res.ok) {
      setChargeMsg({ text: data.error ?? "오류가 발생했습니다.", ok: false })
    } else {
      setChargeMsg({ text: `잔고가 ${delta > 0 ? "충전" : "차감"}됐습니다.`, ok: true })
      setChargeAmount("")
      setChargeUserId(null)
      loadUsers(adminPw)
    }
    setChargeLoading(false)
  }

  // 지점 생성
  const handleCreateBranch = async () => {
    setBranchLoading(true)
    setBranchMsg(null)
    const token = getToken()
    if (!token) { setBranchLoading(false); return }
    const res = await fetch("/api/admin/branches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: newBranchName,
        code: newBranchCode.trim().toUpperCase(),
        ownerUsername: newBranchOwner.trim(),
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setBranchMsg({ text: data.error ?? "오류가 발생했습니다.", ok: false })
    } else {
      setBranchMsg({ text: `지점 '${newBranchName}'이 생성됐습니다.`, ok: true })
      setNewBranchName("")
      setNewBranchCode("")
      setNewBranchOwner("")
      setOwnerSearch("")
      loadBranches(adminPw)
      loadUsers(adminPw)
    }
    setBranchLoading(false)

  }

  // 총판 전용: 지점 생성
  const handleBaCreateBranch = async () => {
    if (!baNewBranchName.trim() || !baNewBranchCode.trim() || !baNewBranchPw.trim()) {
      setBaCreateMsg({ text: "지점명, 지점코드, 비밀번호를 모두 입력하세요.", ok: false }); return
    }
    setBaCreateLoading(true); setBaCreateMsg(null)
    const token = getToken(); if (!token) { setBaCreateLoading(false); return }
    const res = await fetch("/api/admin/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: baNewBranchName.trim(), code: baNewBranchCode.trim().toUpperCase(), password: baNewBranchPw.trim() }),
    })
    const data = await res.json()
    if (!res.ok) {
      setBaCreateMsg({ text: data.error ?? "오류가 발생했습니다.", ok: false })
    } else {
      setBaCreatedInfo({ code: baNewBranchCode.trim().toUpperCase(), password: baNewBranchPw.trim() })
      setBaCreateMsg({ text: `지점 '${baNewBranchName}'이 생성됐습니다.`, ok: true })
      setBaNewBranchName(""); setBaNewBranchCode(""); setBaNewBranchPw("")
      loadBranches(adminPw)
    }
    setBaCreateLoading(false)
  }

  // 지점 삭제
  const handleDeleteBranch = async (id: string) => {
    if (!confirm("지점을 삭제하시겠습니까? 소속 회원의 지점코드가 해제됩니다.")) return
    const token = getToken()
    if (!token) return
    await fetch(`/api/admin/branches?id=${id}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    })
    loadBranches(adminPw)
  }

  const formatBalance = (n: number) => `₩${n.toLocaleString()}`
  const formatDate = (s: string) => new Date(s).toLocaleDateString("ko-KR")

  const roleLabel: Record<string, { label: string; color: string }> = {
    master:       { label: "마스터",      color: "bg-purple-100 text-purple-700" },
    super_admin:  { label: "대총판",      color: "bg-red-100 text-red-700" },
    branch_admin: { label: "총판",        color: "bg-blue-100 text-blue-700" },
    admin:        { label: "지점관리자",  color: "bg-orange-100 text-orange-700" },
    seller:       { label: "셀러",        color: "bg-green-100 text-green-700" },
    user:         { label: "일반회원",    color: "bg-gray-100 text-gray-600" },
  }

  // ─��� ���판 전용: 지점 드릴다운 + 유저 생성 ──
  const [selectedBranch, setSelectedBranch]   = useState<any | null>(null) // 클릭한 지점
  const [branchMembers, setBranchMembers]     = useState<any[]>([])
  const [branchMembersLoading, setBranchMembersLoading] = useState(false)
  const [memberSearch, setMemberSearch]       = useState("")
  const [expandedMember, setExpandedMember]   = useState<string | null>(null)
  // 유저 생성 폼
  const [buUsername, setBuUsername]           = useState("")
  const [buPassword, setBuPassword]           = useState("")
  const [buCount, setBuCount]                 = useState("1")
  const [buMemo, setBuMemo]                   = useState("")
  const [buSubmitting, setBuSubmitting]       = useState(false)
  const [buMsg, setBuMsg]                     = useState<{ text: string; ok: boolean } | null>(null)
  // 충전 요청 (총판이 대총판에게)
  const [baChargeAmt, setBaChargeAmt]         = useState("")
  const [baChargeMemo, setBaChargeMemo]       = useState("")
  const [baChargeSubmitting, setBaChargeSubmitting] = useState(false)
  const [baChargeMsg, setBaChargeMsg]         = useState<{ text: string; ok: boolean } | null>(null)
  const [baChargeRequests, setBaChargeRequests] = useState<any[]>([])
  const [baChargeLoading, setBaChargeLoading] = useState(false)
  const [baChargeExpanded, setBaChargeExpanded] = useState(false)
  // 마켓 상품 등록 모달
  const [showUploadModal, setShowUploadModal]   = useState(false)
  // 총판 전용: ���점이 올린 충전 요청 목록
  const [branchChargeReqs, setBranchChargeReqs]         = useState<any[]>([])
  const [baBranchChargeLoading, setBaBranchChargeLoading] = useState(false)
  const [branchChargeExpanded, setBranchChargeExpanded]   = useState(false)
  // 총판 환전 요청 목록 (branch_admin 전용 요약)
  const [baExRequests, setBaExRequests]       = useState<any[]>([])
  const [baExLoading, setBaExLoading]         = useState(false)
  const [baExExpanded, setBaExExpanded]       = useState(false) // 환전 대기 펼침
  const [baStatExpanded, setBaStatExpanded]   = useState(false) // 누적 통계 펼침
  // 총판 지점에 지급�� 포인트 합계 (point_charge_requests 기준)
  const [baTotalCharged, setBaTotalCharged]   = useState(0)

  const loadBranchMembers = useCallback(async (branchCode: string) => {
    const token = getToken(); if (!token) return
    setBranchMembersLoading(true)
    try {
      const res = await fetch(`/api/admin/users?branch_code=${encodeURIComponent(branchCode)}&role=user`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) { const d = await res.json(); setBranchMembers(d.users ?? []) }
    } finally { setBranchMembersLoading(false) }
  }, [])

  const loadBaChargeRequests = useCallback(async () => {
    const token = getToken(); if (!token) return
    setBaChargeLoading(true)
    const res = await fetch("/api/admin/point-purchase", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setBaChargeRequests(d.requests ?? []) }
    setBaChargeLoading(false)
  }, [])

  const loadBranchChargeReqs = useCallback(async () => {
    const token = getToken(); if (!token) return
    setBaBranchChargeLoading(true)
    try {
      const res = await fetch("/api/admin/point-purchase?from=branches", { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) { const d = await res.json(); setBranchChargeReqs(d.requests ?? []) }
    } catch (e) {}
    setBaBranchChargeLoading(false)
  }, [])

  const loadBranchUsers = useCallback(async () => {
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/branch-users", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      setAdminMembers(d.members ?? [])
      setBranchBets(d.bets ?? [])
    }
  }, [])

  const loadBranchBets = useCallback(async (userId?: string, page = 1) => {
    const token = getToken(); if (!token) return
    setBranchBetsLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (userId) params.set("userId", userId)
    const res = await fetch(`/api/admin/branch-users?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setBranchBets(d.bets ?? []) }
    setBranchBetsLoading(false)
  }, [])

  const loadBranchExReqs = useCallback(async () => {
    const token = getToken(); if (!token) return
    setBranchExLoading(true)
    const res = await fetch("/api/admin/exchange-request", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      const reqs = d.requests ?? []
      setBranchExReqs(reqs)
      setBranchPendingEx(reqs.filter((r: any) => r.status === "pending").length)
      setBranchTotalEx(reqs.filter((r: any) => r.status === "approved").reduce((s: number, r: any) => s + (r.point_amount ?? 0), 0))
    }
    setBranchExLoading(false)
  }, [])

  // ── 유저 계정 생성 요청 모달 (admin 전��) �������
  const [adminCreateUserOpen, setAdminCreateUserOpen] = useState(false)
  const [acuUsername, setAcuUsername]   = useState("")
  const [acuPassword, setAcuPassword]   = useState("")
  const [acuCount, setAcuCount]         = useState("1")
  const [acuMemo, setAcuMemo]           = useState("")
  const [acuLoading, setAcuLoading]     = useState(false)
  const [acuMsg, setAcuMsg]             = useState<{ text: string; ok: boolean } | null>(null)
  const [acuShowPw, setAcuShowPw]       = useState(false)

  // ── 유저 계정 생성 요청 (branch_admin 승인용) ──
  const [acctRequests, setAcctRequests]       = useState<any[]>([])
  const [acctExpanded, setAcctExpanded]       = useState(false)
  const [acctProcessing, setAcctProcessing]   = useState<number | null>(null)

  const loadAcctRequests = useCallback(async () => {
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/user-account-requests", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setAcctRequests(d.requests ?? []) }
  }, [])

  // branch_admin 전용: 계정 생성 요청 5초 폴링
  useEffect(() => {
    if (myRole !== "branch_admin") return
    const id = setInterval(() => { loadAcctRequests() }, 5000)
    return () => clearInterval(id)
  }, [myRole, loadAcctRequests])

  const loadBaExRequests = useCallback(async () => {
    const token = getToken(); if (!token) return
    setBaExLoading(true)
    const res = await fetch("/api/admin/exchange-request", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setBaExRequests(d.requests ?? []) }
    setBaExLoading(false)
  }, [])

  const loadBaTotalCharged = useCallback(async () => {
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/point-charge", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      const total = (d.requests ?? [])
        .filter((r: any) => ["approved","activated"].includes(r.status))
        .reduce((s: number, r: any) => s + (r.point_amount ?? 0), 0)
      setBaTotalCharged(total)
    }
  }, [])

  const loadCommRates = useCallback(async () => {
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/commission-rates", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setCommRates(d.rates ?? []) }
  }, [])

  const loadMyCommBalance = useCallback(async () => {
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/commission-balances", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setMyCommBalance(d.balance ?? 0) }
  }, [])

  const handleBranchAdminCharge = async () => {
    if (!baChargeAmt || Number(baChargeAmt) <= 0) { setBaChargeMsg({ text: "금액을 입력하세요.", ok: false }); return }
    const token = getToken(); if (!token) return
    setBaChargeSubmitting(true); setBaChargeMsg(null)
    const res = await fetch("/api/admin/point-purchase", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cashAmount: Number(baChargeAmt), memo: baChargeMemo }),
    })
    const d = await res.json()
    setBaChargeMsg(res.ok ? { text: "충전 요청이 전송됐습니다. 대총판 승인 후 잔액이 추가됩니다.", ok: true } : { text: d.error ?? "오류", ok: false })
    if (res.ok) { setBaChargeAmt(""); setBaChargeMemo(""); loadBaChargeRequests() }
    setBaChargeSubmitting(false)
  }

  const handleBulkUserCreate = async (branchCode: string) => {
    if (!buUsername.trim() || !buPassword.trim()) { setBuMsg({ text: "아이디와 비밀번호를 입력하세요.", ok: false }); return }
    const count = Math.max(1, Math.min(50, Number(buCount) || 1))
    const token = getToken(); if (!token) return
    setBuSubmitting(true); setBuMsg(null)
    const res = await fetch("/api/admin/bulk-users", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: buUsername.trim(), password: buPassword, count, memo: buMemo, branchCode }),
    })
    const d = await res.json()
    if (res.ok) {
      setBuMsg({ text: `${d.created}개 계정이 생성됐습니다.`, ok: true })
      setBuUsername(""); setBuPassword(""); setBuCount("1"); setBuMemo("")
      if (selectedBranch) loadBranchMembers(selectedBranch.code)
    } else {
      setBuMsg({ text: d.error ?? "생성 실패", ok: false })
    }
    setBuSubmitting(false)
  }

  // ���─ 포인트 구매 ���청 (현금 내고 포인트 사기) ──
  const [ppRequests, setPpRequests]         = useState<any[]>([])
  const [ppLoading, setPpLoading]           = useState(false)
  const [ppCashAmt, setPpCashAmt]           = useState("")
  const [ppMemo, setPpMemo]                 = useState("")
  const [ppSubmitting, setPpSubmitting]     = useState(false)
  const [ppMsg, setPpMsg]                   = useState<{ text: string; ok: boolean } | null>(null)
  // 승인 모달
  const [ppApproveId, setPpApproveId]       = useState<string | null>(null)
  const [ppApprovePw, setPpApprovePw]       = useState("")
  const [ppApprovePoints, setPpApprovePoints] = useState("")
  const [ppApproveMsg, setPpApproveMsg]     = useState<{ text: string; ok: boolean } | null>(null)
  const [ppApproving, setPpApproving]       = useState(false)

  // ── 포인트 충전 요청 (임��계정 생성) ──
  const [pcRequests, setPcRequests]         = useState<any[]>([])
  const [pcLoading, setPcLoading]           = useState(false)
  const [pcPointAmt, setPcPointAmt]         = useState("")
  const [pcMemo, setPcMemo]                 = useState("")
  const [pcSubmitting, setPcSubmitting]     = useState(false)
  const [pcMsg, setPcMsg]                   = useState<{ text: string; ok: boolean } | null>(null)
  const [pcApproveId, setPcApproveId]       = useState<string | null>(null)
  const [pcApproving, setPcApproving]       = useState(false)
  const [pcApproveMsg, setPcApproveMsg]     = useState<{ text: string; ok: boolean } | null>(null)
  // 계정 활성화
  const [pcActivateId, setPcActivateId]     = useState<string | null>(null)
  const [pcActivatePw1, setPcActivatePw1]   = useState("")
  const [pcActivatePw2, setPcActivatePw2]   = useState("")
  const [pcActivating, setPcActivating]     = useState(false)
  const [pcActivateMsg, setPcActivateMsg]   = useState<{ text: string; ok: boolean } | null>(null)

  // ── 지점 회원 & 배팅 내역 (admin 전용) ──
  const [adminMembers, setAdminMembers]     = useState<any[]>([])
  const [branchBets, setBranchBets]         = useState<any[]>([])
  const [branchBetsLoading, setBranchBetsLoading] = useState(false)
  const [selectedMember, setSelectedMember] = useState<any | null>(null)
  const [betPage, setBetPage]               = useState(1)
  const [branchTab, setBranchTab]           = useState<"members" | "bets">("members")
  // 지점 요약 통계
  const [branchPendingCharge, setBranchPendingCharge] = useState(0)
  const [branchPendingEx, setBranchPendingEx]         = useState(0)
  const [branchTotalEx, setBranchTotalEx]             = useState(0)
  // 충전/회수 모달
  const [branchChargeUserId, setBranchChargeUserId]   = useState<string | null>(null)
  const [branchChargeAmt, setBranchChargeAmt]         = useState("")
  const [branchChargeLoading, setBranchChargeLoading] = useState(false)
  const [branchChargeMsg, setBranchChargeMsg]         = useState<{ text: string; ok: boolean } | null>(null)
  // 환전 처리 모달
  const [branchExReqs, setBranchExReqs]     = useState<any[]>([])
  const [branchExLoading, setBranchExLoading] = useState(false)
  const [branchExExpanded, setBranchExExpanded] = useState(false)

  // ── 환전 ���청 ──
  const [exRequests, setExRequests]         = useState<any[]>([])
  const [exLoading, setExLoading]           = useState(false)
  const [exTargetId, setExTargetId]         = useState("")
  const [exPointAmt, setExPointAmt]         = useState("")
  const [exMemo, setExMemo]                 = useState("")
  const [exSubmitting, setExSubmitting]     = useState(false)
  const [exMsg, setExMsg]                   = useState<{ text: string; ok: boolean } | null>(null)
  const [exApproveId, setExApproveId]       = useState<string | null>(null)
  const [exApproving, setExApproving]       = useState(false)
  const [exApproveMsg, setExApproveMsg]     = useState<{ text: string; ok: boolean } | null>(null)

  // ── 비밀번호 초기화 요청 ──
  const [prRequests, setPrRequests]         = useState<any[]>([])
  const [prLoading, setPrLoading]           = useState(false)
  const [prTargetId, setPrTargetId]         = useState("")
  const [prSubmitting, setPrSubmitting]     = useState(false)
  const [prMsg, setPrMsg]                   = useState<{ text: string; ok: boolean } | null>(null)
  const [prApproveId, setPrApproveId]       = useState<string | null>(null)
  const [prNewPw, setPrNewPw]               = useState("")
  const [prApproving, setPrApproving]       = useState(false)
  const [prApproveMsg, setPrApproveMsg]     = useState<{ text: string; ok: boolean } | null>(null)

  // ── 현금 잔고 & 거래이력 ──
  const [cashBalance, setCashBalance]       = useState(0)
  const [pointBalance, setPointBalance]     = useState(0)
  const [cashTxns, setCashTxns]             = useState<any[]>([])
  const [subBalances, setSubBalances]       = useState<any[]>([])
  const [cashLoading, setCashLoading]       = useState(false)

  // ── 달력 매출 ──
  const [calYear, setCalYear]               = useState(new Date().getFullYear())
  const [calMonth, setCalMonth]             = useState(new Date().getMonth() + 1)
  const [calData, setCalData]               = useState<any[]>([])
  const [calLoading, setCalLoading]         = useState(false)
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null)
  const [calBranchFilter, setCalBranchFilter] = useState("")
  const [memberDetail, setMemberDetail]     = useState<any | null>(null)
  const [expandedUser, setExpandedUser]     = useState<string | null>(null)

  // ── loaders ──
  const loadPpRequests = useCallback(async () => {
    const token = getToken(); if (!token) return
    setPpLoading(true)
    const res = await fetch("/api/admin/point-purchase", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setPpRequests(d.requests ?? []) }
    setPpLoading(false)
  }, [])

  const loadPcRequests = useCallback(async () => {
    const token = getToken(); if (!token) return
    setPcLoading(true)
    const res = await fetch("/api/admin/point-charge", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setPcRequests(d.requests ?? []) }
    setPcLoading(false)
  }, [])

  const loadExRequests = useCallback(async () => {
    const token = getToken(); if (!token) return
    setExLoading(true)
    const res = await fetch("/api/admin/exchange-request", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setExRequests(d.requests ?? []) }
    setExLoading(false)
  }, [])

  const loadPrRequests = useCallback(async () => {
    const token = getToken(); if (!token) return
    setPrLoading(true)
    const res = await fetch("/api/admin/password-reset", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setPrRequests(d.requests ?? []) }
    setPrLoading(false)
  }, [])

  const loadCash = useCallback(async () => {
    const token = getToken(); if (!token) return
    setCashLoading(true)
    const res = await fetch("/api/admin/cash", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      setCashBalance(d.cashBalance ?? 0)
      setPointBalance(d.pointBalance ?? 0)
      setCashTxns(d.transactions ?? [])
      setSubBalances(d.subBalances ?? [])
    }
    setCashLoading(false)
  }, [])

  const loadCalendar = useCallback(async (year: number, month: number, branch?: string, date?: string) => {
    const token = getToken(); if (!token) return
    setCalLoading(true)
    const params = new URLSearchParams({ year: String(year), month: String(month) })
    if (branch) params.set("branch_code", branch)
    if (date) params.set("date", date)
    const res = await fetch(`/api/admin/daily-sales?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      setCalData(d.calendar ?? [])
      if (date) setMemberDetail(d.memberDetail ?? null)
    }
    setCalLoading(false)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  // admin(지점)은 로그인 인증 자체가 본인 확인 — 비밀번호 게이트 불필요
  if (!adminPw && myRole !== "admin") {
    const isBranchAdmin = myRole === "branch_admin"
    const pwLabel = isBranchAdmin ? "본인 비밀번호" : "마스터 비밀번호"
    const pwDescription = isBranchAdmin ? "지점 관리 작업을 위해 본인 비밀번호를 입력하세요." : "관리 작업을 위해 마스터 비밀번호를 입력하세요."

    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm p-8 bg-card border border-border rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">관리자 인증</h1>
          </div>
          <p className="text-xs text-muted-foreground mb-6">{pwDescription}</p>
          <div className="space-y-3">
            <Input
              type="password"
              placeholder={pwLabel}
              value={pwInput}
              onChange={e => setPwInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handlePwSubmit()}
            />
            {pwError && <p className="text-xs text-destructive">{pwError}</p>}
            <Button className="w-full" onClick={handlePwSubmit} disabled={pwChecking}>
              {pwChecking ? "확인 중..." : "확인"}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const isSuperAdmin = SUPER_ROLES.includes(myRole)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">관리자 패널</h1>
            {myRole && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                myRole === "master" ? "bg-purple-100 text-purple-700" :
                myRole === "super_admin" ? "bg-red-100 text-red-700" :
                myRole === "branch_admin" ? "bg-blue-100 text-blue-700" :
                "bg-orange-100 text-orange-700"
              }`}>
                {{ master: "마스터", super_admin: "대총판", branch_admin: "총판", admin: "지점" }[myRole] ?? myRole}
              </span>
            )}
            {myBranchCode && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                코드: {myBranchCode}
              </span>
            )}
          </div>
        <div className="flex items-center gap-3">
          {/* 대총판: 총판 계정생성 버튼 */}
          {myRole === "super_admin" && (
            <Button size="sm" onClick={() => setSaOpen(true)} className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" /> 총판 계��생성
            </Button>
          )}
          {myRole === "branch_admin" && (
            <Button size="sm" onClick={() => { setBaCreateOpen(true); setBaCreateMsg(null); setBaNewBranchName(""); setBaNewBranchCode("") }} className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" /> 지점 계정생성
            </Button>
          )}
          {myRole === "admin" && (
            <Button size="sm" onClick={() => { setAdminCreateUserOpen(true); setAcuUsername(""); setAcuPassword(""); setAcuCount("1"); setAcuMemo(""); setAcuMsg(null) }} className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" /> 유저 생성요청
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => { clearToken(); clearCachedPw(); router.replace("/") }} className="gap-1.5 text-muted-foreground">
            <LogOut className="w-4 h-4" /> 나가기
          </Button>
        </div>
      </header>

      {/* ── 총판 전용: 지점 계정생성 ���달 ── */}
      {baCreateOpen && myRole === "branch_admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-primary" /> 지점 생성
              </h2>
              <button onClick={() => { setBaCreateOpen(false); setBaCreatedInfo(null); setBaCreateMsg(null) }} className="text-muted-foreground hover:text-foreground">
                <span className="text-lg leading-none">✕</span>
              </button>
            </div>

            {/* 생성 완료 — 계정 정보 표시 */}
            {baCreatedInfo ? (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">지점이 생성됐습니다. 아래 정보를 지점에 전달하세요.</p>
                <div className="bg-muted/50 rounded-lg p-4 space-y-3 border border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">로그인 ID (지점코드)</span>
                    <span className="font-mono text-sm font-bold text-foreground">{baCreatedInfo.code}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">비밀번호</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-foreground">
                        {baNewBranchShowPw ? baCreatedInfo.password : "•".repeat(baCreatedInfo.password.length)}
                      </span>
                      <button onClick={() => setBaNewBranchShowPw(v => !v)} className="text-muted-foreground hover:text-foreground">
                        {baNewBranchShowPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-amber-600">이 화면을 닫으면 비밀번호를 다시 확인할 수 없���니다.</p>
                <Button className="w-full" onClick={() => { setBaCreateOpen(false); setBaCreatedInfo(null); setBaNewBranchShowPw(false) }}>
                  확인
                </Button>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  지점명은 총판 목록에서 구분용으로만 사용됩니다. 지점코드가 로그인 ID가 되며, 비밀번호와 함께 지점에 전달하세요.
                </p>
                <div className="space-y-3 mb-4">
                  <div>
                    <p className="text-xs font-medium text-foreground mb-1.5">지점명 <span className="text-muted-foreground font-normal">(구분용)</span></p>
                    <Input placeholder="예: 역삼1지점" value={baNewBranchName} onChange={e => setBaNewBranchName(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground mb-1.5">지점코드 <span className="text-muted-foreground font-normal">(로그인 ID)</span></p>
                    <Input placeholder="예: YS001" value={baNewBranchCode} onChange={e => setBaNewBranchCode(e.target.value.toUpperCase())} className="h-9 text-sm font-mono" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground mb-1.5">비밀번호</p>
                    <div className="relative">
                      <Input
                        type={baNewBranchShowPw ? "text" : "password"}
                        placeholder="���점 로그인 비밀번호"
                        value={baNewBranchPw}
                        onChange={e => setBaNewBranchPw(e.target.value)}
                        className="h-9 text-sm pr-9"
                      />
                      <button type="button" onClick={() => setBaNewBranchShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {baNewBranchShowPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
                {baCreateMsg && (
                  <p className={`text-xs mb-3 ${baCreateMsg.ok ? "text-primary" : "text-destructive"}`}>{baCreateMsg.text}</p>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setBaCreateOpen(false)}>취소</Button>
                  <Button size="sm" className="flex-1 gap-1.5" disabled={baCreateLoading || !baNewBranchName.trim() || !baNewBranchCode.trim() || !baNewBranchPw.trim()} onClick={handleBaCreateBranch}>
                    <Plus className="w-3.5 h-3.5" />
                    {baCreateLoading ? "생성 중..." : "지점 생성"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 지점 전용: 유저 계정 생성 요청 모달 ── */}
      {adminCreateUserOpen && myRole === "admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-primary" /> 유저 계정 생성 요청
              </h2>
              <button onClick={() => setAdminCreateUserOpen(false)} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              총판��게 요청이 전달되며, ��인 후 계정이 ��성됩니다.<br />
              수량이 2 이상이면 ID 뒤에 번호가 자동으로 붙습니다. (예: user01, user02)
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">ID (아이디)</label>
                <Input placeholder="생성할 ID" value={acuUsername} onChange={e => setAcuUsername(e.target.value)} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">초기 비밀번호</label>
                <div className="relative">
                  <Input
                    type={acuShowPw ? "text" : "password"}
                    placeholder="초기 비밀번호"
                    value={acuPassword}
                    onChange={e => setAcuPassword(e.target.value)}
                    className="h-9 text-sm pr-9"
                  />
                  <button type="button" onClick={() => setAcuShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {acuShowPw ? <KeyRound className="w-3.5 h-3.5" /> : <KeyRound className="w-3.5 h-3.5 opacity-40" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">수량</label>
                <Input type="number" min="1" max="100" placeholder="1" value={acuCount} onChange={e => setAcuCount(e.target.value)} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">메모 (선택)</label>
                <textarea
                  placeholder="총���에게 전달할 메모"
                  value={acuMemo}
                  onChange={e => setAcuMemo(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60 resize-none"
                />
              </div>
            </div>
            {acuMsg && <p className={`text-xs mb-3 ${acuMsg.ok ? "text-primary" : "text-destructive"}`}>{acuMsg.text}</p>}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setAdminCreateUserOpen(false)}>취소</Button>
              <Button
                size="sm"
                className="flex-1 gap-1.5"
                disabled={acuLoading || !acuUsername.trim() || !acuPassword.trim()}
                onClick={async () => {
                  setAcuLoading(true); setAcuMsg(null)
                  const token = getToken()
                  const res = await fetch("/api/admin/user-account-requests", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ username: acuUsername, password: acuPassword, count: parseInt(acuCount) || 1, memo: acuMemo }),
                  })
                  const d = await res.json()
                  if (res.ok) {
                    setAcuMsg({ text: "요청이 총판에게 전달되었습니다.", ok: true })
                    setAcuUsername(""); setAcuPassword(""); setAcuCount("1"); setAcuMemo("")
                  } else {
                    setAcuMsg({ text: d.error ?? "오류가 발생했습니다.", ok: false })
                  }
                  setAcuLoading(false)
                }}
              >
                {acuLoading ? "요청 중..." : "요청 보내기"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 승인 모달 (포인트 구매) — 모든 탭에서 동작 ── */}
      {ppApproveId && (() => {
        const req = ppRequests.find((r: any) => r.id === ppApproveId)
          ?? baChargeRequests.find((r: any) => r.id === ppApproveId)
          ?? branchChargeReqs.find((r: any) => r.id === ppApproveId)
        const cashAmt = req?.cash_amount ?? 0
        const rate = parseFloat(ppApprovePoints) || 0
        const payout = rate > 0 ? Math.floor(cashAmt * rate) : 0
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-base font-semibold text-foreground mb-1">충전 요청 승인</h3>
              <p className="text-xs text-muted-foreground mb-4">요율을 입력하면 지급 포인트가 자동 계산됩니다.</p>
              <div className="bg-muted rounded-xl px-4 py-3 mb-4 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">요청자</span>
                  <span className="font-semibold text-foreground">{req?.requester?.username ?? "-"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">요청 금액</span>
                  <span className="font-semibold text-foreground">₩{cashAmt.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">지급 포인트</span>
                  <span className={`font-bold ${payout > 0 ? "text-primary" : "text-muted-foreground"}`}>
                    {payout > 0 ? `₩${payout.toLocaleString()}` : "-"}
                  </span>
                </div>
              </div>
              <div className="space-y-2 mb-3">
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">요율 입력 <span className="text-muted-foreground font-normal">(예: 1.2 �� {cashAmt > 0 ? `₩${Math.floor(cashAmt * 1.2).toLocaleString()}` : "1.2배"} 지급)</span></p>
                  <Input type="number" step="0.01" placeholder="예: 1.2" value={ppApprovePoints} onChange={e => setPpApprovePoints(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">비밀번호 확인</p>
                  <Input type="password" placeholder="내 비밀번호 입력" value={ppApprovePw} onChange={e => setPpApprovePw(e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
              {ppApproveMsg && <p className={`text-xs mb-3 ${ppApproveMsg.ok ? "text-primary" : "text-destructive"}`}>{ppApproveMsg.text}</p>}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { setPpApproveId(null); setPpApprovePw(""); setPpApprovePoints(""); setPpApproveMsg(null) }}>��소</Button>
                <Button
                  data-confirm
                  size="sm"
                  className="flex-1"
                  disabled={ppApproving || payout <= 0 || !ppApprovePw}
                  onClick={async () => {
                    setPpApproving(true); setPpApproveMsg(null)
                    const token = getToken()
                    const res = await fetch("/api/admin/point-purchase", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ requestId: ppApproveId, pointAmount: payout, rate, password: ppApprovePw }),
                    })
                    const d = await res.json()
                    if (res.ok) {
                      setPpApproveMsg({ text: `지급 완료. ₩${payout.toLocaleString()} 지급됨`, ok: true })
                      loadPpRequests()
                      loadUsers(adminPw)
                      setTimeout(() => { setPpApproveId(null); setPpApprovePw(""); setPpApprovePoints(""); setPpApproveMsg(null) }, 1500)
                    } else {
                      setPpApproveMsg({ text: d.error ?? "오류가 발생했습니다.", ok: false })
                    }
                    setPpApproving(false)
                  }}
                >
                  {ppApproving ? "처리 중..." : `₩${payout > 0 ? payout.toLocaleString() : "??"} 지급 확인`}
                </Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── 대총판 전용: 총판 계정생성 모달 ── */}
      {saOpen && myRole === "super_admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> 총판 계정 생성
              </h2>
              <button onClick={() => { setSaOpen(false); setSaMsg(null); setSaUsername(""); setSaPassword("") }} className="text-muted-foreground hover:text-foreground">
                <span className="text-lg leading-none">✕</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              총판 계정을 생성합니다. 생성된 계정으로 로그인하면 지점관리 탭이 표시됩니다.
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <p className="text-xs font-medium text-foreground mb-1.5">아이디</p>
                <Input placeholder="사용할 아이디 입력" value={saUsername} onChange={e => setSaUsername(e.target.value)} className="h-9 text-sm" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground mb-1.5">비밀번호</p>
                <Input type="password" placeholder="초기 비밀���호 설정" value={saPassword} onChange={e => setSaPassword(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            {saMsg && (
              <p className={`text-xs mb-3 ${saMsg.ok ? "text-primary" : "text-destructive"}`}>{saMsg.text}</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSaOpen(false); setSaMsg(null); setSaUsername(""); setSaPassword("") }}>취소</Button>
              <Button size="sm" className="flex-1 gap-1.5" disabled={saSubmitting || !saUsername.trim() || !saPassword.trim()} onClick={handleCreateBranchAdmin}>
                <Plus className="w-3.5 h-3.5" />
                {saSubmitting ? "생성 중..." : "총판 생성"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-border bg-card">
        <div className="px-4 border-b border-border">

          {/* ── 마스터 전용 탭 ── */}
          {myRole === "master" && (
            <div className="grid grid-cols-6">
              {/* 행 1: 회원관리~현금/환전 */}
              <button onClick={() => setActiveTab("users")}       className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "users"      ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Users className="w-4 h-4" /> 회원관리</button>
              <button onClick={() => setActiveTab("branches")}    className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "branches"   ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><GitBranch className="w-4 h-4" /> 지점관리</button>
              <button onClick={() => setActiveTab("monitor")}     className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "monitor"    ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Activity className="w-4 h-4" /> 라운드 모니터</button>
              <button onClick={() => setActiveTab("history")}     className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "history"    ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><TrendingDown className="w-4 h-4" /> 라운드 기록</button>
              <button onClick={() => { setActiveTab("points"); loadPpRequests(); loadPcRequests() }} className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "points"    ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Wallet className="w-4 h-4" /> 포인트</button>
              <button onClick={() => { setActiveTab("cash"); loadCash(); loadExRequests(); loadPrRequests() }} className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "cash"      ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Banknote className="w-4 h-4" /> 현금/환전</button>

              {/* 행 2: 매출달력~수수료 설정 */}
              <button onClick={() => { setActiveTab("calendar"); loadCalendar(calYear, calMonth, calBranchFilter || undefined) }} className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "calendar"  ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><CalendarDays className="w-4 h-4" /> 매출달력</button>
              <button onClick={() => { setActiveTab("pnl"); loadPnl(pnlPeriod) }}      className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "pnl"       ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><TrendingUp className="w-4 h-4" /> 손익</button>
              <button onClick={() => setActiveTab("accounts")}   className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "accounts"  ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Shield className="w-4 h-4" /> 계정생성</button>
              <button onClick={() => { setActiveTab("cards"); fetchCardImages() }}      className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "cards"     ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><ImageIcon className="w-4 h-4" /> 카드관리</button>
              <button onClick={() => { setActiveTab("commission"); loadCommRates() }}   className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "commission"? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Percent className="w-4 h-4" /> 수수료 설정</button>
              <button onClick={() => { setActiveTab("wallets"); setWalletRepairResult(null); setWalletRepairError(null) }} className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "wallets"   ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Wallet className="w-4 h-4" /> 입금 주소 관리</button>

              {/* 행 3: 자동매매~마켓 관리 */}
              <button
                onClick={async () => {
                  setActiveTab("auto_trade")
                  setAutoLoading(true)
                  try {
                    const tok = localStorage.getItem("app_token") ?? ""
                    const [posRes, setRes, rulesRes] = await Promise.all([
                      fetch("/api/auto-signal/positions", { headers: { Authorization: `Bearer ${tok}` } }),
                      fetch("/api/auto-signal/settings",  { headers: { Authorization: `Bearer ${tok}` } }),
                      fetch("/api/auto-signal/rules"),
                    ])
                    const posData   = await posRes.json()
                    const setData   = await setRes.json()
                    const rulesData = await rulesRes.json()
                    setAutoPositions(posData.positions ?? [])
                    setAutoSettings(setData)
                    setAutoSettingsEdit({ size_usd: String(setData.size_usd ?? 10), leverage: String(setData.leverage ?? 10), enabled: setData.enabled ?? true, stop_loss_pct: setData.stop_loss_pct != null ? String(setData.stop_loss_pct) : "" })
                    if (setData.seed_capital != null) setSeedCapital(String(setData.seed_capital))
                    setSignalRules(Array.isArray(rulesData) ? rulesData : [])
                    setWebhookUrl(`${window.location.origin}/api/auto-signal/webhook`)
                  } finally {
                    setAutoLoading(false)
                  }
                }}
                className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "auto_trade" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <TrendingUp className="w-4 h-4" /> 자동매매
              </button>
              <button onClick={() => setActiveTab("write_requests")} className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "write_requests" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><UserCheck className="w-4 h-4" /> 글쓰기 신청</button>
              <button onClick={() => setActiveTab("market")}      className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "market"     ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><ShoppingBag className="w-4 h-4" /> 마켓 관리</button>
              <button onClick={async () => {
                setActiveTab("pay_webhook")
                // 저장된 설정 불러오기
                try {
                  const res  = await fetch("/api/pay-master-settings")
                  if (res.ok) {
                    const d = await res.json()
                    setPwWebhookUrl(d.webhookUrl ?? "")
                    setPwWebhookSecret(d.webhookSecret ?? "")
                    setPwSiteId(d.siteId ?? "")
                    setPwBtnText(d.tgBtnText ?? "")
                    setPwBtnUrl(d.tgBtnUrl ?? "")
                  }
                } catch { /* ignore */ }
              }} className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "pay_webhook" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2 11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                충전 웹훅
              </button>
            </div>
          )}

          {/* ── 대총판 전용 탭 ── */}
          {myRole === "super_admin" && (
            <div className="grid grid-cols-6">
              <button onClick={() => { setActiveTab("branches_sa"); loadBranchAdmins() }} className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "branches_sa" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Users className="w-4 h-4" /> 총판 목록
                {ppRequests.filter((r: any) => r.status === "pending").length > 0 && (
                  <span className="ml-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {ppRequests.filter((r: any) => r.status === "pending").length}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* ── 총판 전용 탭 ── */}
          {myRole === "branch_admin" && (
            <div className="grid grid-cols-6">
              <button onClick={() => { setActiveTab("branches"); loadBranches(adminPw); loadBaChargeRequests(); loadBranchChargeReqs(); loadBaExRequests(); loadBaTotalCharged(); loadAcctRequests() }} className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "branches" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <GitBranch className="w-4 h-4" /> 총판
                {baChargeRequests.filter((r: any) => r.status === "pending").length > 0 && (
                  <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {baChargeRequests.filter((r: any) => r.status === "pending").length}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* ── 지점 전용 탭 (현금/환전만) ── */}
          {myRole === "admin" && (
            <div className="grid grid-cols-6">
              <button onClick={() => { setActiveTab("cash"); loadCash(); loadExRequests(); loadPrRequests(); loadBranchUsers(); loadBranchExReqs() }} className={`flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "cash" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Banknote className="w-4 h-4" /> 지점
              </button>
            </div>
          )}

        </div>
      </div>

      <main className="p-6 max-w-5xl mx-auto">

        {/* 회원관리 탭 */}
        {activeTab === "users" && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">
                  {myRole === "branch_admin" ? "소속 지점 회원" : "전체 회원"}
                </p>
                <p className="text-2xl font-bold text-foreground">{users.length}명</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">총 잔고</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatBalance(users.reduce((s, u) => s + u.balance, 0))}
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">회원 목록</h2>
                <Button variant="ghost" size="sm" onClick={() => loadUsers(adminPw)} disabled={usersLoading} className="gap-1.5 text-xs">
                  <RefreshCw className={`w-3.5 h-3.5 ${usersLoading ? "animate-spin" : ""}`} /> 새로고침
                </Button>
              </div>

              {usersLoading ? (
                <div className="py-12 flex justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {users.length === 0 && (
                    <p className="py-10 text-center text-sm text-muted-foreground">회원이 없습니다.</p>
                  )}
                  {users.map(user => {
                    const rl = roleLabel[user.role] ?? { label: user.role, color: "bg-gray-100 text-gray-600" }
                    const isCharging = chargeUserId === user.id
                    return (
                      <div key={user.id} className="px-5 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-xs font-semibold text-primary">{user.username.charAt(0)}</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground">{user.username}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${rl.color}`}>{rl.label}</span>
                                {user.branch_code && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                                    {user.branch_code}
                                  </span>
                                )}
                                {user.telegram_id ? (
                                  <>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#229ED9]/15 text-[#229ED9] font-medium flex items-center gap-1">
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                                      {user.telegram_username ? `@${user.telegram_username}` : user.telegram_first_name ?? user.telegram_id}
                                    </span>
                                    {/* 텔레그램 고��� 주문금액 설정 */}
                                    {myRole === "master" && (
                                      <span className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          step={1000}
                                          placeholder={String(user.tg_bet_amount ?? 10000)}
                                          value={tgBetAmounts[user.id] ?? ""}
                                          onChange={e => setTgBetAmounts(prev => ({ ...prev, [user.id]: e.target.value }))}
                                          onFocus={() => {
                                            if (!tgBetAmounts[user.id]) {
                                              setTgBetAmounts(prev => ({ ...prev, [user.id]: String(user.tg_bet_amount ?? 10000) }))
                                            }
                                          }}
                                          className="w-24 h-5 px-1.5 rounded bg-secondary border border-border text-[10px] text-foreground text-right tabular-nums"
                                        />
                                        <span className="text-[9px] text-muted-foreground">원</span>
                                        <button
                                          disabled={tgBetSaving === user.id}
                                          onClick={async () => {
                                            const amt = parseInt(tgBetAmounts[user.id] ?? "", 10)
                                            if (isNaN(amt) || amt <= 0) return
                                            setTgBetSaving(user.id)
                                            const token = getToken()
                                            await fetch("/api/admin/update-tg-bet-amount", {
                                              method: "PATCH",
                                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                              body: JSON.stringify({ userId: user.id, amount: amt }),
                                            })
                                            setTgBetSaving(null)
                                          }}
                                          className="h-5 px-1.5 rounded bg-primary/20 border border-primary/30 text-[9px] text-primary font-medium hover:bg-primary/30 transition-colors disabled:opacity-50"
                                        >
                                          {tgBetSaving === user.id ? "..." : "저장"}
                                        </button>
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                                    TG 미연동
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{formatDate(user.created_at)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">잔고</p>
                              <p className="text-sm font-semibold text-foreground">{formatBalance(user.balance)}</p>
                            </div>
                            {/* 모의매매 허용 체크박스 */}
                            {myRole === "master" && (
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={mockChecks[user.id] ?? false}
                                    onChange={e => setMockChecks(prev => ({ ...prev, [user.id]: e.target.checked }))}
                                    className="w-3.5 h-3.5 accent-primary rounded"
                                  />
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">모의매매</span>
                                </label>
                                <Button
                                  size="sm" variant="outline" className="h-7 px-2 text-[10px]"
                                  disabled={mockSaving === user.id}
                                  onClick={async () => {
                                    setMockSaving(user.id)
                                    const token = getToken()
                                    await fetch("/api/admin/allow-mock-trade", {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                      body: JSON.stringify({ userId: user.id, allow: mockChecks[user.id] ?? false }),
                                    })
                                    setMockSaving(null)
                                  }}
                                >
                                  {mockSaving === user.id ? "..." : "저장"}
                                </Button>
                                {/* 토큰 입금 허용 체크박스 */}
                                <label className="flex items-center gap-1.5 cursor-pointer select-none ml-1">
                                  <input
                                    type="checkbox"
                                    checked={depositChecks[user.id] ?? false}
                                    onChange={e => setDepositChecks(prev => ({ ...prev, [user.id]: e.target.checked }))}
                                    className="w-3.5 h-3.5 accent-primary rounded"
                                  />
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">토큰입금</span>
                                </label>
                                <Button
                                  size="sm" variant="outline" className="h-7 px-2 text-[10px]"
                                  disabled={depositSaving === user.id}
                                  onClick={async () => {
                                    setDepositSaving(user.id)
                                    const token = getToken()
                                    await fetch("/api/admin/allow-token-deposit", {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                      body: JSON.stringify({ userId: user.id, allow: depositChecks[user.id] ?? false }),
                                    })
                                    setDepositSaving(null)
                                  }}
                                >
                                  {depositSaving === user.id ? "..." : "저장"}
                                </Button>
                                {/* 메뉴 그룹 */}
                                <div className="flex items-center gap-1 border-l border-border pl-2 ml-1">
                                  {(["g1", "g2", "g3"] as const).map((gk, i) => (
                                    <label key={gk} className="flex items-center gap-1 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={groupChecks[user.id]?.[gk] ?? (gk === "g2")}
                                        onChange={e => setGroupChecks(prev => ({
                                          ...prev,
                                          [user.id]: { ...(prev[user.id] ?? { g1: false, g2: true, g3: false }), [gk]: e.target.checked },
                                        }))}
                                        className="w-3.5 h-3.5 accent-primary rounded"
                                      />
                                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">G{i + 1}</span>
                                    </label>
                                  ))}
                                  <Button
                                    size="sm" variant="outline" className="h-7 px-2 text-[10px]"
                                    disabled={groupSaving === user.id}
                                    onClick={async () => {
                                      setGroupSaving(user.id)
                                      const token = getToken()
                                      const g = groupChecks[user.id] ?? { g1: false, g2: true, g3: false }
                                      await fetch("/api/admin/menu-groups", {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                        body: JSON.stringify({ userId: user.id, group1: g.g1, group2: g.g2, group3: g.g3 }),
                                      })
                                      setGroupSaving(null)
                                    }}
                                  >
                                    {groupSaving === user.id ? "..." : "메뉴"}
                                  </Button>
                                </div>
                              </div>
                            )}
                            {/* 비밀번호 초기화 ���튼 (master만) */}
                            {myRole === "master" && (
                              <Button
                                size="sm" variant="outline"
                                className="text-xs gap-1 border-destructive/50 text-destructive hover:bg-destructive/10"
                                disabled={pwResetSaving === user.id}
                                onClick={async () => {
                                  if (!confirm(`${user.username}의 비밀번호를 000000으로 초기화하시겠습니까?`)) return
                                  setPwResetSaving(user.id)
                                  const token = getToken()
                                  const res = await fetch("/api/admin/reset-password-direct", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                    body: JSON.stringify({ userId: user.id }),
                                  })
                                  setPwResetSaving(null)
                                  if (res.ok) alert(`${user.username} 비밀번호가 000000으로 초기화됐습니다.`)
                                  else { const d = await res.json(); alert(d.error ?? "오류가 발생했습니다.") }
                                }}
                              >
                                {pwResetSaving === user.id ? "..." : "비번초기화"}
                              </Button>
                            )}
                            <Button
                              size="sm" variant="outline" className="text-xs gap-1"
                              onClick={() => { setChargeUserId(isCharging ? null : user.id); setChargeAmount(""); setChargeMsg(null) }}
                            >
                              <Wallet className="w-3 h-3" />
                              {isCharging ? "닫기" : "충전"}
                            </Button>
                          </div>
                        </div>
                        {isCharging && (
                          <div className="mt-3 p-3 bg-muted rounded-lg space-y-3">
                            {/* 잔고 충전/차감 */}
                            <div>
                              <p className="text-xs font-medium text-foreground mb-2">잔고 충전 / 차감</p>
                              <div className="flex gap-2">
                                <Input type="number" placeholder="금액 입력" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} className="h-8 text-sm" />
                                <Button size="sm" className="gap-1 h-8 text-xs" onClick={() => handleCharge(user.id, 1)} disabled={chargeLoading}>
                                  <Plus className="w-3 h-3" /> 충전
                                </Button>
                                <Button size="sm" variant="outline" className="gap-1 h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleCharge(user.id, -1)} disabled={chargeLoading}>
                                  <Minus className="w-3 h-3" /> 차감
                                </Button>
                              </div>
                              {chargeMsg && <p className={`text-xs mt-2 ${chargeMsg.ok ? "text-primary" : "text-destructive"}`}>{chargeMsg.text}</p>}
                            </div>
                            {/* 게임 카테고리 활성화 토글 */}
                            <GameAccessToggle
                              userId={user.id}
                              enabled={!!user.game_enabled}
                              token={getToken() ?? ""}
                              onChanged={(val) => setUsers(prev => prev.map(u => u.id === user.id ? { ...u, game_enabled: val } : u))}
                            />
                            {/* 역할 변경 (master만) */}
                            {myRole === "master" && user.role !== "master" && (
                              <RoleChanger
                                userId={user.id}
                                currentRole={user.role}
                                token={adminPw}
                                roleLabel={roleLabel}
                                onChanged={(newRole) => {
                                  setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u))
                                }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* 지점관리 탭 (대총판/마스터 전용) */}
        {activeTab === "branches" && (myRole === "master" || myRole === "branch_admin") && (
          <>
          {/* ══════ 마스터 전용: 지점 생성 폼 ══════ */}
          {myRole === "master" && (
            <div className="bg-card border border-border rounded-xl p-5 mb-6">
              <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-primary" /> 새 지점 생성
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <Input
                  placeholder="지점명 (예: 역삼1지점)"
                  value={newBranchName}
                  onChange={e => setNewBranchName(e.target.value)}
                />
                <Input
                  placeholder="지점코드 (예: YS001)"
                  value={newBranchCode}
                  onChange={e => setNewBranchCode(e.target.value.toUpperCase())}
                />
                {/* ���판 검색 (필��) */}
                <div className="relative">
                  <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                  <Input
                    className="pl-9"
                    placeholder="총판 아이디 검색 (필수)"
                    value={ownerSearch}
                    onChange={e => {
                      setOwnerSearch(e.target.value)
                      setNewBranchOwner("")
                      setOwnerDropdownOpen(true)
                    }}
                    onFocus={() => setOwnerDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setOwnerDropdownOpen(false), 150)}
                  />
                  {newBranchOwner && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary font-medium">
                      {newBranchOwner} 선택됨
                    </span>
                  )}
                  {ownerDropdownOpen && ownerSearch.length >= 1 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {users
                        .filter(u => u.username.toLowerCase().includes(ownerSearch.toLowerCase()) && u.role !== "master")
                        .slice(0, 10)
                        .map(u => (
                          <button
                            key={u.id}
                            type="button"
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted flex items-center justify-between"
                            onMouseDown={() => {
                              setNewBranchOwner(u.username)
                              setOwnerSearch(u.username)
                              setOwnerDropdownOpen(false)
                            }}
                          >
                            <span>{u.username}</span>
                            <span className="text-xs text-muted-foreground">{roleLabel[u.role]?.label ?? u.role}</span>
                          </button>
                        ))}
                      {users.filter(u => u.username.toLowerCase().includes(ownerSearch.toLowerCase()) && u.role !== "master").length === 0 && (
                        <p className="px-4 py-3 text-sm text-muted-foreground">검색 결과 없음</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {branchMsg && <p className={`text-xs mb-3 ${branchMsg.ok ? "text-primary" : "text-destructive"}`}>{branchMsg.text}</p>}
              <Button onClick={handleCreateBranch} disabled={branchLoading || !newBranchName || !newBranchCode || !newBranchOwner} className="gap-1.5 text-sm">
                <Plus className="w-4 h-4" /> 지점 생성
              </Button>
            </div>
          )}

            {/* ══════ 총판 전용: 요약 카드 ══════ */}
            {myRole === "branch_admin" && (
              <div className="space-y-4 mb-4">
                {/* 상단 4개 카드 */}
                {(() => {
                  const pendingCharge = baChargeRequests.filter((r: any) => r.status === "pending").length
                  const pendingEx = baExRequests.filter((r: any) => r.status === "pending").length
                  const totalEx = baExRequests
                    .filter((r: any) => r.status === "approved")
                    .reduce((s: number, r: any) => s + (r.point_amount ?? 0), 0)
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {/* 지점 수 */}
                      <div className="bg-card border border-border rounded-xl p-4">
                        <p className="text-xs text-muted-foreground mb-1">��점 수</p>
                        <p className="text-2xl font-bold text-foreground">{branches.length}<span className="text-sm font-normal text-muted-foreground ml-1">개</span></p>
                        <p className="text-[11px] text-muted-foreground mt-1">현재 잔액 <span className="font-semibold text-foreground">₩{myBalance.toLocaleString()}</span></p>
                      </div>
                      {/* 대기 중인 충전 — 클릭 시 ����� */}
                      <button
                        onClick={() => setBaChargeExpanded(v => !v)}
                        className="bg-card border border-border rounded-xl p-4 text-left hover:bg-muted/30 transition-colors"
                      >
                        <p className="text-xs text-muted-foreground mb-1">대기 중인 충전</p>
                        <p className={`text-2xl font-bold ${pendingCharge > 0 ? "text-amber-500" : "text-foreground"}`}>
                          {pendingCharge}<span className="text-sm font-normal text-muted-foreground ml-1">건</span>
                        </p>
                        <p className="text-[11px] text-primary/70 mt-1">{baChargeExpanded ? "접기 ▲" : "목록 보기 ▼"}</p>
                      </button>
                      {/* 지점 충전 요청 — 클릭 시 펼침 */}
                      <button
                        onClick={() => { setBranchChargeExpanded(v => !v); if (!branchChargeExpanded) loadBranchChargeReqs() }}
                        className="bg-card border border-border rounded-xl p-4 text-left hover:bg-muted/30 transition-colors"
                      >
                        <p className="text-xs text-muted-foreground mb-1">지점 충전 요청</p>
                        <p className={`text-2xl font-bold ${branchChargeReqs.filter((r: any) => r.status === "pending").length > 0 ? "text-primary" : "text-foreground"}`}>
                          {branchChargeReqs.filter((r: any) => r.status === "pending").length}<span className="text-sm font-normal text-muted-foreground ml-1">건</span>
                        </p>
                        <p className="text-[11px] text-primary/70 mt-1">{branchChargeExpanded ? "접기 ▲" : "목록 보기 ▼"}</p>
                      </button>
                      {/* 대기 중인 환전 — 클릭 시 펼침 */}
                      <button
                        onClick={() => setBaExExpanded(v => !v)}
                        className="bg-card border border-border rounded-xl p-4 text-left hover:bg-muted/30 transition-colors"
                      >
                        <p className="text-xs text-muted-foreground mb-1">대기 중인 환전</p>
                        <p className={`text-2xl font-bold ${pendingEx > 0 ? "text-primary" : "text-foreground"}`}>
                          {pendingEx}<span className="text-sm font-normal text-muted-foreground ml-1">건</span>
                        </p>
                        <p className="text-[11px] text-primary/70 mt-1">{baExExpanded ? "접기 ▲" : "목록 보기 ▼"}</p>
                      </button>
                      {/* 누적 통계 — 클릭 시 펼침 */}
                      <button
                        onClick={() => setBaStatExpanded(v => !v)}
                        className="bg-card border border-border rounded-xl p-4 text-left hover:bg-muted/30 transition-colors"
                      >
                        <p className="text-xs text-muted-foreground mb-1">누적 환전액</p>
                        <p className="text-2xl font-bold text-foreground">₩{totalEx.toLocaleString()}</p>
                        <p className="text-[11px] text-primary/70 mt-1">{baStatExpanded ? "접기 ▲" : "상세 보기 ▼"}</p>
                      </button>
                      {/* 수수료 잔고 */}
                      <div className="bg-card border border-border rounded-xl p-4">
                        <p className="text-xs text-muted-foreground mb-1">수수료 잔고</p>
                        <p className="text-2xl font-bold text-amber-500">₩{myCommBalance.toLocaleString()}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">배팅 수수료 누적</p>
                      </div>
                    </div>
                  )
                })()}

                {/* ── 유저 계정 생성 요청 (총판 승인) ── */}
                {myRole === "branch_admin" && (() => {
                  const pendingAcct = acctRequests.filter((r: any) => r.status === "pending")
                  const approvedAcct = acctRequests.filter((r: any) => r.status === "approved")
                  return (
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                      <div
                        onClick={() => setAcctExpanded(v => !v)}
                        className="flex items-center justify-between w-full px-5 py-3 border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <Users className="w-4 h-4 text-primary" />
                          유저 계정 생성 요청
                          {pendingAcct.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold">{pendingAcct.length}�� 대기</span>
                          )}
                        </h3>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); loadAcctRequests() }} className="h-7 w-7 p-0">
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                          <span className="text-xs text-muted-foreground">{acctExpanded ? "접기 ▲" : "펼치기 ▼"}</span>
                        </div>
                      </div>

                      {acctExpanded && (
                        <div>
                          {/* 대기 중인 요청 */}
                          {pendingAcct.length > 0 && (
                            <div>
                              <div className="px-5 py-2 bg-amber-50/50 border-b border-border">
                                <p className="text-xs font-semibold text-amber-600">대기 중 ({pendingAcct.length}건)</p>
                              </div>
                              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-5 py-2 bg-muted/40 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
                                <span>요청 ID / 지점</span>
                                <span className="text-center">수량</span>
                                <span className="text-center">메모</span>
                                <span className="text-right">���청일시</span>
                                <span className="text-right">처리</span>
                              </div>
                              <div className="divide-y divide-border">
                                {pendingAcct.map((r: any) => (
                                  <div key={r.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-5 py-3 items-center">
                                    <div>
                                      <p className="text-sm font-semibold text-foreground">{r.username_prefix}</p>
                                      <p className="text-[10px] text-muted-foreground">{r.requester?.username ?? "-"}</p>
                                    </div>
                                    <span className="text-sm font-bold text-foreground text-center">{r.count}개</span>
                                    <span className="text-xs text-muted-foreground text-center max-w-[100px] truncate">{r.memo ?? "-"}</span>
                                    <span className="text-[10px] text-muted-foreground text-right whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("ko-KR")}</span>
                                    <div className="flex gap-1.5 justify-end">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={acctProcessing === r.id}
                                        className="h-7 px-2 text-[11px] text-destructive border-destructive/30 hover:bg-destructive/10"
                                        onClick={async () => {
                                          setAcctProcessing(r.id)
                                          const token = getToken()
                                          await fetch("/api/admin/user-account-requests", {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                            body: JSON.stringify({ requestId: r.id, action: "reject" }),
                                          })
                                          await loadAcctRequests()
                                          setAcctProcessing(null)
                                        }}
                                      >{acctProcessing === r.id ? "..." : "거절"}</Button>
                                      <Button
                                        size="sm"
                                        disabled={acctProcessing === r.id}
                                        className="h-7 px-3 text-[11px]"
                                        onClick={async () => {
                                          setAcctProcessing(r.id)
                                          const token = getToken()
                                          const res = await fetch("/api/admin/user-account-requests", {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                            body: JSON.stringify({ requestId: r.id, action: "approve" }),
                                          })
                                          const d = await res.json()
                                          await loadAcctRequests()
                                          setAcctProcessing(null)
                                          if (res.ok) loadBranches(adminPw)
                                        }}
                                      >{acctProcessing === r.id ? "처리중..." : "승인"}</Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 처리 완료 내역 */}
                          {approvedAcct.length > 0 && (
                            <div>
                              <div className="px-5 py-2 bg-muted/30 border-b border-border">
                                <p className="text-xs font-semibold text-muted-foreground">승인 완료 ({approvedAcct.length}건)</p>
                              </div>
                              <div className="divide-y divide-border">
                                {approvedAcct.slice(0, 5).map((r: any) => (
                                  <div key={r.id} className="px-5 py-2.5 flex items-center justify-between gap-4">
                                    <div>
                                      <p className="text-sm font-medium text-foreground">{r.username_prefix}</p>
                                      <p className="text-[10px] text-muted-foreground">{r.requester?.username ?? "-"} · {r.count}개 생성</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-[11px] text-primary font-semibold">승인 완료</p>
                                      {r.created_usernames?.length > 0 && (
                                        <p className="text-[10px] text-muted-foreground">{r.created_usernames.slice(0, 3).join(", ")}{r.created_usernames.length > 3 ? ` 외 ${r.created_usernames.length - 3}개` : ""}</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {pendingAcct.length === 0 && approvedAcct.length === 0 && (
                            <p className="py-6 text-center text-sm text-muted-foreground">계정 생성 요청이 없습니다.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* 지점 충전 요청 펼침 목록 */}
                {branchChargeExpanded && (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-primary" /> 지점 충전 요청
                        {branchChargeReqs.filter((r: any) => r.status === "pending").length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold">
                            {branchChargeReqs.filter((r: any) => r.status === "pending").length}건 대기
                          </span>
                        )}
                      </h3>
                      <Button variant="ghost" size="sm" onClick={loadBranchChargeReqs} disabled={baBranchChargeLoading} className="h-7 w-7 p-0">
                        <RefreshCw className={`w-3.5 h-3.5 ${baBranchChargeLoading ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                    {branchChargeReqs.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">지점으로부터 받은 충전 요청이 없습니다.</p>
                    ) : (
                      <div className="divide-y divide-border">
                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-2 bg-muted/50 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          <span>지점 / 요청일시</span>
                          <span className="text-right">요청금액</span>
                          <span className="text-right">지급포인트</span>
                          <span className="text-right">처리</span>
                        </div>
                        {branchChargeReqs.map((r: any) => (
                          <div key={r.id} className={`grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 items-center ${r.status === "pending" ? "bg-primary/5" : ""}`}>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{r.requester?.username ?? "-"}</p>
                              <p className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString("ko-KR")}</p>
                              {r.memo && <p className="text-[10px] text-muted-foreground">{r.memo}</p>}
                            </div>
                            <span className="text-sm font-bold text-foreground text-right">₩{r.cash_amount?.toLocaleString()}</span>
                            <span className="text-sm text-muted-foreground text-right">
                              {r.status === "approved" ? `${r.point_amount?.toLocaleString()} P` : "-"}
                            </span>
                            <div className="flex justify-end">
                              {r.status === "pending" ? (
                                <Button
                                  size="sm"
                                  className="h-7 px-3 text-[11px]"
                                  onClick={() => {
                                    setPpApproveId(r.id)
                                    setPpApprovePw("")
                                    setPpApprovePoints("")
                                    setPpApproveMsg(null)
                                  }}
                                >
                                  승인
                                </Button>
                              ) : (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${r.status === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                  {r.status === "approved" ? "완료" : "거절"}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 환전 요청 펼침 목록 */}
                {baExExpanded && (() => {
                  const pendingEx = baExRequests.filter((r: any) => r.status === "pending")
                  return (
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <ArrowLeftRight className="w-4 h-4 text-primary" /> 대기 중인 환전 요청
                          {pendingEx.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold">{pendingEx.length}건</span>
                          )}
                        </h3>
                        <Button variant="ghost" size="sm" onClick={loadBaExRequests} disabled={baExLoading} className="h-7 w-7 p-0">
                          <RefreshCw className={`w-3.5 h-3.5 ${baExLoading ? "animate-spin" : ""}`} />
                        </Button>
                      </div>
                      {pendingEx.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">대기 중인 환전 요청이 없습니다.</p>
                      ) : (
                        <div className="divide-y divide-border">
                          <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-2 bg-muted/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                            <span>유저 / 요청일시</span>
                            <span className="text-right">금액</span>
                            <span className="text-right">��리</span>
                          </div>
                          {pendingEx.map((r: any) => (
                            <div key={r.id} className="px-5 py-3 grid grid-cols-[1fr_auto_auto] gap-4 items-center">
                              <div>
                                <p className="text-sm font-semibold text-foreground">{r.target_user?.username ?? "-"}</p>
                                <p className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString("ko-KR")}</p>
                                {r.memo && <p className="text-[10px] text-muted-foreground">{r.memo}</p>}
                              </div>
                              <span className="text-sm font-bold text-foreground">₩{r.point_amount?.toLocaleString()}</span>
                              <div className="flex gap-1.5">
                                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-destructive border-destructive/30 hover:bg-destructive/10"
                                  onClick={async () => {
                                    const token = getToken()
                                    await fetch("/api/admin/exchange-request", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "reject" }) })
                                    loadBaExRequests()
                                  }}>거��</Button>
                                <Button size="sm" className="h-7 px-3 text-[11px]"
                                  onClick={async () => {
                                    const token = getToken()
                                    await fetch("/api/admin/exchange-request", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "complete" }) })
                                    loadBaExRequests()
                                  }}>완료</Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* 누적 통계 펼침 */}
                {baStatExpanded && (() => {
                  const approvedEx = baExRequests.filter((r: any) => r.status === "approved")
                  const totalEx = approvedEx.reduce((s: number, r: any) => s + (r.point_amount ?? 0), 0)
                  return (
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                      <div className="px-5 py-3 border-b border-border">
                        <h3 className="text-sm font-semibold text-foreground">누적 ��계</h3>
                      </div>
                      <div className="grid grid-cols-3 divide-x divide-border">
                        <div className="p-5">
                          <p className="text-xs text-muted-foreground mb-1">누적 환전액</p>
                          <p className="text-xl font-bold text-foreground">₩{totalEx.toLocaleString()}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">완���된 환전 누계</p>
                        </div>
                        <div className="p-5">
                          <p className="text-xs text-muted-foreground mb-1">배팅 수��료</p>
                          <p className="text-xl font-bold text-amber-500">₩{myCommBalance.toLocaleString()}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">유저 배팅 수수료 누계</p>
                        </div>
                        <div className="p-5">
                          <p className="text-xs text-muted-foreground mb-1">지급된 포인트</p>
                          <p className="text-xl font-bold text-primary">₩{baTotalCharged.toLocaleString()}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">지점에 공급된 누계</p>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* 충전 요청 폼 */}
                <div className="bg-card border border-border rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-primary" /> 충전 요청
                  </h2>
                  <p className="text-xs text-muted-foreground mb-4">버튼을 눌러 금액을 쌓���나 직접 입력하세요. 대총판이 요율을 적용해 승인하면 잔액이 추가됩니다.</p>

                  {/* 빠른 금액 버튼 */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {[50000, 100000, 500000, 1000000, 10000000, 50000000, 100000000].map(amt => (
                      <button
                        key={amt}
                        onClick={() => setBaChargeAmt(prev => String((Number(prev) || 0) + amt))}
                        className="px-3 py-1.5 rounded-lg border border-border bg-muted hover:bg-primary/10 hover:border-primary/40 text-xs font-semibold text-foreground transition-colors"
                      >
                        +{amt >= 100000000 ? `${amt / 100000000}억` : amt >= 10000000 ? `${amt / 10000000}천만` : amt >= 10000 ? `${amt / 10000}만` : amt.toLocaleString()}
                      </button>
                    ))}
                    <button
                      onClick={() => setBaChargeAmt("")}
                      className="px-3 py-1.5 rounded-lg border border-border bg-muted hover:bg-destructive/10 hover:border-destructive/40 text-xs font-semibold text-muted-foreground transition-colors"
                    >
                      초기화
                    </button>
                  </div>

                  {/* 현재 입��� 금액 표시 */}
                  {Number(baChargeAmt) > 0 && (
                    <div className="mb-3 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-sm font-bold text-primary">
                      ₩{Number(baChargeAmt).toLocaleString()}
                    </div>
                  )}

                  {/* 직접 입력 + 메모 + 요청 버튼 */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="금액 직접 입력 (원)"
                      type="number"
                      value={baChargeAmt}
                      onChange={e => setBaChargeAmt(e.target.value)}
                      className="h-9 text-sm w-44"
                    />
                    <Input
                      placeholder="메모 (선택)"
                      value={baChargeMemo}
                      onChange={e => setBaChargeMemo(e.target.value)}
                      className="h-9 text-sm flex-1"
                    />
                    <Button size="sm" className="h-9 shrink-0 gap-1.5" disabled={baChargeSubmitting || !Number(baChargeAmt)} onClick={handleBranchAdminCharge}>
                      <Plus className="w-3.5 h-3.5" /> 요청
                    </Button>
                  </div>
                  {baChargeMsg && <p className={`text-xs mt-2 ${baChargeMsg.ok ? "text-primary" : "text-destructive"}`}>{baChargeMsg.text}</p>}
                </div>

                {/* 충전 요청 내역 펼침 패널 */}
                {baChargeExpanded && (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-amber-500" /> 충전 요청 내역
                        {baChargeRequests.filter((r: any) => r.status === "pending").length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
                            {baChargeRequests.filter((r: any) => r.status === "pending").length}건 대기
                          </span>
                        )}
                      </h3>
                      <Button variant="ghost" size="sm" onClick={loadBaChargeRequests} disabled={baChargeLoading} className="h-7 w-7 p-0">
                        <RefreshCw className={`w-3.5 h-3.5 ${baChargeLoading ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                    {baChargeRequests.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">충전 요청 내역이 없습니다.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-2 bg-muted/50 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          <span>요청일시</span>
                          <span className="text-right">요청금액</span>
                          <span className="text-right">요율</span>
                          <span className="text-right">상태</span>
                        </div>
                        <div className="divide-y divide-border">
                          {baChargeRequests.map((r: any) => {
                            const rate = r.point_amount && r.cash_amount ? (r.point_amount / r.cash_amount).toFixed(2) : "-"
                            const statusMap: Record<string, { label: string; cls: string }> = {
                              pending:   { label: "대기중",   cls: "bg-yellow-100 text-yellow-700" },
                              approved:  { label: "지급완료", cls: "bg-green-100 text-green-700" },
                              activated: { label: "지급완료", cls: "bg-green-100 text-green-700" },
                              rejected:  { label: "거절",     cls: "bg-red-100 text-red-700" },
                              requested: { label: "요����완료", cls: "bg-blue-100 text-blue-700" },
                            }
                            const st = statusMap[r.status] ?? { label: r.status, cls: "bg-muted text-muted-foreground" }
                            return (
                              <div key={r.id} className={`grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 items-center ${r.status === "pending" ? "bg-yellow-50/40" : ""}`}>
                                <div>
                                  <p className="text-xs text-foreground">{new Date(r.created_at).toLocaleString("ko-KR")}</p>
                                  {r.memo && <p className="text-[10px] text-muted-foreground">{r.memo}</p>}
                                  {r.approved_at && <p className="text-[10px] text-primary">지급: {new Date(r.approved_at).toLocaleString("ko-KR")}</p>}
                                </div>
                                <span className="text-sm font-semibold text-foreground text-right">₩{r.cash_amount?.toLocaleString()}</span>
                                <span className="text-sm text-muted-foreground text-right">{rate}</span>
                                <span className="flex justify-end">
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${st.cls}`}>{st.label}</span>
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ══════ ���통: 지��� 목록 (총판은 카드형 클릭 가능) ══════ */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">지점 목록</h2>
                <Button variant="ghost" size="sm" onClick={() => loadBranches(adminPw)} disabled={branchesLoading} className="gap-1.5 text-xs">
                  <RefreshCw className={`w-3.5 h-3.5 ${branchesLoading ? "animate-spin" : ""}`} /> 새로고침
                </Button>
              </div>

              {branchesLoading ? (
                <div className="py-12 flex justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                </div>
              ) : branches.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">생성된 지점��� 없습니다.</p>
              ) : myRole === "branch_admin" ? (
                /* 총판: 큰 카드형 그리드 */
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {branches.map(branch => (
                    <button
                      key={branch.id}
                      onClick={() => { setSelectedBranch(branch); setBranchMembers([]); setMemberSearch(""); loadBranchMembers(branch.code) }}
                      className="relative bg-gradient-to-br from-primary/5 to-primary/10 border-2 border-border hover:border-primary/40 rounded-2xl p-5 text-left transition-all hover:shadow-md group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <GitBranch className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-mono font-bold">{branch.code}</span>
                          <div className="text-right space-y-0.5">
                            <p className="text-[10px] text-muted-foreground leading-none">
                              누적 지급 <span className="font-semibold text-foreground">{((branch.total_granted ?? 0) / 10000).toLocaleString()}만P</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground leading-none">
                              유저 보유 <span className="font-semibold text-primary">{((branch.total_user_points ?? 0) / 10000).toLocaleString()}만P</span>
                            </p>
                          </div>
                        </div>
                      </div>
                      <p className="text-base font-bold text-foreground group-hover:text-primary transition-colors">{branch.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatDate(branch.created_at)}</p>
                      <div className="absolute bottom-4 right-4 text-xs text-primary/60 font-medium">클릭하여 열기 →</div>
                    </button>
                  ))}
                </div>
              ) : (
                /* 마스터: 리스트형 */
                <div className="divide-y divide-border">
                  {branches.map(branch => (
                    <div key={branch.id} className="px-5 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <GitBranch className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{branch.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-mono font-medium">{branch.code}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">관리자: {branch.owner_email ?? "미지정"} · {formatDate(branch.created_at)}</p>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 gap-1 text-xs" onClick={() => handleDeleteBranch(branch.id)}>
                        <Trash2 className="w-3.5 h-3.5" /> 삭제
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════ 총판 지점 드릴다운 패널 ══════ */}
        {selectedBranch && myRole === "branch_admin" && (
          <div className="fixed inset-0 z-50 flex">
            {/* 배경 딤 */}
            <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedBranch(null)} />
            {/* 사이드 패널 */}
            <div className="relative ml-auto w-full max-w-2xl bg-background border-l border-border h-full overflow-y-auto shadow-2xl flex flex-col">
              {/* 헤더 */}
              <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between z-10">
                <div>
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-primary" />
                    <h2 className="text-base font-semibold text-foreground">{selectedBranch.name}</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-mono font-bold">{selectedBranch.code}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(selectedBranch.created_at)}</p>
                </div>
                <button onClick={() => setSelectedBranch(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none px-2">��</button>
              </div>

              <div className="flex-1 p-6 space-y-6">
                {/* 유저 생성 폼 */}
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> 유저 생성</h3>
                  <p className="text-xs text-muted-foreground mb-4">수량만큼 계정이 생성됩니다. 아이디가 여러 개면 뒤에 번호가 자동으로 붙습니다 (예: user01, user02).</p>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <Input placeholder="아이디" value={buUsername} onChange={e => setBuUsername(e.target.value)} className="h-9 text-sm" />
                    <Input placeholder="비밀번호" type="password" value={buPassword} onChange={e => setBuPassword(e.target.value)} className="h-9 text-sm" />
                    <Input placeholder="수량 (최대 50)" type="number" min={1} max={50} value={buCount} onChange={e => setBuCount(e.target.value)} className="h-9 text-sm" />
                    <Input placeholder="메모 (���택)" value={buMemo} onChange={e => setBuMemo(e.target.value)} className="h-9 text-sm" />
                  </div>
                  {buMsg && <p className={`text-xs mb-2 ${buMsg.ok ? "text-primary" : "text-destructive"}`}>{buMsg.text}</p>}
                  <Button size="sm" className="gap-1.5 text-sm" disabled={buSubmitting || !buUsername.trim() || !buPassword.trim()} onClick={() => handleBulkUserCreate(selectedBranch.code)}>
                    <Plus className="w-3.5 h-3.5" /> {buSubmitting ? "생성 중..." : `${buCount}개 유저 생성`}
                  </Button>
                </div>

                {/* 회원 목록 */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground shrink-0">회원 목록 ({branchMembers.length}명)</h3>
                    <Input placeholder="아이디 검색" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} className="h-8 text-xs max-w-48" />
                    <Button variant="ghost" size="sm" onClick={() => loadBranchMembers(selectedBranch.code)} disabled={branchMembersLoading} className="gap-1 text-xs shrink-0">
                      <RefreshCw className={`w-3 h-3 ${branchMembersLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                  {branchMembersLoading ? (
                    <div className="py-10 flex justify-center"><div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" /></div>
                  ) : branchMembers.filter(u => !memberSearch || u.username.toLowerCase().includes(memberSearch.toLowerCase())).length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">회원이 없습니다.</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {branchMembers
                        .filter(u => !memberSearch || u.username.toLowerCase().includes(memberSearch.toLowerCase()))
                        .map(u => (
                          <div key={u.id}>
                            <button
                              className="w-full px-5 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors text-left"
                              onClick={() => setExpandedMember(expandedMember === u.id ? null : u.id)}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <span className="text-[10px] font-bold text-primary">{u.username.charAt(0)}</span>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">{u.username}</p>
                                  <p className="text-[10px] text-muted-foreground">{formatDate(u.created_at)}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-foreground">₩{(u.balance ?? 0).toLocaleString()}</span>
                                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expandedMember === u.id ? "rotate-90" : ""}`} />
                              </div>
                            </button>
                            {expandedMember === u.id && (
                              <div className="px-5 pb-4 bg-muted/30 space-y-2">
                                <p className="text-xs text-muted-foreground pt-2">ID: <span className="text-foreground font-mono text-[11px]">{u.id}</span></p>
                                <p className="text-xs text-muted-foreground">가입일: {new Date(u.created_at).toLocaleString("ko-KR")}</p>
                                <p className="text-xs text-muted-foreground">지점코드: {u.branch_code ?? "-"}</p>
                                {myRole === "master" && u.role !== "master" && (
                                  <RoleChanger
                                    userId={u.id}
                                    currentRole={u.role}
                                    token={adminPw}
                                    roleLabel={roleLabel}
                                    onChanged={(newRole) => {
                                      setBranchMembers(prev => prev.map(m => m.id === u.id ? { ...m, role: newRole } : m))
                                    }}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* LP 히스토리 탭 - 라운드 모니터로 ���합됨 (이 블록은 도달 안됨) */}
        {false && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">LP 유동성 히스토리</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">파리뮤추얼 라운드별 LP 투입 기록</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">총 LP 사용액</p>
                  <p className="text-sm font-bold text-foreground">₩{lpTotal.toLocaleString()}</p>
                </div>
              </div>

              {lpLoading ? (
                <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : lpHistory.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">LP 사용 내역이 없습니다.</div>
              ) : (
                <div className="divide-y divide-border">
                  {lpHistory.map(tx => {
                    const poolLabel: Record<string, string> = { long_short: "롱/숏", under_over: "���더/오버", odd_even: "홀/짝" }
                    const sideLabel = tx.side === "a" ? "A (롱·언더·홀)" : "B (숏·오버·짝)"
                    return (
                      <div key={tx.id} className="px-5 py-3 flex items-center justify-between text-sm">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{poolLabel[tx.pool_type] ?? tx.pool_type}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">{sideLabel}</span>
                            {tx.settled_odds != null && (
                              <span className="text-xs text-muted-foreground">확정 x{tx.settled_odds.toFixed(2)}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            라운드 {new Date(tx.round_time * 1000).toLocaleString("ko-KR")} · 사용자 배팅 ₩{tx.user_amount.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-foreground">₩{tx.lp_amount.toLocaleString()}</p>
                          <p className="text-[11px] text-muted-foreground">{new Date(tx.created_at).toLocaleTimeString("ko-KR")}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 하우스 손익 탭 - 라운드 모니터로 통합됨 */}
        {false && (
          <div className="space-y-5">

            {/* 마스터 전체 집계 요약 */}
            {masterSummary && (
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-primary" /> ���체 지점 합산
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "총 배팅액", value: masterSummary.totalBet, color: "text-foreground" },
                    { label: "총 지급액", value: masterSummary.totalPayout, color: "text-red-500" },
                    { label: "하우스 손익", value: masterSummary.houseProfit, color: masterSummary.houseProfit >= 0 ? "text-emerald-500" : "text-red-500" },
                    { label: "총 LP 사용", value: masterSummary.totalLpUsed, color: "text-blue-500" },
                    { label: "누적 수수료", value: masterSummary.totalFee, color: "text-amber-500" },
                    { label: "수금 완료", value: masterSummary.totalCollected, color: "text-muted-foreground" },
                    { label: "미���금", value: masterSummary.pendingFee, color: masterSummary.pendingFee > 0 ? "text-orange-500" : "text-muted-foreground" },
                  ].map(item => (
                    <div key={item.label} className="bg-background rounded-xl p-3">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className={`text-base font-bold tabular-nums mt-0.5 ${item.color}`}>
                        {item.value >= 0 ? "" : "-"}₩{Math.abs(item.value).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 지점별 상세 */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">지점별 하우스 손익</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">게임 유형별 배팅·지급·LP·수수료 ��계</p>
                </div>
                <Button variant="ghost" size="sm" onClick={loadHouseStats} disabled={houseLoading} className="gap-1.5 text-xs">
                  <RefreshCw className={`w-3.5 h-3.5 ${houseLoading ? "animate-spin" : ""}`} /> 새로고침
                </Button>
              </div>

              {houseLoading ? (
                <div className="py-10 flex justify-center">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : houseStats.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">아직 집계 데이터가 없습니다.</div>
              ) : (
                <div className="divide-y divide-border">
                  {houseStats.map(stat => {
                    const pending = Math.max(0, stat.total_fee - stat.total_collected)
                    const housePnl = stat.total_bet - stat.total_payout
                    const key = `${stat.branch_id}-${stat.game_type}`
                    return (
                      <div key={stat.id} className="px-5 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {stat.branches?.name ?? stat.branch_id}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                              {stat.game_type === "baccarat" ? "바카라" : "레이스"}
                            </span>
                          </div>
                          {isSuperAdmin && pending > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1.5"
                              disabled={collectingId === key}
                              onClick={() => handleCollect(stat.branch_id, stat.game_type)}
                            >
                              <Download className="w-3 h-3" />
                              {collectingId === key ? "처리 중..." : `���${pending.toLocaleString()} 수금`}
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">총 배팅</p>
                            <p className="font-semibold text-foreground tabular-nums">₩{stat.total_bet.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">총 지급</p>
                            <p className="font-semibold text-red-500 tabular-nums">��{stat.total_payout.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">하우스 손익</p>
                            <p className={`font-bold tabular-nums ${housePnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                              {housePnl >= 0 ? "+" : "-"}���{Math.abs(housePnl).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">LP 사용</p>
                            <p className="font-semibold text-blue-500 tabular-nums">₩{stat.total_lp_used.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">미수금 수수료</p>
                            <p className={`font-bold tabular-nums ${pending > 0 ? "text-orange-500" : "text-muted-foreground"}`}>
                              ���{pending.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 수금 이력 */}
            {feeCollections.length > 0 && (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">수금 이력</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">최근 20건</p>
                </div>
                <div className="divide-y divide-border">
                  {feeCollections.map(fc => (
                    <div key={fc.id} className="px-5 py-3 flex items-center justify-between text-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{fc.branches?.name ?? fc.branch_id}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {fc.game_type === "baccarat" ? "바카라" : "레이스"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{fc.note} · {new Date(fc.created_at).toLocaleString("ko-KR")}</p>
                      </div>
                      <p className="font-bold text-emerald-500 tabular-nums">₩{fc.collected_amount.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 지점별 LP 설정 (마스터 전용) */}
            {isSuperAdmin && (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">지점별 LP 금액 설정</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">바카라 / 레이스 게임별 LP 유동성 ��액 (마스터 전용)</p>
                </div>
                <div className="divide-y divide-border">
                  {branches.map(branch => (
                    <LpBranchRow key={branch.id} branch={branch} onSaved={loadHouseStats} />
                  ))}
                  {branches.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">지점이 없습니다.</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 라운드 모니터 + 자동배팅 통합 탭 */}
        {activeTab === "monitor" && (
          <div>
            <RoundMonitor
              isSuperAdmin={isSuperAdmin}
              branchId={isSuperAdmin ? undefined : myBranchId}
              branches={branches}
            />
          </div>
        )}

        {/* 라운드 기록 탭 */}
        {activeTab === "history" && (
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold">라운드 기록</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                바카라·레이스 라운드별 결과, 배당, 참여 회원 및 수익을 확인합니다.
              </p>
            </div>
            <RoundHistory />
          </div>
        )}



        {/* ───────────── 대총판: 총판 목록 탭 ───────────── */}
        {activeTab === "branches_sa" && myRole === "super_admin" && (() => {
          const pending = ppRequests.filter((r: any) => r.status === "pending")
          const totalBalances = saBranchAdmins.reduce((s, u) => s + (u.balance ?? 0), 0)
          const totalSales = ppRequests.reduce((s: number, r: any) => s + (r.cash_amount ?? 0), 0)
          return (
          <div className="space-y-4">

            {/* 요약 카드 5개 */}
            <div className="grid grid-cols-5 gap-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">총판 수</p>
                <p className="text-2xl font-bold text-foreground">{saBranchAdmins.length}<span className="text-sm font-normal text-muted-foreground ml-1">개</span></p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">대기 중인 충전</p>
                <p className="text-2xl font-bold text-primary">{pending.length}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">총판 잔고 합계</p>
                <p className="text-2xl font-bold text-emerald-600">₩{totalBalances.toLocaleString()}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">요청금액(매출)</p>
                <p className="text-2xl font-bold text-foreground">₩{totalSales.toLocaleString()}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">수수료 잔고</p>
                <p className="text-2xl font-bold text-amber-500">₩{myCommBalance.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground mt-1">배팅 수수료 누적</p>
              </div>
            </div>

            {/* ��판 목록 + 드릴다운 */}
            <div className="bg-card border border-border rounded-xl overflow-hidden flex" style={{ minHeight: 400 }}>

              {/* 좌: 총판 리스트 */}
              {(() => {
                const SA_PAGE_SIZE = 10
                const filtered = saBranchAdmins.filter(ba =>
                  !saSearch.trim() || ba.username.toLowerCase().includes(saSearch.trim().toLowerCase())
                )
                const totalPages = Math.max(1, Math.ceil(filtered.length / SA_PAGE_SIZE))
                const currentPage = Math.min(saPage, totalPages)
                const pageItems = filtered.slice((currentPage - 1) * SA_PAGE_SIZE, currentPage * SA_PAGE_SIZE)
                return (
                  <div className="w-72 shrink-0 border-r border-border flex flex-col">
                    {/* 헤더: 제목 + 검색 + 새로고침 */}
                    <div className="px-4 py-3 border-b border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-foreground">총판 목록</h3>
                        <Button variant="ghost" size="sm" onClick={loadBranchAdmins} disabled={saListLoading} className="h-7 w-7 p-0">
                          <RefreshCw className={`w-3.5 h-3.5 ${saListLoading ? "animate-spin" : ""}`} />
                        </Button>
                      </div>
                      <Input
                        placeholder="총판 검색..."
                        value={saSearch}
                        onChange={e => { setSaSearch(e.target.value); setSaPage(1) }}
                        className="h-8 text-xs"
                      />
                    </div>
                    {/* 목록 */}
                    <div className="flex-1 overflow-y-auto divide-y divide-border">
                      {saListLoading && <p className="py-8 text-center text-xs text-muted-foreground">불러오는 중...</p>}
                      {!saListLoading && filtered.length === 0 && (
                        <p className="py-8 text-center text-sm text-muted-foreground">{saSearch ? "검색 결과 없음" : "총판이 없습니다."}</p>
                      )}
                      {pageItems.map(ba => {
                        const baRequests = ppRequests.filter((r: any) => r.requester_id === ba.id)
                        const pendingCnt = baRequests.filter((r: any) => r.status === "pending").length
                        const totalRequested = baRequests.reduce((s: number, r: any) => s + (r.cash_amount ?? 0), 0)
                        const isSelected = saSelectedBa?.id === ba.id
                        return (
                          <button
                            key={ba.id}
                            onClick={() => { setSaSelectedBa(isSelected ? null : ba); setSaReqPage(1) }}
                            className={`w-full px-4 py-3.5 flex items-center justify-between hover:bg-muted/40 transition-colors text-left ${isSelected ? "bg-primary/5 border-l-2 border-primary" : ""}`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <span className="text-[10px] font-bold text-primary">{ba.username.charAt(0).toUpperCase()}</span>
                                </div>
                                <span className="text-sm font-semibold text-foreground truncate">{ba.username}</span>
                                {pendingCnt > 0 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold leading-none">{pendingCnt}</span>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5 pl-8.5">
                                요청누적 <span className="font-medium text-foreground">₩{totalRequested.toLocaleString()}</span>
                              </p>
                              <p className="text-[10px] text-muted-foreground pl-8.5">
                                잔고 <span className="font-medium text-foreground">₩{(ba.balance ?? 0).toLocaleString()}</span>
                              </p>
                            </div>
                            <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isSelected ? "rotate-90" : ""}`} />
                          </button>
                        )
                      })}
                    </div>
                    {/* 페이지네이션 */}
                    {totalPages > 1 && (
                      <div className="px-4 py-2.5 border-t border-border flex items-center justify-between shrink-0">
                        <button
                          onClick={() => setSaPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
                        >이전</button>
                        <span className="text-xs text-muted-foreground">{currentPage} / {totalPages}</span>
                        <button
                          onClick={() => setSaPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
                        >다음</button>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* 우: 선택된 총판의 충전 요청 목록 */}
              <div className="flex-1 flex flex-col min-w-0">
                {!saSelectedBa ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">총판을 선택하면 충전 요청 목록이 표시됩니다.</p>
                  </div>
                ) : (() => {
                  const REQ_PAGE_SIZE = 10
                  // 최�����순 정렬
                  const baRequests = [...ppRequests.filter((r: any) => r.requester_id === saSelectedBa.id)]
                    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  const pendingReqs = baRequests.filter((r: any) => r.status === "pending")
                  const reqTotalPages = Math.max(1, Math.ceil(baRequests.length / REQ_PAGE_SIZE))
                  const reqCurrentPage = Math.min(saReqPage, reqTotalPages)
                  const pageRequests = baRequests.slice((reqCurrentPage - 1) * REQ_PAGE_SIZE, reqCurrentPage * REQ_PAGE_SIZE)
                  return (
                    <div className="flex flex-col flex-1 min-h-0">
                      {/* 헤더 */}
                      <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{saSelectedBa.username}</span>
                          <span className="text-xs text-muted-foreground">충전 요청</span>
                          {pendingReqs.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold">{pendingReqs.length}건 대기</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">잔고</span>
                          <span className="text-sm font-bold text-emerald-600">₩{(saSelectedBa.balance ?? 0).toLocaleString()}</span>
                        </div>
                      </div>
                      {/* 테이블 헤더 */}
                      {baRequests.length > 0 && (
                        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-5 py-2 bg-muted/50 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
                          <span>요청일시</span>
                          <span className="text-right">요청금액</span>
                          <span className="text-right">요율</span>
                          <span className="text-right">지급금액</span>
                          <span className="text-right">상태</span>
                        </div>
                      )}
                      {/* 목록 */}
                      <div className="flex-1 overflow-y-auto divide-y divide-border">
                        {baRequests.length === 0 && (
                          <p className="py-8 text-center text-sm text-muted-foreground">충전 요청 내역이 없습니다.</p>
                        )}
                        {pageRequests.map((r: any) => {
                          const isPending = r.status === "pending"
                          const isApproved = r.status === "approved" || r.status === "activated"
                          return (
                            <div key={r.id} className={`px-5 py-3 grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center ${isPending ? "bg-yellow-50/40" : ""}`}>
                              <div>
                                <p className="text-xs text-foreground">{new Date(r.created_at).toLocaleString("ko-KR")}</p>
                                {r.memo && <p className="text-[10px] text-muted-foreground">{r.memo}</p>}
                                {isApproved && r.approved_at && (
                                  <p className="text-[10px] text-primary">지급: {new Date(r.approved_at).toLocaleString("ko-KR")}</p>
                                )}
                              </div>
                              <span className="text-sm font-bold text-right">₩{r.cash_amount?.toLocaleString()}</span>
                              <span className="text-sm text-muted-foreground text-right">{r.rate ?? "-"}</span>
                              <span className={`text-sm font-bold text-right ${isApproved ? "text-primary" : "text-muted-foreground"}`}>
                                {r.point_amount ? `₩${r.point_amount.toLocaleString()}` : "-"}
                              </span>
                              <div className="flex items-center justify-end gap-1.5">
                                {isPending ? (
                                  <>
                                    <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-destructive border-destructive/30 hover:bg-destructive/10" onClick={async () => {
                                      const token = getToken()
                                      await fetch("/api/admin/point-purchase", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "reject" }) })
                                      loadPpRequests()
                                    }}>거절</Button>
                                    <Button size="sm" className="h-7 px-3 text-[11px]" onClick={() => { setPpApproveId(r.id); setPpApprovePw(""); setPpApprovePoints(""); setPpApproveMsg(null) }}>승인</Button>
                                  </>
                                ) : (
                                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${isApproved ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                    {isApproved ? "지급완료" : "거절"}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {/* ��전 요청 페이지네이션 */}
                      {reqTotalPages > 1 && (
                        <div className="px-5 py-2.5 border-t border-border flex items-center justify-between shrink-0">
                          <button
                            onClick={() => setSaReqPage(p => Math.max(1, p - 1))}
                            disabled={reqCurrentPage === 1}
                            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
                          >이전</button>
                          <span className="text-xs text-muted-foreground">{reqCurrentPage} / {reqTotalPages} 페이지 · 전체 {baRequests.length}건</span>
                          <button
                            onClick={() => setSaReqPage(p => Math.min(reqTotalPages, p + 1))}
                            disabled={reqCurrentPage === reqTotalPages}
                            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
                          >다음</button>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

            </div>
          </div>
          )
        })()}

        {/* ───────────── 포인트 탭 ───────────── */}
        {activeTab === "points" && (
          <div className="space-y-6">

            {/* 포인트 ��매 요청 폼 — 총판/지점만 */}
            {(myRole === "branch_admin" || myRole === "admin") && (
              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Wallet className="w-4 h-4 text-primary" /> 포인트 구매 요청</h2>
                <p className="text-xs text-muted-foreground">현금 금액을 입력하고 요청하면 마스터/대총판이 포인트를 지급���니다.</p>
                <div className="flex gap-2">
                  <Input placeholder="현금 금액" type="number" value={ppCashAmt} onChange={e => setPpCashAmt(e.target.value)} className="h-9 text-sm w-40" />
                  <Input placeholder="메모 (선택)" value={ppMemo} onChange={e => setPpMemo(e.target.value)} className="h-9 text-sm flex-1" />
                  <Button size="sm" className="h-9 shrink-0" disabled={ppSubmitting} onClick={async () => {
                    setPpSubmitting(true); setPpMsg(null)
                    const token = getToken()
                    const res = await fetch("/api/admin/point-purchase", {
                      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ cashAmount: Number(ppCashAmt), memo: ppMemo }),
                    })
                    const d = await res.json()
                    setPpMsg(res.ok ? { text: "요청됐습니다.", ok: true } : { text: d.error ?? "오류", ok: false })
                    if (res.ok) { setPpCashAmt(""); setPpMemo(""); loadPpRequests() }
                    setPpSubmitting(false)
                  }}>요청</Button>
                </div>
                {ppMsg && <p className={`text-xs ${ppMsg.ok ? "text-primary" : "text-destructive"}`}>{ppMsg.text}</p>}
              </div>
            )}





            {/* 포��트 ���전 요청 (임시계정 생성) — master ��용 */}
            {myRole === "master" && <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> 포인트 충전 요청 (유저 계정 생성)</h2>
              <p className="text-xs text-muted-foreground">승인되면 포인트가 충전된 임시 계정이 자동 생성됩니���.</p>
              <div className="flex gap-2">
                <Input placeholder="충전 포인트" type="number" value={pcPointAmt} onChange={e => setPcPointAmt(e.target.value)} className="h-9 text-sm w-40" />
                <Input placeholder="메모 (선택)" value={pcMemo} onChange={e => setPcMemo(e.target.value)} className="h-9 text-sm flex-1" />
                <Button size="sm" className="h-9 shrink-0" disabled={pcSubmitting} onClick={async () => {
                  setPcSubmitting(true); setPcMsg(null)
                  const token = getToken()
                  const res = await fetch("/api/admin/point-charge", {
                    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ pointAmount: Number(pcPointAmt), memo: pcMemo }),
                  })
                  const d = await res.json()
                  setPcMsg(res.ok ? { text: "충��� 요청됐습니다.", ok: true } : { text: d.error ?? "오류", ok: false })
                  if (res.ok) { setPcPointAmt(""); setPcMemo(""); loadPcRequests() }
                  setPcSubmitting(false)
                }}>요청</Button>
              </div>
              {pcMsg && <p className={`text-xs ${pcMsg.ok ? "text-primary" : "text-destructive"}`}>{pcMsg.text}</p>}
            </div>}

            {/* 충전 요청 목록 — master 전용 */}
            {myRole === "master" && <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">충전 요청 목록</h2>
                <Button variant="ghost" size="sm" onClick={loadPcRequests} disabled={pcLoading} className="gap-1.5 text-xs">
                  <RefreshCw className={`w-3.5 h-3.5 ${pcLoading ? "animate-spin" : ""}`} /> 새로고침
                </Button>
              </div>
              <div className="divide-y divide-border">
                {pcRequests.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">요청이 없습니다.</p>}
                {pcRequests.map((r: any) => (
                  <div key={r.id} className="px-5 py-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{r.requester?.username}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{r.branch_code ?? "지점없음"}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${r.status === "approved" || r.status === "activated" ? "bg-green-100 text-green-700" : r.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                            {r.status === "pending" ? "대기" : r.status === "approved" ? "승인(미활성)" : r.status === "activated" ? "활성화" : "거절"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">포인트 {r.point_amount?.toLocaleString()} {r.memo ? `· ${r.memo}` : ""}</p>
                        {(r.status === "approved" || r.status === "activated") && r.temp_username && (
                          <p className="text-xs font-mono bg-muted rounded px-2 py-1 mt-1 text-foreground">
                            ID: {r.temp_username} {r.status === "approved" ? `/ PW: ${r.temp_password}` : "(활성화됨)"}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{new Date(r.created_at).toLocaleString("ko-KR")}</p>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {isSuperAdmin && r.status === "pending" && (
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30" onClick={async () => {
                              const token = getToken()
                              await fetch("/api/admin/point-charge", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "reject" }) })
                              loadPcRequests()
                            }}>거절</Button>
                            <Button size="sm" className="h-7 text-xs" disabled={pcApproving && pcApproveId === r.id} onClick={async () => {
                              setPcApproveId(r.id); setPcApproving(true); setPcApproveMsg(null)
                              const token = getToken()
                              const res = await fetch("/api/admin/point-charge", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "approve" }) })
                              const d = await res.json()
                              setPcApproveMsg(res.ok ? { text: `승인됨: ${d.tempUsername} / ${d.tempPassword}`, ok: true } : { text: d.error ?? "오류", ok: false })
                              if (res.ok) loadPcRequests()
                              setPcApproving(false); setPcApproveId(null)
                            }}>승인</Button>
                          </div>
                        )}
                        {r.status === "approved" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPcActivateId(r.id); setPcActivatePw1(""); setPcActivatePw2(""); setPcActivateMsg(null) }}>
                            비밀번호 설정
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>}

            {/* 계정 ���성화 모달 */}
            {pcActivateId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
                  <h3 className="text-sm font-semibold text-foreground">계정 비��번호 설정</h3>
                  <p className="text-xs text-muted-foreground">사용자에게 전달할 비밀번호를 두 번 입력해 검증합니다.</p>
                  <div className="space-y-2">
                    <Input type="password" placeholder="새 비밀번호" value={pcActivatePw1} onChange={e => setPcActivatePw1(e.target.value)} className="h-9 text-sm" />
                    <Input type="password" placeholder="새 비밀번호 확인" value={pcActivatePw2} onChange={e => setPcActivatePw2(e.target.value)} className="h-9 text-sm" />
                  </div>
                  {pcActivateMsg && <p className={`text-xs ${pcActivateMsg.ok ? "text-primary" : "text-destructive"}`}>{pcActivateMsg.text}</p>}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setPcActivateId(null)}>취소</Button>
                    <Button size="sm" className="flex-1" disabled={pcActivating} onClick={async () => {
                      setPcActivating(true); setPcActivateMsg(null)
                      if (pcActivatePw1 !== pcActivatePw2) { setPcActivateMsg({ text: "비���번호가 일치하지 않습니다.", ok: false }); setPcActivating(false); return }
                      const token = getToken()
                      const res = await fetch("/api/admin/point-charge", {
                        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ requestId: pcActivateId, action: "activate", password1: pcActivatePw1, password2: pcActivatePw2 }),
                      })
                      const d = await res.json()
                      setPcActivateMsg(res.ok ? { text: `활성화됨: ${d.username}`, ok: true } : { text: d.error ?? "오류", ok: false })
                      if (res.ok) { loadPcRequests(); setTimeout(() => setPcActivateId(null), 1500) }
                      setPcActivating(false)
                    }}>확인</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ───────────── 현금/환전 탭 ───────────── */}
        {activeTab === "cash" && (
          <div className="space-y-6">

            {/* ── 지점 전용 요약 카드 + 회원/배팅 ── */}
            {(myRole === "admin" || myRole === "seller") && (
              <div className="space-y-4">
                {/* 마켓 상품 등록 모달 */}
                {showUploadModal && (
                  <MarketItemUploadModal
                    onClose={() => setShowUploadModal(false)}
                    onSuccess={() => {
                      setShowUploadModal(false)
                      // MyMarketItemsPanel이 리스너를 통해 목록을 갱신하도록 이벤트 발생
                      window.dispatchEvent(new Event("market:item:created"))
                    }}
                  />
                )}

                {/* 요약 카드 3개 */}
                <div className="grid grid-cols-3 gap-3">
                  {/* 유저 수 */}
                  <div className="bg-card border border-border rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1">유저 수</p>
                    <p className="text-2xl font-bold text-foreground">{adminMembers.length}<span className="text-sm font-normal text-muted-foreground ml-1">명</span></p>
                    <p className="text-[11px] text-muted-foreground mt-1">현재 잔액 <span className="font-semibold text-foreground">₩{myBalance.toLocaleString()}</span></p>
                  </div>
                  {/* 내 포��트 잔고 */}
                  <div className="bg-card border border-border rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1">내 포인트 잔고</p>
                    <p className="text-2xl font-bold text-foreground">{pointBalance.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">P</span></p>
                    <p className="text-[11px] text-muted-foreground mt-1">총판에서 ��전받은 포인트</p>
                  </div>
                  {/* 수수료 잔고 */}
                  <div className="bg-card border border-border rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1">수수료 잔고</p>
                    <p className="text-2xl font-bold text-amber-500">₩{myCommBalance.toLocaleString()}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">배팅 수수료 누적</p>
                  </div>
                </div>

                {/* 마켓 상품 등록 버튼 */}
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 text-primary text-sm font-semibold transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  마켓 상품 등록
                </button>

                {/* 내 상품 관리 */}
                <MyMarketItemsPanel onUploadNew={() => setShowUploadModal(true)} />

                {/* 충전 요청 */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-primary" /> 충전 요청
                  </h2>
                  <p className="text-xs text-muted-foreground">버튼을 눌러 금액을 누적한 뒤 요청하세요. 총판 승인되면 포인트가 지급됩니다.</p>

                  {/* 금액 프리셋 버튼 */}
                  <div className="flex flex-wrap gap-2">
                    {[50000, 100000, 500000, 1000000, 10000000, 50000000, 100000000].map(amt => (
                      <button
                        key={amt}
                        onClick={() => setBaChargeAmt(v => String((Number(v) || 0) + amt))}
                        className="px-3 py-1.5 rounded-lg border border-border bg-muted hover:bg-primary/10 hover:border-primary/40 text-xs font-semibold text-foreground transition-colors"
                      >
                        +{amt >= 100000000 ? `${amt / 100000000}억` : amt >= 10000000 ? `${amt / 10000000}천만` : `${amt / 10000}만`}
                      </button>
                    ))}
                    <button
                      onClick={() => setBaChargeAmt("")}
                      className="px-3 py-1.5 rounded-lg border border-border bg-muted hover:bg-destructive/10 hover:border-destructive/40 text-xs font-semibold text-muted-foreground transition-colors"
                    >
                      초기화
                    </button>
                  </div>

                  {/* 누적 금액 표시 */}
                  {Number(baChargeAmt) > 0 && (
                    <div className="px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-sm font-bold text-primary">
                      ₩{Number(baChargeAmt).toLocaleString()}
                    </div>
                  )}

                  {/* 직접 입력 + 메모 + 요청 */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="직접 입력 (원)"
                      type="number"
                      value={baChargeAmt}
                      onChange={e => setBaChargeAmt(e.target.value)}
                      className="h-9 text-sm w-40"
                    />
                    <Input
                      placeholder="메모 (선택)"
                      value={baChargeMemo}
                      onChange={e => setBaChargeMemo(e.target.value)}
                      className="h-9 text-sm flex-1"
                    />
                    <Button size="sm" className="h-9 shrink-0 gap-1.5" disabled={baChargeSubmitting || !Number(baChargeAmt)} onClick={async () => {
                      if (!baChargeAmt || Number(baChargeAmt) <= 0) {
                        setBaChargeMsg({ text: "금액을 입력하세요.", ok: false }); return
                      }
                      setBaChargeSubmitting(true); setBaChargeMsg(null)
                      const token = getToken()
                      const res = await fetch("/api/admin/point-purchase", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ cashAmount: Number(baChargeAmt), memo: baChargeMemo }),
                      })
                      const d = await res.json()
                      setBaChargeMsg(res.ok
                        ? { text: "충전 요청이 총판에게 전달됐습니다.", ok: true }
                        : { text: d.error ?? "오류가 발생했습니다.", ok: false })
                      if (res.ok) { setBaChargeAmt(""); setBaChargeMemo("") }
                      setBaChargeSubmitting(false)
                    }}>
                      <Plus className="w-3.5 h-3.5" /> 요청
                    </Button>
                  </div>
                  {baChargeMsg && <p className={`text-xs ${baChargeMsg.ok ? "text-primary" : "text-destructive"}`}>{baChargeMsg.text}</p>}
                </div>

                {/* 대기 중인 환전 펼침 */}
                {branchExExpanded && (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <ArrowLeftRight className="w-4 h-4 text-primary" /> 대기 중인 환전 요청
                        {branchPendingEx > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold">{branchPendingEx}건</span>
                        )}
                      </h3>
                      <Button variant="ghost" size="sm" onClick={loadBranchExReqs} disabled={branchExLoading} className="h-7 w-7 p-0">
                        <RefreshCw className={`w-3.5 h-3.5 ${branchExLoading ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                    {branchExReqs.filter((r: any) => r.status === "pending").length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">대기 중인 환전 요청이 없습니다.</p>
                    ) : (
                      <div className="divide-y divide-border">
                        <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-2 bg-muted/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          <span>유저 / 요청일시</span><span className="text-right">금액</span><span className="text-right">처리</span>
                        </div>
                        {branchExReqs.filter((r: any) => r.status === "pending").map((r: any) => (
                          <div key={r.id} className="px-5 py-3 grid grid-cols-[1fr_auto_auto] gap-4 items-center">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{r.target_user?.username ?? "-"}</p>
                              <p className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString("ko-KR")}</p>
                            </div>
                            <span className="text-sm font-bold text-foreground">₩{r.point_amount?.toLocaleString()}</span>
                            <div className="flex gap-1.5">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-destructive border-destructive/30 hover:bg-destructive/10"
                                onClick={async () => {
                                  const token = getToken()
                                  await fetch("/api/admin/exchange-request", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "reject" }) })
                                  loadBranchExReqs()
                                }}>거절</Button>
                              <Button size="sm" className="h-7 px-3 text-[11px]"
                                onClick={async () => {
                                  const token = getToken()
                                  await fetch("/api/admin/exchange-request", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "complete" }) })
                                  loadBranchExReqs()
                                }}>완료</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 회원 목록 + 배팅 내역 탭 */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  {/* 내부 탭 */}
                  <div className="flex border-b border-border">
                    <button
                      onClick={() => setBranchTab("members")}
                      className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${branchTab === "members" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    >회원 목록 ({adminMembers.length}명)</button>
                    <button
                      onClick={() => { setBranchTab("bets"); if (branchBets.length === 0) loadBranchBets(selectedMember?.id) }}
                      className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${branchTab === "bets" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    >배팅 내역{selectedMember ? ` — ${selectedMember.username}` : ""}</button>
                    <div className="ml-auto flex items-center px-4 gap-2">
                      {selectedMember && (
                        <button onClick={() => { setSelectedMember(null); loadBranchBets(undefined, 1); setBetPage(1) }} className="text-[11px] text-muted-foreground hover:text-foreground">��체 보기</button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => { loadBranchUsers(); loadBranchBets(selectedMember?.id, betPage) }} className="h-7 w-7 p-0">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* 회원 목록 */}
                  {branchTab === "members" && (
                    <div className="divide-y divide-border">
                      {adminMembers.length === 0 && (
                        <p className="py-8 text-center text-sm text-muted-foreground">등록된 회원이 없습니다.</p>
                      )}
                      {/* 헤더 */}
                      {adminMembers.length > 0 && (
                        <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-2 bg-muted/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          <span>회원 ID</span><span className="text-right">잔��</span><span className="text-right">관리</span>
                        </div>
                      )}
                      {adminMembers.map(member => (
                        <div key={member.id} className="px-5 py-3 grid grid-cols-[1fr_auto_auto] gap-4 items-center">
                          <button
                            onClick={() => { setSelectedMember(member); setBranchTab("bets"); setBetPage(1); loadBranchBets(member.id, 1) }}
                            className="text-left"
                          >
                            <p className="text-sm font-semibold text-foreground hover:text-primary transition-colors">{member.username}</p>
                            <p className="text-[10px] text-muted-foreground">클릭하면 배�� 내역 조회</p>
                          </button>
                          <span className="text-sm font-bold text-foreground text-right">₩{(member.balance ?? 0).toLocaleString()}</span>
                          <div className="flex gap-1.5">
                            {/* 충전 버튼 */}
                            <Button size="sm" className="h-7 px-2.5 text-[11px]"
                              onClick={() => { setBranchChargeUserId(member.id); setBranchChargeAmt(""); setBranchChargeMsg(null) }}>
                              충전
                            </Button>
                            {/* 회수 버튼 */}
                            <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => { setBranchChargeUserId(`-${member.id}`); setBranchChargeAmt(""); setBranchChargeMsg(null) }}>
                              회수
                            </Button>
                            {/* 환전 버튼 — 환전 요청 탭으�� 이동 */}
                            <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px]"
                              onClick={() => { setExTargetId(member.username); setBranchTab("members") }}>
                              환전
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 배팅 내역 */}
                  {branchTab === "bets" && (
                    <div>
                      {branchBetsLoading && (
                        <p className="py-8 text-center text-sm text-muted-foreground">불러오�� 중...</p>
                      )}
                      {!branchBetsLoading && branchBets.length === 0 && (
                        <p className="py-8 text-center text-sm text-muted-foreground">배팅 내역이 없습니다.</p>
                      )}
                      {!branchBetsLoading && branchBets.length > 0 && (
                        <>
                          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto_auto] gap-x-3 px-5 py-2 bg-muted/50 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                            <span>날짜</span>
                            <span>회원ID</span>
                            <span className="text-center">배팅번호</span>
                            <span className="text-center">종목</span>
                            <span className="text-center">배팅 위치</span>
                            <span className="text-right">배당</span>
                            <span className="text-center">승패</span>
                            <span className="text-right">결과 ���고</span>
                          </div>
                          <div className="divide-y divide-border">
                            {branchBets.map((b: any) => {
                              const isWin = b.result === "win"
                              const gameLabel = b.game_type === "baccarat" ? "바카라" : b.game_type === "race" ? "레이스" : b.game_type ?? "-"
                              const betTarget = b.bet_direction
                                ? b.bet_direction.startsWith("baccarat_")
                                  ? ({ baccarat_player: "플레이어", baccarat_banker: "뱅커", baccarat_tie: "타이" } as any)[b.bet_direction] ?? b.bet_direction
                                  : b.bet_direction
                                : b.bet_digit ?? b.bet_parity ?? "-"
                              const odds = b.bet_amount > 0
                                ? ((b.payout ?? 0) / b.bet_amount).toFixed(2)
                                : "-"
                              return (
                                <div key={b.id} className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto_auto] gap-x-3 px-5 py-2.5 items-center text-sm ${isWin ? "bg-green-50/30" : ""}`}>
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(b.created_at).toLocaleDateString("ko-KR")}<br />{new Date(b.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
                                  <span className="font-medium text-foreground truncate">{b.username}</span>
                                  <span className="text-center text-xs text-muted-foreground font-mono">{b.round_number}</span>
                                  <span className={`text-center text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${b.game_type === "baccarat" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>{gameLabel}</span>
                                  <span className="text-center text-xs text-foreground">{betTarget}</span>
                                  <span className="text-right text-xs font-bold text-foreground">{odds}x</span>
                                  <span className={`text-center text-[11px] px-1.5 py-0.5 rounded-full font-bold ${isWin ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{isWin ? "승" : "패"}</span>
                                  <div className="text-right">
                                    <p className="text-xs font-bold text-foreground">₩{(b.payout ?? 0).toLocaleString()}</p>
                                    <p className="text-[10px] text-muted-foreground">배팅 ₩{(b.bet_amount ?? 0).toLocaleString()}</p>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          {/* 페이지네이션 */}
                          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
                            <button onClick={() => { const p = Math.max(1, betPage - 1); setBetPage(p); loadBranchBets(selectedMember?.id, p) }} disabled={betPage === 1} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 px-2 py-1">이전</button>
                            <span className="text-xs text-muted-foreground">{betPage} 페이지</span>
                            <button onClick={() => { const p = betPage + 1; setBetPage(p); loadBranchBets(selectedMember?.id, p) }} disabled={branchBets.length < 20} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 px-2 py-1">다음</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 충전/회수 인라인 모달 */}
                {branchChargeUserId && (() => {
                  const isWithdraw = branchChargeUserId.startsWith("-")
                  const uid = isWithdraw ? branchChargeUserId.slice(1) : branchChargeUserId
                  const member = adminMembers.find(m => m.id === uid)
                  return (
                    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        {member?.username} — {isWithdraw ? "포인트 회수" : "포인트 충전"}
                      </h3>
                      <p className="text-xs text-muted-foreground">현재 잔고: ₩{(member?.balance ?? 0).toLocaleString()}</p>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="금��� 입력"
                          value={branchChargeAmt}
                          onChange={e => setBranchChargeAmt(e.target.value)}
                          className="h-9 text-sm flex-1"
                        />
                        <Button
                          size="sm"
                          disabled={branchChargeLoading}
                          variant={isWithdraw ? "outline" : "default"}
                          className={isWithdraw ? "h-9 text-destructive border-destructive/30 hover:bg-destructive/10" : "h-9"}
                          onClick={async () => {
                            setBranchChargeLoading(true); setBranchChargeMsg(null)
                            const token = getToken()
                            const amt = parseInt(branchChargeAmt)
                            if (!branchChargeAmt || isNaN(amt) || amt <= 0) {
                              setBranchChargeMsg({ text: "올바른 금액을 입력하세요.", ok: false })
                              setBranchChargeLoading(false); return
                            }
                            const res = await fetch("/api/admin/charge", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                              body: JSON.stringify({ userId: uid, amount: isWithdraw ? -amt : amt }),
                            })
                            const d = await res.json()
                            setBranchChargeMsg(res.ok ? { text: `${isWithdraw ? "회수" : "충전"} 완료`, ok: true } : { text: d.error ?? "오��", ok: false })
                            if (res.ok) { setBranchChargeAmt(""); loadBranchUsers() }
                            setBranchChargeLoading(false)
                          }}
                        >{branchChargeLoading ? "처리중..." : isWithdraw ? "회수" : "충전"}</Button>
                        <Button size="sm" variant="ghost" className="h-9" onClick={() => { setBranchChargeUserId(null); setBranchChargeMsg(null) }}>취소</Button>
                      </div>
                      {branchChargeMsg && (
                        <p className={`text-xs ${branchChargeMsg.ok ? "text-primary" : "text-destructive"}`}>{branchChargeMsg.text}</p>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* 내 잔고 요약 — admin(지점)은 위 전용 UI만 사용, 아래는 숨김 */}
            {myRole !== "admin" && <>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">내 현금 잔고</p>
                <p className="text-2xl font-bold text-foreground">₩{cashBalance.toLocaleString()}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">��� 포인트 잔고</p>
                <p className="text-2xl font-bold text-foreground">{pointBalance.toLocaleString()} P</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">수수료 잔고</p>
                <p className="text-2xl font-bold text-amber-500">₩{myCommBalance.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground mt-1">배팅 수수료 누적</p>
              </div>
            </div>

            {/* 하위 ��할 ��고 현황 (master/super_admin만) */}
            {isSuperAdmin && subBalances.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">하위 계정 ��고 현황</h2>
                  <Button variant="ghost" size="sm" onClick={loadCash} disabled={cashLoading} className="text-xs gap-1.5">
                    <RefreshCw className={`w-3.5 h-3.5 ${cashLoading ? "animate-spin" : ""}`} /> 새로고침
                  </Button>
                </div>
                <div className="divide-y divide-border">
                  {subBalances.map((s: any) => (
                    <div key={s.userId} className="px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{s.username}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleLabel[s.role]?.color ?? "bg-gray-100 text-gray-600"}`}>{roleLabel[s.role]?.label ?? s.role}</span>
                      </div>
                      <div className="flex gap-4 text-right text-xs">
                        <div><p className="text-muted-foreground">현금</p><p className="font-semibold text-foreground">₩{s.cashAmount.toLocaleString()}</p></div>
                        <div><p className="text-muted-foreground">포인트</p><p className="font-semibold text-foreground">{s.pointAmount.toLocaleString()} P</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 환전 요청 생성 */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-primary" /> 환전 요청</h2>
              <p className="text-xs text-muted-foreground">유�� 아이��와 환전할 포인트를 입력하면 대총판/마스��가 ���인합니다. 승인 시 해당 포인트가 차감됩니다.</p>
              <div className="flex gap-2 flex-wrap">
                <Input placeholder="유저 아이디" value={exTargetId} onChange={e => setExTargetId(e.target.value)} className="h-9 text-sm w-40" />
                <Input placeholder="포인트 금액" type="number" value={exPointAmt} onChange={e => setExPointAmt(e.target.value)} className="h-9 text-sm w-36" />
                <Input placeholder="메모 (선택)" value={exMemo} onChange={e => setExMemo(e.target.value)} className="h-9 text-sm flex-1" />
                <Button size="sm" className="h-9 shrink-0" disabled={exSubmitting} onClick={async () => {
                  setExSubmitting(true); setExMsg(null)
                  const token = getToken()
                  const res = await fetch("/api/admin/exchange-request", {
                    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ targetUsername: exTargetId, pointAmount: Number(exPointAmt), memo: exMemo }),
                  })
                  const d = await res.json()
                  setExMsg(res.ok ? { text: "환전 요청됐습니다.", ok: true } : { text: d.error ?? "오류", ok: false })
                  if (res.ok) { setExTargetId(""); setExPointAmt(""); setExMemo(""); loadExRequests() }
                  setExSubmitting(false)
                }}>요청</Button>
              </div>
              {exMsg && <p className={`text-xs ${exMsg.ok ? "text-primary" : "text-destructive"}`}>{exMsg.text}</p>}
            </div>

            {/* 환전 요청 목록 */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">환전 요청 목록</h2>
                <Button variant="ghost" size="sm" onClick={loadExRequests} disabled={exLoading} className="text-xs gap-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${exLoading ? "animate-spin" : ""}`} /> 새로��침
                </Button>
              </div>
              <div className="divide-y divide-border">
                {exRequests.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">���청이 없습니다.</p>}
                {exRequests.map((r: any) => (
                  <div key={r.id} className="px-5 py-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{r.target_user?.username}</span>
                        <span className="text-xs font-semibold text-foreground">{r.point_amount?.toLocaleString()} P</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${r.status === "approved" ? "bg-green-100 text-green-700" : r.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {r.status === "pending" ? "대기" : r.status === "approved" ? "완료" : "거��"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">요청자: {r.requester?.username} {r.memo ? `· ${r.memo}` : ""}</p>
                      <p className="text-[10px] text-muted-foreground/60">{new Date(r.created_at).toLocaleString("ko-KR")}</p>
                    </div>
                    {isSuperAdmin && r.status === "pending" && (
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" className="h-8 text-xs text-destructive border-destructive/30" onClick={async () => {
                          const token = getToken()
                          await fetch("/api/admin/exchange-request", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "reject" }) })
                          loadExRequests()
                        }}>거절</Button>
                        <Button size="sm" className="h-8 text-xs" disabled={exApproving && exApproveId === r.id} onClick={async () => {
                          setExApproveId(r.id); setExApproving(true)
                          const token = getToken()
                          const res = await fetch("/api/admin/exchange-request", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "approve" }) })
                          const d = await res.json()
                          setExApproveMsg(res.ok ? { text: "승인됨", ok: true } : { text: d.error ?? "오류", ok: false })
                          if (res.ok) loadExRequests()
                          setExApproving(false); setExApproveId(null)
                        }}>승인</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {exApproveMsg && <p className={`text-xs text-center ${exApproveMsg.ok ? "text-primary" : "text-destructive"}`}>{exApproveMsg.text}</p>}

            {/* ���밀번호 초기화 요청 */}
            {["branch_admin", "admin"].includes(myRole) && (
              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><KeyRound className="w-4 h-4 text-primary" /> 비밀번호 초기화 ��청</h2>
                <div className="flex gap-2">
                  <Input placeholder="유저 아이디" value={prTargetId} onChange={e => setPrTargetId(e.target.value)} className="h-9 text-sm flex-1" />
                  <Button size="sm" className="h-9 shrink-0" disabled={prSubmitting} onClick={async () => {
                    setPrSubmitting(true); setPrMsg(null)
                    const token = getToken()
                    const res = await fetch("/api/admin/password-reset", {
                      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ targetUsername: prTargetId }),
                    })
                    const d = await res.json()
                    setPrMsg(res.ok ? { text: "초기화 요청됐습니다.", ok: true } : { text: d.error ?? "오류", ok: false })
                    if (res.ok) { setPrTargetId(""); loadPrRequests() }
                    setPrSubmitting(false)
                  }}>요청</Button>
                </div>
                {prMsg && <p className={`text-xs ${prMsg.ok ? "text-primary" : "text-destructive"}`}>{prMsg.text}</p>}
              </div>
            )}

            {/* 비밀번호 초기화 목록 (super/master만) */}
            {isSuperAdmin && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">비밀번호 초기화 요청 목록</h2>
                  <Button variant="ghost" size="sm" onClick={loadPrRequests} disabled={prLoading} className="text-xs gap-1.5">
                    <RefreshCw className={`w-3.5 h-3.5 ${prLoading ? "animate-spin" : ""}`} /> 새로고침
                  </Button>
                </div>
                <div className="divide-y divide-border">
                  {prRequests.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">요청이 없습��다.</p>}
                  {prRequests.map((r: any) => (
                    <div key={r.id} className="px-5 py-4 flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{r.target_user?.username}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${r.status === "approved" ? "bg-green-100 text-green-700" : r.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                            {r.status === "pending" ? "대기" : r.status === "approved" ? "���료" : "거절"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">요청자: {r.requester?.username}</p>
                      </div>
                      {r.status === "pending" && (
                        <div className="flex gap-1.5 shrink-0">
                          <Button size="sm" variant="outline" className="h-8 text-xs text-destructive border-destructive/30" onClick={async () => {
                            const token = getToken()
                            await fetch("/api/admin/password-reset", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "reject" }) })
                            loadPrRequests()
                          }}>거절</Button>
                          <Button size="sm" className="h-8 text-xs" onClick={() => { setPrApproveId(r.id); setPrNewPw(""); setPrApproveMsg(null) }}>승인</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 비밀번호 초��화 승인 모달 */}
            {prApproveId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
                  <h3 className="text-sm font-semibold text-foreground">비밀번호 초기화 승인</h3>
                  <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 space-y-1">
                    <p className="text-xs text-muted-foreground">초기화 후 임시 비밀번호</p>
                    <p className="text-lg font-bold tracking-widest text-foreground">000000</p>
                    <p className="text-xs text-muted-foreground">유저는 로그인 시 반드시 새 비밀번호로 변경해야 합니다.</p>
                  </div>
                  {prApproveMsg && <p className={`text-xs ${prApproveMsg.ok ? "text-primary" : "text-destructive"}`}>{prApproveMsg.text}</p>}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setPrApproveId(null)}>���소</Button>
                    <Button size="sm" className="flex-1" disabled={prApproving} onClick={async () => {
                      setPrApproving(true); setPrApproveMsg(null)
                      const token = getToken()
                      const res = await fetch("/api/admin/password-reset", {
                        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ requestId: prApproveId }),
                      })
                      const d = await res.json()
                      setPrApproveMsg(res.ok ? { text: "000000으로 초기화 완료", ok: true } : { text: d.error ?? "오류", ok: false })
                      if (res.ok) { loadPrRequests(); setTimeout(() => setPrApproveId(null), 1500) }
                      setPrApproving(false)
                    }}>확인</Button>
                  </div>
                </div>
              </div>
            )}

            {/* 현금 거래 이력 */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">현금 거래 이력</h2>
                <Button variant="ghost" size="sm" onClick={loadCash} disabled={cashLoading} className="text-xs gap-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${cashLoading ? "animate-spin" : ""}`} /> 새로고침
                </Button>
              </div>
              <div className="divide-y divide-border">
                {cashTxns.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">거래 이력이 없습니다.</p>}
                {cashTxns.map((t: any) => (
                  <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {t.from_user?.username} → {t.to_user?.username}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{t.tx_type}</span>
                      </div>
                      {t.memo && <p className="text-xs text-muted-foreground mt-0.5">{t.memo}</p>}
                      <p className="text-[10px] text-muted-foreground/60">{new Date(t.created_at).toLocaleString("ko-KR")}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-foreground">₩{t.cash_amount?.toLocaleString()}</p>
                      {t.point_amount > 0 && <p className="text-xs text-muted-foreground">{t.point_amount?.toLocaleString()} P</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* admin(지점) 공통 섹션 숨김 닫기 */}
            </>}
          </div>
        )}

        {/* ────��──────── 매출 달력 탭 ───────────── */}
        {activeTab === "calendar" && (
          <div className="space-y-6">

            {/* 연월 + 지점 필터 */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => {
                  const d = new Date(calYear, calMonth - 2); setCalYear(d.getFullYear()); setCalMonth(d.getMonth() + 1)
                  loadCalendar(d.getFullYear(), d.getMonth() + 1, calBranchFilter || undefined)
                }}>{'<'}</Button>
                <span className="text-sm font-semibold text-foreground w-24 text-center">{calYear}년 {calMonth}월</span>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => {
                  const d = new Date(calYear, calMonth); setCalYear(d.getFullYear()); setCalMonth(d.getMonth() + 1)
                  loadCalendar(d.getFullYear(), d.getMonth() + 1, calBranchFilter || undefined)
                }}>{'>'}</Button>
              </div>
              {isSuperAdmin && (
                <Input placeholder="지점코드 필터" value={calBranchFilter} onChange={e => setCalBranchFilter(e.target.value)} className="h-8 text-sm w-36" />
              )}
              <Button size="sm" className="h-8 text-xs" onClick={() => { setCalSelectedDate(null); setMemberDetail(null); loadCalendar(calYear, calMonth, calBranchFilter || undefined) }}>
                {calLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "조회"}
              </Button>
            </div>

            {/* 달력 그리드 */}
            {(() => {
              const daysInMonth = new Date(calYear, calMonth, 0).getDate()
              const firstDay = new Date(calYear, calMonth - 1, 1).getDay()
              const dataMap: Record<string, any> = {}
              for (const row of calData) {
                const day = String(new Date(row.log_date).getDate())
                if (!dataMap[day]) dataMap[day] = { charge: 0, exchange: 0, net: 0 }
                dataMap[day].charge += row.charge_total
                dataMap[day].exchange += row.exchange_total
                dataMap[day].net += row.net_total
              }
              const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
              return (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="grid grid-cols-7 border-b border-border">
                    {["��", "월", "화", "수", "목", "금", "토"].map(d => (
                      <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {cells.map((day, i) => {
                      if (!day) return <div key={`empty-${i}`} className="h-20 border-b border-r border-border last:border-r-0" />
                      const dateStr = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                      const d = dataMap[String(day)]
                      const isSelected = calSelectedDate === dateStr
                      const isToday = new Date().toISOString().slice(0, 10) === dateStr
                      return (
                        <button key={day} onClick={() => {
                          setCalSelectedDate(dateStr); setMemberDetail(null); setExpandedUser(null)
                          loadCalendar(calYear, calMonth, calBranchFilter || undefined, dateStr)
                        }}
                          className={`h-20 p-1.5 border-b border-r border-border last:border-r-0 text-left transition-colors hover:bg-secondary/50 ${isSelected ? "bg-primary/10 border-primary/30" : ""}`}
                        >
                          <span className={`text-xs font-medium ${isToday ? "w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center" : "text-foreground"}`}>{day}</span>
                          {d && (
                            <div className="mt-1 space-y-0.5">
                              <p className="text-[9px] text-emerald-600 font-medium">+{(d.charge / 10000).toFixed(0)}��</p>
                              {d.exchange > 0 && <p className="text-[9px] text-red-500">-{(d.exchange / 10000).toFixed(0)}만</p>}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {/* 월 합계 */}
                  <div className="px-5 py-3 border-t border-border bg-muted/30 flex gap-6 text-sm">
                    <span className="text-muted-foreground">월 합계</span>
                    <span className="text-emerald-600 font-semibold">충전 +{calData.reduce((s, r) => s + r.charge_total, 0).toLocaleString()}</span>
                    <span className="text-red-500 font-semibold">��전 -{calData.reduce((s, r) => s + r.exchange_total, 0).toLocaleString()}</span>
                    <span className="font-bold text-foreground">���이익 {calData.reduce((s, r) => s + r.net_total, 0).toLocaleString()}</span>
                  </div>
                </div>
              )
            })()}

            {/* 날짜 클릭 시 회원 상세 */}
            {calSelectedDate && memberDetail && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">{calSelectedDate} 지점별 회원 상���</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{memberDetail.branch} · {memberDetail.members?.length ?? 0}명</p>
                </div>

                {/* 랭킹 */}
                {memberDetail.members?.length > 0 && (
                  <div className="px-5 py-3 border-b border-border bg-muted/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                      <span className="text-xs font-semibold text-foreground">배팅 랭킹</span>
                    </div>
                    <div className="space-y-1">
                      {memberDetail.members.slice(0, 5).map((m: any, idx: number) => (
                        <div key={m.userId} className="flex items-center gap-3 text-xs">
                          <span className={`w-4 text-center font-bold ${idx === 0 ? "text-yellow-500" : idx === 1 ? "text-gray-400" : idx === 2 ? "text-amber-600" : "text-muted-foreground"}`}>{idx + 1}</span>
                          <span className="flex-1 font-medium text-foreground">{m.username}</span>
                          <span className="text-muted-foreground">{m.totalBets}게임</span>
                          <span className="font-semibold text-foreground">{m.totalWagered.toLocaleString()} P</span>
                          <span className={`font-medium ${m.totalProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{m.totalProfit >= 0 ? "+" : ""}{m.totalProfit.toLocaleString()}</span>
                          <span className="text-muted-foreground">{m.winRate}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 회원별 상세 */}
                <div className="divide-y divide-border">
                  {(memberDetail.members ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">게임 기록이 없습니다.</p>}
                  {(memberDetail.members ?? []).map((m: any) => (
                    <div key={m.userId}>
                      <button className="w-full px-5 py-4 flex items-center justify-between hover:bg-secondary/40 transition-colors" onClick={() => setExpandedUser(expandedUser === m.userId ? null : m.userId)}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-semibold text-primary">{m.username.charAt(0)}</span>
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-medium text-foreground">{m.username}</p>
                            <p className="text-xs text-muted-foreground">충전 {m.chargeAmount.toLocaleString()} P · {m.totalBets}게임 · 승률 {m.winRate}%</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">총배팅</p>
                            <p className="text-sm font-semibold text-foreground">{m.totalWagered.toLocaleString()} P</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">수익</p>
                            <p className={`text-sm font-semibold ${m.totalProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{m.totalProfit >= 0 ? "+" : ""}{m.totalProfit.toLocaleString()}</p>
                          </div>
                          {expandedUser === m.userId ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </button>

                      {/* 베팅 상세 */}
                      {expandedUser === m.userId && (
                        <div className="px-5 pb-4 bg-muted/20">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-border text-muted-foreground">
                                  <th className="py-2 text-left font-medium">라운드</th>
                                  <th className="py-2 text-left font-medium">게임</th>
                                  <th className="py-2 text-left font-medium">배팅</th>
                                  <th className="py-2 text-right font-medium">배팅��</th>
                                  <th className="py-2 text-right font-medium">배당</th>
                                  <th className="py-2 text-right font-medium">결과</th>
                                  <th className="py-2 text-right font-medium">수익</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {m.bets.map((b: any, bi: number) => (
                                  <tr key={bi} className="text-foreground">
                                    <td className="py-1.5 font-mono text-[10px] text-muted-foreground">{b.round_id}</td>
                                    <td className="py-1.5">{b.game === "baka" ? "바카라" : "레이스"}</td>
                                    <td className="py-1.5">{b.bet_side ?? b.bet_position}</td>
                                    <td className="py-1.5 text-right">{b.amount?.toLocaleString()}</td>
                                    <td className="py-1.5 text-right">{b.payout_multiplier?.toFixed(2)}x</td>
                                    <td className="py-1.5 text-right">
                                      <span className={`px-1.5 py-0.5 rounded-full font-medium ${b.result === "win" ? "bg-emerald-100 text-emerald-700" : b.result === "lose" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                                        {b.result === "win" ? "승" : b.result === "lose" ? "패" : b.result ?? "-"}
                                      </span>
                                    </td>
                                    <td className={`py-1.5 text-right font-semibold ${(b.profit ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                      {(b.profit ?? 0) >= 0 ? "+" : ""}{b.profit?.toLocaleString() ?? 0}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 계정 생성 탭 (master 전용) */}
        {activeTab === "accounts" && myRole === "master" && (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> 관리자 계정 생성
              </h2>
              <p className="text-xs text-muted-foreground mb-5">
                대총판 · 총판 · 지�� 계정을 직접 생성합니다. 생성 후 해당 계정으�� 로그인하면 각 역할에 맞는 탭이 표시됩니다.
              </p>

              {/* 역할 선택 */}
              <div className="mb-5">
                <p className="text-xs font-medium text-foreground mb-2">역할 선택</p>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { value: "super_admin", label: "대총판", desc: "포인트 구매 요청 승인, 총판 잔고 관리", color: "border-red-200 bg-red-50 text-red-700" },
                    { value: "branch_admin", label: "총판", desc: "지점 생성, 지점에 포인트 분배", color: "border-blue-200 bg-blue-50 text-blue-700" },
                    { value: "admin", label: "지점", desc: "유저 관리, 환전 요청 처리", color: "border-orange-200 bg-orange-50 text-orange-700" },
                  ] as const).map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setAcRole(r.value)}
                      className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                        acRole === r.value
                          ? r.color + " ring-2 ring-offset-1 ring-primary"
                          : "border-border bg-card hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold">{r.label}</span>
                        {acRole === r.value && (
                          <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-white" />
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{r.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* 입력 필드 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <p className="text-xs font-medium text-foreground mb-1.5">아이디</p>
                  <Input
                    placeholder="사용할 아이디 입력"
                    value={acUsername}
                    onChange={e => setAcUsername(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground mb-1.5">비밀번호</p>
                  <Input
                    type="password"
                    placeholder="초기 비밀번호 설정"
                    value={acPassword}
                    onChange={e => setAcPassword(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <div className="mb-4">
                <p className="text-xs font-medium text-foreground mb-1.5">메모 (선택)</p>
                <Input
                  placeholder="예: 역삼1 담당, 홍길동"
                  value={acMemo}
                  onChange={e => setAcMemo(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              {acMsg && (
                <p className={`text-xs mb-3 ${acMsg.ok ? "text-primary" : "text-destructive"}`}>{acMsg.text}</p>
              )}

              <Button
                onClick={handleCreateAccount}
                disabled={acSubmitting || !acUsername.trim() || !acPassword.trim()}
                className="gap-1.5 text-sm"
              >
                <Plus className="w-4 h-4" />
                {acSubmitting ? "생성 중..." : `${acRole === "super_admin" ? "대총판" : acRole === "branch_admin" ? "총판" : "지점"} 계정 생성`}
              </Button>
            </div>

            {/* 현재 관리자 계정 목록 */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">관리자 계정 목록</h3>
              </div>
              <div className="divide-y divide-border">
                {users.filter(u => ["super_admin", "branch_admin", "admin"].includes(u.role)).length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">생성�� 관리자 계정이 없습니다.</p>
                ) : (
                  users
                    .filter(u => ["super_admin", "branch_admin", "admin"].includes(u.role))
                    .map(u => {
                      const rl = roleLabel[u.role]
                      return (
                        <div key={u.id} className="px-5 py-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-xs font-semibold text-primary">{u.username.charAt(0)}</span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground">{u.username}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${rl.color}`}>{rl.label}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">{formatDate(u.created_at)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <p className="text-sm font-semibold text-foreground">{formatBalance(u.balance)}</p>
                            <button
                              onClick={() => handleDeleteAccount(u.id, u.username)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> 삭제
                            </button>
                          </div>
                        </div>
                      )
                    })
                )}
              </div>
            </div>
          </div>
        )}

        {/* 카드 관리 탭 (master 전용) */}
        {activeTab === "cards" && myRole === "master" && (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground mb-1">카드 이미지 관리</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    업로드한 이미지는 순번 순서대로 카드 배경으로 사용됩니다.<br />
                    각 라운드에서 순번 기반으로 하나가 ��택되어 카��에 오버레이됩니다.<br />
                    JPG, PNG, WebP 파일을 지원합니다.
                  </p>
                </div>
                <div className="shrink-0">
                  <input ref={cardFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleCardUpload} />
                  <Button onClick={() => cardFileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    {uploading ? "업로드 중..." : "이미지 추��"}
                  </Button>
                </div>
              </div>
              {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                <ImageIcon className="w-3.5 h-3.5" />
                <span>현재 등록된 이미지: <strong className="text-foreground">{cardImages.length}장</strong></span>
              </div>
            </div>
            {cardLoading ? (
              <div className="py-16 text-center text-muted-foreground text-sm">불러오는 중...</div>
            ) : cardImages.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-xl py-20 text-center">
                <ImageIcon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">업로드된 카드 이미지가 없습니다.</p>
                <p className="text-xs text-muted-foreground mt-1">위��� &quot;이미지 추가&quot; ��튼으로 업로���하세요.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {cardImages.map((img, idx) => (
                  <div key={img.pathname} className="group relative bg-card border border-border rounded-xl overflow-hidden aspect-[3/4]">
                    <div className="absolute top-2 left-2 z-10 bg-black/70 text-white text-xs font-bold px-2 py-0.5 rounded-full">#{idx + 1}</div>
                    <img src={img.url} alt={`카드 이��지 #${idx + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => handleCardDelete(img.url)}
                        className="flex items-center gap-1.5 bg-destructive text-destructive-foreground text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-destructive/90 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> 삭제
                      </button>
                    </div>
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2">
                      <p className="text-white text-xs truncate">{img.pathname.split("/").pop()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 손익 탭 */}
        {activeTab === "pnl" && isSuperAdmin && (
          <div>
            {/* 기간 필터 */}
            <div className="flex items-center gap-2 mb-6">
              {(["all", "month", "last_month"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPnlPeriod(p); loadPnl(p) }}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    pnlPeriod === p
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p === "all" ? "전체" : p === "month" ? "이번���" : "지난달"}
                </button>
              ))}
              <button
                onClick={() => loadPnl(pnlPeriod)}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${pnlLoading ? "animate-spin" : ""}`} /> 새로고침
              </button>
            </div>

            {pnlLoading ? (
              <div className="py-20 flex justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
              </div>
            ) : pnlData ? (
              <>
                {/* 요약 카드 4개 */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-card border border-border rounded-xl p-5">
                    <p className="text-xs text-muted-foreground mb-1">요율 차익</p>
                    <p className="text-xs text-muted-foreground mb-2">현금 입금 → 포인트 발급 차이</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      +{formatBalance(pnlData.rate_profit)}
                    </p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-5">
                    <p className="text-xs text-muted-foreground mb-1">수수료 누적</p>
                    <p className="text-xs text-muted-foreground mb-2">산하 지점 게임 수수료</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      +{formatBalance(pnlData.fee_total)}
                    </p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-5">
                    <p className="text-xs text-muted-foreground mb-1">환전 지급</p>
                    <p className="text-xs text-muted-foreground mb-2">유저 환전 요청 승인 합산</p>
                    <p className="text-2xl font-bold text-red-500">
                      -{formatBalance(pnlData.exchange_payout)}
                    </p>
                  </div>
                  <div className={`border rounded-xl p-5 ${pnlData.net_pnl >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                    <p className="text-xs text-muted-foreground mb-1">순 손��</p>
                    <p className="text-xs text-muted-foreground mb-2">요율차익 + 수수료 - 환전</p>
                    <p className={`text-2xl font-bold ${pnlData.net_pnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {pnlData.net_pnl >= 0 ? "+" : ""}{formatBalance(pnlData.net_pnl)}
                    </p>
                  </div>
                </div>

                {/* 잔고 현황 */}
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4">현재 잔고 현황</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">게임 포인트 잔고</p>
                      <p className="text-lg font-bold text-foreground">{formatBalance(pnlData.balance)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">현금 잔고</p>
                      <p className="text-lg font-bold text-foreground">{formatBalance(pnlData.cash_balance)}</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">누적 수익 대비 현재 잔고</p>
                      <p className={`text-sm font-semibold ${
                        pnlData.balance >= pnlData.net_pnl ? "text-emerald-600" : "text-amber-500"
                      }`}>
                        {pnlData.net_pnl > 0
                          ? `수익의 ${Math.round((pnlData.balance / pnlData.net_pnl) * 100)}% 보유 중`
                          : "손실 구간"}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-20 text-center text-sm text-muted-foreground">
                데이터를 불러올 수 없습니다.
              </div>
            )}
          </div>
        )}

        {/* ── 수수료 설정 탭 (master 전용) ── */}
        {activeTab === "commission" && myRole === "master" && (() => {
          const ROLE_LABELS: Record<string, string> = {
            master:       "마스터",
            super_admin:  "대총판",
            branch_admin: "총판",
            admin:        "지점",
          }
          const totalRate = commRates.reduce((s, r) => s + r.rate, 0)
          const editing = commEditing

          const handleChange = (role: string, val: string) => {
            setCommEditing(prev => ({ ...prev, [role]: val }))
          }

          const handleSave = async () => {
            setCommSaving(true); setCommMsg(null)
            const token = getToken()
            const rates = commRates.map(r => ({
              role: r.role,
              rate: parseFloat(editing[r.role] ?? String(r.rate * 100)) / 100,
            }))
            const res = await fetch("/api/admin/commission-rates", {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ rates }),
            })
            const d = await res.json()
            if (res.ok) {
              setCommMsg({ text: `저장 완료. 총 수수료: ${(d.totalRate * 100).toFixed(1)}%`, ok: true })
              loadCommRates()
              setCommEditing({})
            } else {
              setCommMsg({ text: d.error ?? "저장 ��패", ok: false })
            }
            setCommSaving(false)
          }

          return (
            <div className="space-y-6 max-w-lg">
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Percent className="w-4 h-4 text-primary" />
                  <h2 className="text-base font-semibold text-foreground">배팅 수수료 요율 설정</h2>
                </div>
                <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                  유저가 배팅한 금액에 대해 각 역할에 지급되는 수수료 비율입니다.<br />
                  합계가 100%를 초과할 수 없으며, 나머지는 배당 풀로 사용됩니다.
                </p>

                <div className="space-y-3">
                  {["master", "super_admin", "branch_admin", "admin"].map(role => {
                    const current = commRates.find(r => r.role === role)?.rate ?? 0
                    const inputVal = editing[role] ?? String((current * 100).toFixed(1))
                    return (
                      <div key={role} className="flex items-center justify-between gap-4 bg-muted/40 rounded-xl px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{ROLE_LABELS[role]}</p>
                          <p className="text-[11px] text-muted-foreground">현재 {(current * 100).toFixed(1)}%</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={inputVal}
                            onChange={e => handleChange(role, e.target.value)}
                            className="w-24 h-9 text-sm text-right"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* 합계 표시 */}
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    입력 합계:{" "}
                    <span className={`font-bold ${
                      Object.keys(commEditing).length > 0
                        ? Object.values(commEditing).reduce((s, v) => s + (parseFloat(v) || 0), 0) > 100
                          ? "text-destructive"
                          : "text-primary"
                        : "text-foreground"
                    }`}>
                      {Object.keys(commEditing).length > 0
                        ? Object.values(commEditing).reduce((s, v) => s + (parseFloat(v) || 0), 0).toFixed(1)
                        : (totalRate * 100).toFixed(1)
                      }%
                    </span>
                    <span className="text-muted-foreground"> / 배당 풀: </span>
                    <span className="font-medium text-foreground">
                      {Object.keys(commEditing).length > 0
                        ? Math.max(0, 100 - Object.values(commEditing).reduce((s, v) => s + (parseFloat(v) || 0), 0)).toFixed(1)
                        : (100 - totalRate * 100).toFixed(1)
                      }%
                    </span>
                  </p>
                  <Button size="sm" onClick={handleSave} disabled={commSaving} className="px-5">
                    {commSaving ? "저장 중..." : "저장"}
                  </Button>
                </div>

                {commMsg && (
                  <p className={`mt-3 text-xs ${commMsg.ok ? "text-primary" : "text-destructive"}`}>{commMsg.text}</p>
                )}
              </div>

              {/* 내 수수료 잔�� */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground">내 수수료 잔고</h3>
                  <Button variant="ghost" size="sm" onClick={loadMyCommBalance} className="h-7 w-7 p-0">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-3xl font-bold text-primary">₩{myCommBalance.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">유저 배팅액에서 마스터 요율만큼 누적된 수수료</p>
              </div>
            </div>
          )
        })()}

        {/* ── 글쓰기 신청 탭 (master 전용) ── */}
        {activeTab === "write_requests" && myRole === "master" && (
          <WriteRequestsPanel token={adminPw} />
        )}

        {activeTab === "market" && myRole === "master" && (
          <div className="p-4">
            <MarketMasterPanel />
          </div>
        )}

        {/* ── 충전 웹훅 탭 (master 전용) ── */}
        {activeTab === "pay_webhook" && myRole === "master" && (
          <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

            {/* 섹션 1: 웹훅 설정 */}
            <div className="rounded-2xl border border-border bg-secondary/20 p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-foreground">외부 웹훅 설정</p>
              <p className="text-xs text-muted-foreground">충전 신청 시 dissig.com 등 외부 서버로 전송되는 웹훅을 설정합니다.</p>
              <input type="text" value={pwWebhookUrl} onChange={e => setPwWebhookUrl(e.target.value)}
                placeholder="웹훅 URL (예: https://www.dissig.com/api/webhooks/order)"
                className="h-10 px-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <input type="text" value={pwWebhookSecret} onChange={e => setPwWebhookSecret(e.target.value)}
                placeholder="x-webhook-secret 헤더 값"
                className="h-10 px-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <input type="text" value={pwSiteId} onChange={e => setPwSiteId(e.target.value)}
                placeholder="siteId 필드 값 (payload에 포함)"
                className="h-10 px-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <p className="text-xs text-muted-foreground font-medium mt-1">유저 텔레그램 메시지 인라인 버튼</p>
              <input type="text" value={pwBtnText} onChange={e => setPwBtnText(e.target.value)}
                placeholder="버튼 텍스트 (예: 충전 확인하기)"
                className="h-10 px-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <input type="text" value={pwBtnUrl} onChange={e => setPwBtnUrl(e.target.value)}
                placeholder="버튼 URL (예: https://coinrace.live)"
                className="h-10 px-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              {pwSaveMsg && <p className="text-xs text-green-400">{pwSaveMsg}</p>}
              <button disabled={pwSaving} onClick={async () => {
                setPwSaving(true); setPwSaveMsg("")
                try {
                  const res = await fetch("/api/pay-master-settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ webhookUrl: pwWebhookUrl, webhookSecret: pwWebhookSecret, siteId: pwSiteId, tgBtnText: pwBtnText, tgBtnUrl: pwBtnUrl }),
                  })
                  setPwSaveMsg(res.ok ? "저장되었습니다." : "저장 실패")
                } catch { setPwSaveMsg("오류 발생") }
                setPwSaving(false)
              }} className="h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50">
                {pwSaving ? "저장 중..." : "저장"}
              </button>
            </div>

            {/* 섹션 2: 웹훅 테스트 */}
            <div className="rounded-2xl border border-border bg-secondary/20 p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-foreground">웹훅 테스트</p>
              <p className="text-xs text-muted-foreground">위 URL로 테스트 payload를 전송하고 응답을 확인합니다. 비워두면 기본 payload가 자동 생성됩니다.</p>
              <textarea value={pwTestPayload} onChange={e => setPwTestPayload(e.target.value)}
                placeholder={`{\n  "applyNo": "TEST-...",\n  "siteId": "${pwSiteId || "your-site-id"}",\n  "amount": "10000",\n  "telegram": "@test_user",\n  "chain": "TRX",\n  "walletAddress": "TR7NHq..."\n}`}
                rows={7}
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
              <button disabled={pwTestLoading || !pwWebhookUrl.trim()} onClick={async () => {
                setPwTestLoading(true); setPwTestResult(null)
                try {
                  const payload = pwTestPayload.trim() ? JSON.parse(pwTestPayload) : {
                    applyNo: "TEST-" + Date.now(),
                    siteId:  pwSiteId || "test-site",
                    amount:  "10000",
                    telegram: "@test_user",
                    applyAt: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
                    walletAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
                    chain:   "TRX",
                  }
                  const res  = await fetch("/api/pay-webhook-test", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: pwWebhookUrl, payload, secret: pwWebhookSecret }),
                  })
                  const d = await res.json()
                  setPwTestResult({ ok: d.ok, status: d.status, body: d.body })
                } catch (e) { setPwTestResult({ ok: false, status: 0, body: String(e) }) }
                setPwTestLoading(false)
              }} className="h-10 rounded-xl border border-border bg-secondary text-foreground font-semibold text-sm disabled:opacity-50 hover:bg-secondary/80 transition-colors">
                {pwTestLoading ? "전송 중..." : "테스트 전송"}
              </button>
              {pwTestResult && (
                <div className={`rounded-xl border p-3 text-xs font-mono ${pwTestResult.ok ? "border-green-500/30 bg-green-500/5 text-green-300" : "border-red-500/30 bg-red-500/5 text-red-300"}`}>
                  <p className="font-semibold mb-1">HTTP {pwTestResult.status} — {pwTestResult.ok ? "성공" : "실패"}</p>
                  <pre className="whitespace-pre-wrap break-all text-[11px] opacity-80">{pwTestResult.body}</pre>
                </div>
              )}
            </div>

            {/* 섹션 3: 채널 메시지 직접 전송 */}
            <div className="rounded-2xl border border-border bg-secondary/20 p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-foreground">채널 메시지 전송</p>
              <p className="text-xs text-muted-foreground">충전 채널 <span className="font-mono text-foreground">-1004471984422</span> 로 메시지를 직접 전송합니다.</p>
              <textarea value={pwTgMsg} onChange={e => setPwTgMsg(e.target.value)}
                placeholder="전송할 메시지를 입력하세요."
                rows={4}
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
              {pwTgResult && <p className={`text-sm font-medium ${pwTgResult.ok ? "text-green-400" : "text-red-400"}`}>{pwTgResult.msg}</p>}
              <button disabled={pwTgSending || !pwTgMsg.trim()} onClick={async () => {
                setPwTgSending(true); setPwTgResult(null)
                try {
                  const res = await fetch("/api/pay-send-telegram", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: pwTgMsg, buttonText: pwBtnText || undefined, buttonUrl: pwBtnUrl || undefined }),
                  })
                  const d = await res.json()
                  setPwTgResult({ ok: res.ok, msg: res.ok ? "전송 완료!" : (d.error ?? "전송 실패") })
                } catch { setPwTgResult({ ok: false, msg: "네트워크 오류" }) }
                setPwTgSending(false)
              }} className="h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2 11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                {pwTgSending ? "전송 중..." : "텔레그램으로 전송"}
              </button>
            </div>

          </div>
        )}

        {/* ── 자동매매 탭 (master 전용) ── */}
        {activeTab === "auto_trade" && myRole === "master" && (
          <div className="p-6 space-y-6 max-w-5xl mx-auto">

            {/* 서브탭 네비게이션 */}
            <div className="flex gap-1 border-b border-border pb-0">
              {([["signal", "시그널 매매"], ["order", "자동주문"], ["logs", "주문로그"], ["seed", "시드설정"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={async () => {
                    setAutoSubTab(key)
                    if (key === "signal" && !dailyStatsLoaded) loadDailyStats()
                    if (key === "order" && !tradingLoaded) loadTradingData()
                    if (key === "logs" && !orderLogsLoaded) loadOrderLogs()
                    if (key === "seed") {
                      // 현재 설정 불러오기
                      const tok = localStorage.getItem("app_token") ?? ""
                      const res = await fetch("/api/auto-signal/settings", { headers: { Authorization: `Bearer ${tok}` } })
                      if (res.ok) {
                        const d = await res.json()
                        if (d.initial_seed  != null) setInitialSeed(String(d.initial_seed))
                        else setInitialSeed("")
                        if (d.withdrawn_amount != null) setWithdrawnTotal(Number(d.withdrawn_amount))
                        if (d.profit_dist) {
                          try {
                            const parsed = JSON.parse(d.profit_dist)
                            if (Array.isArray(parsed) && parsed.length > 0) setProfitRows(parsed)
                          } catch {}
                        }
                      }
                    }
                  }}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    autoSubTab === key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {/* ─�� 자동주문 서브탭 ── */}
            {autoSubTab === "order" && (
              <div className="space-y-6">

                {/* 텔레그램 배팅 채널 웹훅 등록 */}
                {tradingLoaded && (
                  <div className="rounded-xl border border-border p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-semibold text-foreground">텔레그램 배팅 채널 웹훅</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          배팅 채널 ID: <span className="font-mono text-foreground">-1004471984422</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={tgWebhookLoading}
                          onClick={async () => {
                            setTgWebhookLoading(true)
                            const tok = localStorage.getItem("app_token") ?? ""
                            const res = await fetch("/api/telegram/set-webhook", {
                              method: "GET",
                              headers: { Authorization: `Bearer ${tok}` },
                            })
                            const d = await res.json()
                            setTgWebhookInfo(d.url ? `등록됨: ${d.url}` : "미등록")
                            setTgWebhookLoading(false)
                          }}
                          className="h-7 px-3 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
                          상태 확인
                        </button>
                        <button
                          disabled={tgWebhookLoading}
                          onClick={async () => {
                            if (!confirm("배팅 웹훅을 등록/갱신합니까?")) return
                            setTgWebhookLoading(true)
                            const tok = localStorage.getItem("app_token") ?? ""
                            const res = await fetch("/api/telegram/set-webhook", {
                              method: "POST",
                              headers: { Authorization: `Bearer ${tok}` },
                            })
                            const d = await res.json()
                            setTgWebhookInfo(d.ok ? `등록 완료: ${d.webhookUrl}` : `오류: ${d.description ?? d.error}`)
                            setTgWebhookLoading(false)
                          }}
                          className="h-7 px-3 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                          {tgWebhookLoading ? "처리 중..." : "웹훅 등록"}
                        </button>
                      </div>
                    </div>
                    {tgWebhookInfo && (
                      <p className="text-[11px] font-mono text-muted-foreground break-all">{tgWebhookInfo}</p>
                    )}
                  </div>
                )}

                {/* 테이블 미생성 시 초기화 버튼 */}
                {!tradingLoaded && (
                  <div className="rounded-xl border border-border p-5 flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">자동주문 데이터를 불러오는 중...</span>
                  </div>
                )}

                {tradingLoaded && tradingAccounts.length === 0 && !tradingSettings?.webhook_url && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
                    <p className="text-sm text-amber-400 font-semibold">최초 설정 필요</p>
                    <p className="text-xs text-muted-foreground">
                      DB 테이블이 없으면 아래 버튼을 눌러 생성하세요. 이미 존재하면 스킵됩니다.
                    </p>
                    <button
                      onClick={async () => {
                        setTradingSetupMsg(null)
                        const tok = localStorage.getItem("app_token") ?? ""
                        const res = await fetch("/api/auto-trading/setup", { method: "POST", headers: { Authorization: `Bearer ${tok}` } })
                        const d = await res.json()
                        setTradingSetupMsg(d.message ?? d.error ?? "완료")
                        if (d.ok) loadTradingData()
                      }}
                      className="h-8 px-4 rounded-lg bg-amber-500/20 border border-amber-500/40 text-xs font-semibold text-amber-400 hover:bg-amber-500/30 transition-colors">
                      DB 테이블 초기화
                    </button>
                    {tradingSetupMsg && <p className="text-xs text-muted-foreground">{tradingSetupMsg}</p>}
                    {tradingSetupMsg?.includes("실패") && (
                      <pre className="text-[10px] text-muted-foreground bg-secondary p-3 rounded overflow-auto max-h-40 whitespace-pre-wrap">
{`CREATE TABLE IF NOT EXISTS auto_trading_global_settings (
  id INT PRIMARY KEY DEFAULT 1,
  webhook_url TEXT NOT NULL DEFAULT '',
  enabled BOOL NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO auto_trading_global_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS auto_trading_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name TEXT NOT NULL UNIQUE,
  auth_token TEXT NOT NULL DEFAULT '',
  leverage INT NOT NULL DEFAULT 20,
  base_amount NUMERIC NOT NULL DEFAULT 100,
  enabled BOOL NOT NULL DEFAULT true,
  take_profit_enabled BOOL NOT NULL DEFAULT false,
  take_profit_percent NUMERIC DEFAULT NULL,
  stop_loss_enabled BOOL NOT NULL DEFAULT false,
  stop_loss_percent NUMERIC DEFAULT NULL,
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);`}
                      </pre>
                    )}
                  </div>
                )}

                {/* 글로벌 설정 */}
                {tradingLoaded && tradingSettingsEdit && (
                  <div className="rounded-xl border border-border p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-foreground">글로벌 설정</h2>
                      <button
                        onClick={() => setTradingSettingsEdit({ webhook_url: tradingSettings?.webhook_url ?? "", enabled: !!tradingSettings?.enabled })}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        초기화
                      </button>
                    </div>

                    <div className="space-y-3">
                      {/* Webhook URL */}
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">TVM Webhook URL</label>
                        <input
                          type="text"
                          value={tradingSettingsEdit.webhook_url}
                          onChange={e => setTradingSettingsEdit(s => s ? { ...s, webhook_url: e.target.value } : s)}
                          placeholder="https://tvm.example.com/webhook/..."
                          className="w-full h-8 px-3 rounded-lg bg-secondary border border-border text-xs font-mono text-foreground"
                        />
                        <p className="text-[10px] text-muted-foreground">TVM 서비스에서 발급받은 웹훅 URL. 주문이 이 URL로 POST됩니다.</p>
                      </div>

                      {/* 활성화 토글 */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">자동주문 활성화</span>
                        <button
                          onClick={() => setTradingSettingsEdit(s => s ? { ...s, enabled: !s.enabled } : s)}
                          className={`h-7 px-4 rounded-lg text-xs font-semibold border transition-colors ${
                            tradingSettingsEdit.enabled
                              ? "bg-primary/20 border-primary text-primary"
                              : "bg-secondary border-border text-muted-foreground"
                          }`}>
                          {tradingSettingsEdit.enabled ? "ON" : "OFF"}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        disabled={tradingSettingsSaving}
                        onClick={async () => {
                          if (!tradingSettingsEdit) return
                          setTradingSettingsSaving(true); setTradingSettingsMsg(null)
                          const tok = localStorage.getItem("app_token") ?? ""
                          const res = await fetch("/api/auto-trading/settings", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
                            body: JSON.stringify(tradingSettingsEdit),
                          })
                          const d = await res.json()
                          if (res.ok) { setTradingSettings(d); setTradingSettingsMsg("저장됐습니다.") }
                          else setTradingSettingsMsg(d.error ?? "오류")
                          setTradingSettingsSaving(false)
                        }}
                        className="h-8 px-4 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                        {tradingSettingsSaving ? "저장 중..." : "설정 저장"}
                      </button>
                      {tradingSettingsMsg && <span className="text-xs text-muted-foreground">{tradingSettingsMsg}</span>}
                    </div>
                  </div>
                )}

                {/* 계정 목록 */}
                {tradingLoaded && (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-secondary/30">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-foreground">바이낸스 계정 ({tradingAccounts.length})</h2>
                      </div>
                      <button
                        onClick={() => {
                          setAccEditTarget(null)
                          setAccForm({ account_name: "", auth_token: "", leverage: "20", base_amount: "100", enabled: true, take_profit_enabled: false, take_profit_percent: "", stop_loss_enabled: false, stop_loss_percent: "", memo: "" })
                          setAccMsg(null)
                          setAccFormOpen(true)
                        }}
                        className="h-7 px-3 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-colors">
                        + 계정 추가
                      </button>
                    </div>

                    {tradingAccounts.length === 0 && (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        등록된 계정이 없습니다. 계정을 추가하세요.
                      </div>
                    )}

                    {tradingAccounts.map(acc => (
                      <div key={acc.id} className="flex items-center gap-3 px-5 py-3 border-t border-border hover:bg-secondary/10">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{acc.account_name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${acc.enabled ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                              {acc.enabled ? "ON" : "OFF"}
                            </span>
                            {acc.memo && <span className="text-xs text-muted-foreground truncate">{acc.memo}</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                            <span>레버리지 {acc.leverage}x</span>
                            <span>주문금액 ${acc.base_amount}</span>
                            {acc.take_profit_enabled && acc.take_profit_percent && <span className="text-green-500">TP {acc.take_profit_percent}%</span>}
                            {acc.stop_loss_enabled   && acc.stop_loss_percent   && <span className="text-red-400">SL {acc.stop_loss_percent}%</span>}
                            <span className="font-mono text-[10px]">{acc.auth_token.slice(0, 8)}...</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* 활성/비활성 토글 */}
                          <button
                            onClick={async () => {
                              const tok = localStorage.getItem("app_token") ?? ""
                              const res = await fetch("/api/auto-trading/accounts", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
                                body: JSON.stringify({ id: acc.id, enabled: !acc.enabled }),
                              })
                              if (res.ok) setTradingAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, enabled: !a.enabled } : a))
                            }}
                            className={`h-7 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                              acc.enabled ? "bg-primary/20 border-primary text-primary" : "bg-secondary border-border text-muted-foreground"
                            }`}>
                            {acc.enabled ? "ON" : "OFF"}
                          </button>
                          {/* 수정 */}
                          <button
                            onClick={() => {
                              setAccEditTarget(acc)
                              setAccForm({
                                account_name: acc.account_name,
                                auth_token: acc.auth_token,
                                leverage: String(acc.leverage),
                                base_amount: String(acc.base_amount),
                                enabled: acc.enabled,
                                take_profit_enabled: acc.take_profit_enabled,
                                take_profit_percent: acc.take_profit_percent != null ? String(acc.take_profit_percent) : "",
                                stop_loss_enabled: acc.stop_loss_enabled,
                                stop_loss_percent: acc.stop_loss_percent != null ? String(acc.stop_loss_percent) : "",
                                memo: acc.memo ?? "",
                              })
                              setAccMsg(null)
                              setAccFormOpen(true)
                            }}
                            className="h-7 px-3 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
                            수정
                          </button>
                          {/* 삭제 */}
                          <button
                            onClick={async () => {
                              if (!confirm(`${acc.account_name} 계정을 삭제합니까?`)) return
                              const tok = localStorage.getItem("app_token") ?? ""
                              const res = await fetch("/api/auto-trading/accounts", {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
                                body: JSON.stringify({ id: acc.id }),
                              })
                              if (res.ok) setTradingAccounts(prev => prev.filter(a => a.id !== acc.id))
                            }}
                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-secondary hover:bg-destructive/20 transition-colors">
                            <Trash2 className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 계정 추가/수정 폼 */}
                {accFormOpen && (
                  <div className="rounded-xl border border-border p-5 space-y-4 bg-secondary/10">
                    <h3 className="text-sm font-semibold text-foreground">
                      {accEditTarget ? `계정 수정: ${accEditTarget.account_name}` : "계정 추가"}
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">계정명 (TVM account name)</label>
                        <input
                          value={accForm.account_name}
                          onChange={e => setAccForm(s => ({ ...s, account_name: e.target.value }))}
                          placeholder="myBinanceAccount"
                          className="w-full h-8 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">인증 토큰 (TVM auth_token)</label>
                        <input
                          type="password"
                          value={accForm.auth_token}
                          onChange={e => setAccForm(s => ({ ...s, auth_token: e.target.value }))}
                          placeholder="TVM에서 발급받은 토큰"
                          className="w-full h-8 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">레버리지 (배수)</label>
                        <input type="number" step={1} placeholder="예: 10, 20, 50" value={accForm.leverage}
                          onChange={e => setAccForm(s => ({ ...s, leverage: e.target.value }))}
                          className="w-full h-8 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">주문 금액 (USDT)</label>
                        <input type="number" step={1} placeholder="예: 10, 50, 100" value={accForm.base_amount}
                          onChange={e => setAccForm(s => ({ ...s, base_amount: e.target.value }))}
                          className="w-full h-8 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground" />
                      </div>
                    </div>

                    {/* TP / SL */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setAccForm(s => ({ ...s, take_profit_enabled: !s.take_profit_enabled }))}
                            className={`h-6 px-2 rounded text-[11px] font-semibold border transition-colors ${accForm.take_profit_enabled ? "bg-green-500/15 border-green-500/40 text-green-400" : "bg-secondary border-border text-muted-foreground"}`}>
                            TP
                          </button>
                          <span className="text-xs text-muted-foreground">테이크프로핏 (LONG 진입 시 적용)</span>
                        </div>
                        {accForm.take_profit_enabled && (
                          <div className="relative">
                            <input type="number" min={0.1} step={0.1} placeholder="예: 5" value={accForm.take_profit_percent}
                              onChange={e => setAccForm(s => ({ ...s, take_profit_percent: e.target.value }))}
                              className="w-full h-8 px-3 pr-6 rounded-lg bg-secondary border border-border text-sm text-foreground" />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setAccForm(s => ({ ...s, stop_loss_enabled: !s.stop_loss_enabled }))}
                            className={`h-6 px-2 rounded text-[11px] font-semibold border transition-colors ${accForm.stop_loss_enabled ? "bg-red-500/15 border-red-500/40 text-red-400" : "bg-secondary border-border text-muted-foreground"}`}>
                            SL
                          </button>
                          <span className="text-xs text-muted-foreground">스탑로스 (SHORT 진입 시 적용)</span>
                        </div>
                        {accForm.stop_loss_enabled && (
                          <div className="relative">
                            <input type="number" min={0.1} step={0.1} placeholder="예: 3" value={accForm.stop_loss_percent}
                              onChange={e => setAccForm(s => ({ ...s, stop_loss_percent: e.target.value }))}
                              className="w-full h-8 px-3 pr-6 rounded-lg bg-secondary border border-border text-sm text-foreground" />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">메모</label>
                      <input value={accForm.memo} onChange={e => setAccForm(s => ({ ...s, memo: e.target.value }))}
                        placeholder="내부 메모"
                        className="w-full h-8 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground" />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        disabled={accSaving}
                        onClick={async () => {
                          setAccSaving(true); setAccMsg(null)
                          const tok = localStorage.getItem("app_token") ?? ""
                          const payload = {
                            ...(accEditTarget ? { id: accEditTarget.id } : {}),
                            account_name:        accForm.account_name,
                            auth_token:          accForm.auth_token,
                            leverage:            Number(accForm.leverage),
                            base_amount:         Number(accForm.base_amount),
                            enabled:             accForm.enabled,
                            take_profit_enabled: accForm.take_profit_enabled,
                            take_profit_percent: accForm.take_profit_enabled && accForm.take_profit_percent ? Number(accForm.take_profit_percent) : null,
                            stop_loss_enabled:   accForm.stop_loss_enabled,
                            stop_loss_percent:   accForm.stop_loss_enabled && accForm.stop_loss_percent ? Number(accForm.stop_loss_percent) : null,
                            memo:                accForm.memo,
                          }
                          const res = await fetch("/api/auto-trading/accounts", {
                            method: accEditTarget ? "PATCH" : "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
                            body: JSON.stringify(payload),
                          })
                          const d = await res.json()
                          if (res.ok) {
                            const acc = d.account
                            if (accEditTarget) {
                              setTradingAccounts(prev => prev.map(a => a.id === acc.id ? acc : a))
                            } else {
                              setTradingAccounts(prev => [...prev, acc])
                            }
                            setAccFormOpen(false)
                            setAccEditTarget(null)
                          } else {
                            setAccMsg(d.error ?? "오류")
                          }
                          setAccSaving(false)
                        }}
                        className="h-8 px-4 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                        {accSaving ? "저장 중..." : accEditTarget ? "수정 저장" : "계정 추가"}
                      </button>
                      <button onClick={() => { setAccFormOpen(false); setAccEditTarget(null) }}
                        className="h-8 px-4 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
                        취소
                      </button>
                      {accMsg && <span className="text-xs text-destructive">{accMsg}</span>}
                    </div>
                  </div>
                )}

                {/* 테스트 도구 */}
                {tradingLoaded && tradingAccounts.length > 0 && (
                  <div className="rounded-xl border border-border p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-foreground">���스트 주문</h2>
                      <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">실제 주문 전송됨</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      선택한 계정으로 TVM 포맷의 실제 주문을 전송합니다. 테스트 전 소액으로 먼저 확인하세요.
                    </p>

                    <div className="grid grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">계정</label>
                        <select value={testAccountId} onChange={e => setTestAccountId(e.target.value)}
                          className="w-full h-8 px-3 rounded-lg bg-secondary border border-border text-xs text-foreground">
                          <option value="">선택</option>
                          {tradingAccounts.filter(a => a.enabled).map(a => (
                            <option key={a.id} value={a.id}>{a.account_name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">심볼</label>
                        <input value={testSymbol} onChange={e => setTestSymbol(e.target.value.toUpperCase())}
                          placeholder="BTCUSDT"
                          className="w-full h-8 px-3 rounded-lg bg-secondary border border-border text-xs text-foreground font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">방향</label>
                        <div className="flex gap-1">
                          {(["LONG", "SHORT"] as const).map(d => (
                            <button key={d} onClick={() => setTestDirection(d)}
                              className={`flex-1 h-8 rounded-lg text-xs font-semibold border transition-colors ${
                                testDirection === d
                                  ? d === "LONG" ? "bg-green-500/15 border-green-500/40 text-green-400" : "bg-red-500/15 border-red-500/40 text-red-400"
                                  : "bg-secondary border-border text-muted-foreground"
                              }`}>
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">액션</label>
                        <div className="flex gap-1">
                          {(["open", "close"] as const).map(a => (
                            <button key={a} onClick={() => setTestAction(a)}
                              className={`flex-1 h-8 rounded-lg text-xs font-semibold border transition-colors ${
                                testAction === a ? "bg-primary/20 border-primary text-primary" : "bg-secondary border-border text-muted-foreground"
                              }`}>
                              {a === "open" ? "진입" : "청산"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      disabled={testLoading || !testAccountId || !testSymbol}
                      onClick={async () => {
                        if (!confirm(`${testSymbol} ${testDirection} ${testAction === "open" ? "진입" : "청산"} 주문을 전송합니까?\n실제 바이낸스 계정에 주문이 실행됩니다.`)) return
                        setTestLoading(true); setTestResult(null)
                        const tok = localStorage.getItem("app_token") ?? ""
                        const res = await fetch("/api/auto-trading/test-order", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
                          body: JSON.stringify({
                            account_id: testAccountId,
                            symbol:     testSymbol,
                            direction:  testDirection,
                            action:     testAction,
                          }),
                        })
                        const d = await res.json()
                        setTestResult(d)
                        setTestLoading(false)
                      }}
                      className="h-8 px-5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-xs font-semibold text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50">
                      {testLoading ? "전송 중..." : "테스트 주문 전송"}
                    </button>

                    {testResult && (
                      <div className={`rounded-lg p-3 space-y-2 border text-xs ${testResult.ok ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${testResult.ok ? "text-green-400" : "text-red-400"}`}>
                            {testResult.ok ? "전송 성공" : "전송 실패"}
                          </span>
                          <span className="text-muted-foreground">HTTP {String(testResult.tvm_status)}</span>
                        </div>
                        {testResult.tvm_str && (
                          <div className="space-y-1">
                            <p className="text-muted-foreground">전송된 TVM 문자열:</p>
                            <pre className="bg-secondary p-2 rounded text-[10px] overflow-auto break-all whitespace-pre-wrap">{String(testResult.tvm_str)}</pre>
                          </div>
                        )}
                        {testResult.tvm_body && (
                          <div className="space-y-1">
                            <p className="text-muted-foreground">TVM 응답:</p>
                            <pre className="bg-secondary p-2 rounded text-[10px] overflow-auto">{String(testResult.tvm_body)}</pre>
                          </div>
                        )}
                        {testResult.error && (
                          <p className="text-red-400">{String(testResult.error)}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* ── 주문로그 서브탭 ── */}
            {autoSubTab === "logs" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">TVM 주문 전송 로그</h2>
                  <button
                    onClick={loadOrderLogs}
                    disabled={orderLogsLoading}
                    className="h-7 px-3 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                    {orderLogsLoading ? "로딩 중..." : "새로고침"}
                  </button>
                </div>

                {!orderLogsLoaded && (
                  <div className="rounded-xl border border-border p-5 text-center text-xs text-muted-foreground">
                    로딩 중...
                  </div>
                )}

                {orderLogsLoaded && orderLogs.length === 0 && (
                  <div className="rounded-xl border border-border p-5 text-center text-xs text-muted-foreground">
                    주문 로그가 없습니다. ��그널이 수���되면 자동으로 기록됩니다.
                  </div>
                )}

                {orderLogsLoaded && orderLogs.length > 0 && (
                  <div className="rounded-xl border border-border overflow-hidden">
                    {/* 요약 통계 */}
                    {(() => {
                      const total   = orderLogs.length
                      const success = orderLogs.filter(l => l.ok).length
                      const fail    = total - success
                      return (
                        <div className="flex items-center gap-6 px-5 py-3 border-b border-border bg-secondary/20 text-xs">
                          <span className="text-muted-foreground">총 <span className="text-foreground font-semibold">{total}</span>건</span>
                          <span className="text-green-400 font-semibold">성공 {success}건</span>
                          <span className="text-red-400 font-semibold">실패 {fail}건</span>
                        </div>
                      )
                    })()}

                    {orderLogs.map(log => (
                      <div key={log.id} className={`flex items-start gap-3 px-5 py-3 border-t border-border text-xs ${log.ok ? "" : "bg-red-500/3"}`}>
                        {/* 상태 뱃지 */}
                        <span className={`mt-0.5 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${log.ok ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                          {log.ok ? "OK" : "FAIL"}
                        </span>

                        {/* 심볼·방향·계정 */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground">{log.symbol}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              log.direction?.toUpperCase() === "LONG"
                                ? "bg-green-500/10 text-green-400"
                                : "bg-red-500/10 text-red-400"
                            }`}>{log.direction}</span>
                            {log.account_name && (
                              <span className="text-muted-foreground">{log.account_name}</span>
                            )}
                            {log.tvm_status && (
                              <span className="text-muted-foreground">HTTP {log.tvm_status}</span>
                            )}
                          </div>

                          {/* 에러 메시지 */}
                          {log.error_msg && (
                            <p className="text-red-400 text-[11px]">{log.error_msg}</p>
                          )}

                          {/* TVM 응답 */}
                          {log.tvm_response && (
                            <p className="text-muted-foreground text-[10px] font-mono truncate max-w-lg">{log.tvm_response}</p>
                          )}

                          {/* TVM 구문 (토글 없이 truncate) */}
                          {log.tvm_str && (
                            <p className="text-[10px] font-mono text-muted-foreground/60 truncate max-w-lg">{log.tvm_str.slice(0, 120)}...</p>
                          )}
                        </div>

                        {/* 시간 */}
                        <span className="shrink-0 text-[10px] text-muted-foreground whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* DB 테이블 없을 경우 안내 */}
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-400/80 space-y-1">
                  <p className="font-semibold">Supabase SQL Editor에서 아래 테이블이 생성되어 있어야 합니다:</p>
                  <pre className="text-[10px] text-muted-foreground bg-secondary p-3 rounded overflow-auto">{`CREATE TABLE IF NOT EXISTS auto_trading_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT now(),
  position_id  UUID,
  symbol       TEXT,
  direction    TEXT,
  account_name TEXT,
  tvm_str      TEXT,
  tvm_status   INT,
  tvm_response TEXT,
  ok           BOOL NOT NULL DEFAULT false,
  error_msg    TEXT
);`}</pre>
                </div>
              </div>
            )}

            {/* ── 시그널 매매 서브탭 (기존 내용) ── */}
            {autoSubTab === "signal" && (
            <div className="space-y-6">

            {/* 날짜별 수익/손실/청산 통계 */}
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-secondary/20">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">날짜별 수익 / 손실 / 청산 현황</h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">청산율 = 청산 ÷ (수익+손실+청산) × 100</p>
                </div>
                <button
                  onClick={loadDailyStats}
                  disabled={dailyStatsLoading}
                  className="h-7 px-3 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                  {dailyStatsLoading ? "로딩..." : "새로고침"}
                </button>
              </div>

              {!dailyStatsLoaded ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  {dailyStatsLoading ? "데이터 로딩 중..." : "새로고침 버튼을 눌러 데이터를 불러오세요."}
                </div>
              ) : dailyStats.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">데이터 없음</div>
              ) : (
                <>
                  {/* 전체 합계 */}
                  {(() => {
                    const gp  = dailyStats.reduce((s, d) => s + d.profit, 0)
                    const gl  = dailyStats.reduce((s, d) => s + d.loss, 0)
                    const gliq = dailyStats.reduce((s, d) => s + d.liq, 0)
                    const gt  = gp + gl + gliq
                    const gr  = gt > 0 ? ((gliq / gt) * 100).toFixed(1) : "0.0"
                    return (
                      <div className="grid grid-cols-5 gap-0 px-5 py-3 border-b border-border bg-primary/5 text-xs font-semibold">
                        <span className="text-foreground">전체 합계</span>
                        <span className="text-center text-emerald-500">{gp.toLocaleString()}</span>
                        <span className="text-center text-red-400">{gl.toLocaleString()}</span>
                        <span className="text-center text-orange-400">{gliq.toLocaleString()}</span>
                        <span className={`text-right font-bold ${Number(gr) >= 30 ? "text-red-400" : Number(gr) >= 15 ? "text-orange-400" : "text-muted-foreground"}`}>
                          {gr}%
                        </span>
                      </div>
                    )
                  })()}

                  {/* 헤더 */}
                  <div className="grid grid-cols-5 gap-0 px-5 py-2 border-b border-border text-[10px] font-semibold text-muted-foreground bg-secondary/10">
                    <span>날짜</span>
                    <span className="text-center">수익</span>
                    <span className="text-center">손실</span>
                    <span className="text-center">청산</span>
                    <span className="text-right">청산율</span>
                  </div>

                  {/* 행 — 최신 날짜 위로 */}
                  {[...dailyStats].reverse().map(d => (
                    <div key={d.date}
                      className={`grid grid-cols-5 gap-0 px-5 py-2.5 border-t border-border text-xs items-center ${d.liqRate >= 50 ? "bg-red-500/3" : ""}`}>
                      <span className="font-mono text-muted-foreground tabular-nums">{d.date.slice(5)}</span>
                      <span className={`text-center font-semibold tabular-nums ${d.profit > 0 ? "text-emerald-500" : "text-muted-foreground/40"}`}>
                        {d.profit > 0 ? d.profit : "-"}
                      </span>
                      <span className={`text-center font-semibold tabular-nums ${d.loss > 0 ? "text-red-400" : "text-muted-foreground/40"}`}>
                        {d.loss > 0 ? d.loss : "-"}
                      </span>
                      <span className={`text-center font-semibold tabular-nums ${d.liq > 0 ? "text-orange-400" : "text-muted-foreground/40"}`}>
                        {d.liq > 0 ? d.liq : "-"}
                      </span>
                      <div className="flex items-center justify-end gap-2">
                        {/* 청산율 바 */}
                        <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className={`h-full rounded-full ${d.liqRate >= 50 ? "bg-red-400" : d.liqRate >= 20 ? "bg-orange-400" : "bg-muted-foreground/30"}`}
                            style={{ width: `${Math.min(d.liqRate, 100)}%` }}
                          />
                        </div>
                        <span className={`text-right tabular-nums font-semibold w-10 ${d.liqRate >= 50 ? "text-red-400" : d.liqRate >= 20 ? "text-orange-400" : "text-muted-foreground"}`}>
                          {d.liqRate.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* 설정 카드 */}
            <div className="rounded-xl border border-border p-5 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">자동매매 설정</h2>

              {/* Webhook URL */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Webhook URL (외부 시그널 서비스에서 POST)</p>
                <div className="flex gap-2">
                  <input readOnly value={webhookUrl}
                    className="flex-1 h-8 px-3 rounded-lg bg-secondary border border-border text-xs font-mono text-foreground" />
                  <button onClick={() => navigator.clipboard.writeText(webhookUrl)}
                    className="px-3 h-8 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
                    복사
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  헤���: <code className="bg-secondary px-1 rounded">x-internal-secret: {"{INTERNAL_SECRET}"}</code>
                </p>
              </div>

              {/* 설정 폼 */}
              {autoSettingsEdit && (
                <div className="grid grid-cols-4 gap-4 items-end">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">주문 금액 (USD)</label>
                    <input type="number" min={1} value={autoSettingsEdit.size_usd}
                      onChange={e => setAutoSettingsEdit(s => s ? { ...s, size_usd: e.target.value } : s)}
                      className="w-full h-8 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">레버리지</label>
                    <input type="number" min={1} max={100} value={autoSettingsEdit.leverage}
                      onChange={e => setAutoSettingsEdit(s => s ? { ...s, leverage: e.target.value } : s)}
                      className="w-full h-8 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      스탑로스 (%) <span className="text-[10px] opacity-50">비워두면 미사용</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number" min={0.1} max={100} step={0.1}
                        placeholder="예: 5"
                        value={autoSettingsEdit.stop_loss_pct}
                        onChange={e => setAutoSettingsEdit(s => s ? { ...s, stop_loss_pct: e.target.value } : s)}
                        className="w-full h-8 px-3 pr-6 rounded-lg bg-secondary border border-border text-sm text-foreground" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                    {autoSettingsEdit.stop_loss_pct && (
                      <p className="text-[10px] text-amber-500">
                        {autoSettingsEdit.leverage}x 기준 ROI -{(Number(autoSettingsEdit.stop_loss_pct) * Number(autoSettingsEdit.leverage)).toFixed(0)}% 이하 청산
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">활성화</label>
                    <button
                      onClick={() => setAutoSettingsEdit(s => s ? { ...s, enabled: !s.enabled } : s)}
                      className={`w-full h-8 rounded-lg text-xs font-semibold border transition-colors ${autoSettingsEdit.enabled ? "bg-primary/20 border-primary text-primary" : "bg-secondary border-border text-muted-foreground"}`}>
                      {autoSettingsEdit.enabled ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  disabled={autoSaving}
                  onClick={async () => {
                    if (!autoSettingsEdit) return
                    setAutoSaving(true)
                    setAutoMsg(null)
                    try {
                      const tok = localStorage.getItem("app_token") ?? ""
                      const res = await fetch("/api/auto-signal/settings", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
                        body: JSON.stringify({
                          size_usd:      Number(autoSettingsEdit.size_usd),
                          leverage:      Number(autoSettingsEdit.leverage),
                          enabled:       autoSettingsEdit.enabled,
                          stop_loss_pct: autoSettingsEdit.stop_loss_pct === "" ? null : Number(autoSettingsEdit.stop_loss_pct),
                        }),
                      })
                      const d = await res.json()
                      if (res.ok) { setAutoSettings(d); setAutoMsg("저장됐습니다.") }
                      else setAutoMsg(d.error ?? "오류")
                    } finally { setAutoSaving(false) }
                  }}
                  className="h-8 px-4 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {autoSaving ? "저장 중..." : "설정 저장"}
                </button>
                {autoMsg && <span className="text-xs text-muted-foreground">{autoMsg}</span>}
              </div>

              {/* 시그널 타입별 방�� 설정 */}
              {signalRules.length > 0 && (
                <div className="rounded-xl border border-border overflow-hidden mt-2">
                  <div className="px-5 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
                    <ArrowLeftRight className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">시그널 타입 설정</span>
                    <span className="text-xs text-muted-foreground">— 방향(롱/숏) 및 활성화</span>
                  </div>
                  <div className="divide-y divide-border">
                    {signalRules.map(rule => (
                      <div key={rule.signal_type} className="flex items-center justify-between px-5 py-3">
                        <span className="text-sm font-mono text-foreground">{rule.signal_type}</span>
                        <div className="flex items-center gap-2">
                          {/* 방향 토글 */}
                          <button
                            disabled={rulesSaving === rule.signal_type}
                            onClick={async () => {
                              const next = rule.direction === "long" ? "short" : "long"
                              setRulesSaving(rule.signal_type)
                              try {
                                const tok = localStorage.getItem("app_token") ?? ""
                                const res = await fetch("/api/auto-signal/rules", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
                                  body: JSON.stringify({ signal_type: rule.signal_type, direction: next }),
                                })
                                if (res.ok) {
                                  setSignalRules(prev => prev.map(r =>
                                    r.signal_type === rule.signal_type ? { ...r, direction: next } : r
                                  ))
                                }
                              } finally { setRulesSaving(null) }
                            }}
                            className={`h-7 px-3 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${
                              rule.direction === "long"
                                ? "bg-green-500/10 border-green-500/40 text-green-400"
                                : "bg-red-500/10 border-red-500/40 text-red-400"
                            }`}>
                            {rulesSaving === rule.signal_type ? "..." : rule.direction === "long" ? "LONG" : "SHORT"}
                          </button>
                          {/* 활성/비활성 토글 */}
                          <button
                            disabled={rulesSaving === rule.signal_type}
                            onClick={async () => {
                              const next = !rule.enabled
                              setRulesSaving(rule.signal_type)
                              try {
                                const tok = localStorage.getItem("app_token") ?? ""
                                const res = await fetch("/api/auto-signal/rules", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
                                  body: JSON.stringify({ signal_type: rule.signal_type, enabled: next }),
                                })
                                if (res.ok) {
                                  setSignalRules(prev => prev.map(r =>
                                    r.signal_type === rule.signal_type ? { ...r, enabled: next } : r
                                  ))
                                }
                              } finally { setRulesSaving(null) }
                            }}
                            className={`h-7 px-3 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                              rule.enabled
                                ? "bg-primary/20 border-primary text-primary"
                                : "bg-secondary border-border text-muted-foreground"
                            }`}>
                            {rule.enabled ? "ON" : "OFF"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 리밸런싱 카드 */}
            <div className="rounded-xl border border-border p-5 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">리밸런싱 (시드 관리)</h2>
              <p className="text-xs text-muted-foreground">
                초기 시드 자본을 설정하고, 수동으로 오늘의 잔고 스냅샷을 매매기록에 저장합니다.<br />
                ��정 cron이 자동으로 저장하지만 수동 저장도 가능합니다.
              </p>

              {/* 시드 자본 설정 */}
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">시드 자본 (USD)</label>
                  <input
                    type="number" min={1} step={1}
                    value={seedCapital}
                    onChange={e => setSeedCapital(e.target.value)}
                    className="w-40 h-8 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground"
                  />
                </div>
                <button
                  disabled={seedSaving}
                  onClick={async () => {
                    setSeedSaving(true); setSeedMsg(null)
                    try {
                      const tok = localStorage.getItem("app_token") ?? ""
                      const res = await fetch("/api/auto-signal/settings", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
                        body: JSON.stringify({ seed_capital: Number(seedCapital) }),
                      })
                      const d = await res.json()
                      setSeedMsg(res.ok ? `저장됐습니다. ($${Number(seedCapital).toFixed(2)})` : (d.error ?? "오류"))
                    } finally { setSeedSaving(false) }
                  }}
                  className="h-8 px-4 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {seedSaving ? "저장 중..." : "시드 저장"}
                </button>
                {seedMsg && <span className="text-xs text-muted-foreground">{seedMsg}</span>}
              </div>

              {/* 수동 리밸런싱 스냅샷 */}
              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    disabled={rebalSaving}
                    onClick={async () => {
                      if (!confirm("오늘 날짜로 리밸런싱 스냅샷을 수동 저장합니까?")) return
                      setRebalSaving(true); setRebalMsg(null)
                      try {
                        const tok = localStorage.getItem("app_token") ?? ""
                        const res = await fetch("/api/auto-signal/rebalance", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
                          body: JSON.stringify({ note: "수동 리밸런싱" }),
                        })
                        const d = await res.json()
                        setRebalMsg(res.ok
                          ? `저장됐습니다. EST. VALUE $${d.est_value?.toFixed(2) ?? "-"} / PNL ${d.daily_pnl >= 0 ? "+" : ""}$${d.daily_pnl?.toFixed(2) ?? "-"}`
                          : (d.error ?? "오류"))
                      } finally { setRebalSaving(false) }
                    }}
                    className="h-8 px-4 rounded-lg bg-secondary border border-border text-xs font-semibold text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50">
                    {rebalSaving ? "저장 중..." : "오늘 스냅샷 저장"}
                  </button>
                  {rebalMsg && <span className="text-xs text-muted-foreground">{rebalMsg}</span>}
                </div>

                {/* 소급 자정 마감 실행 (누락된 날짜 복구용) */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">소급 마감:</span>
                  <input
                    type="date"
                    id="retroDateInput"
                    defaultValue="2026-07-25"
                    className="h-8 px-2 rounded-lg bg-secondary border border-border text-xs text-foreground"
                  />
                  <button
                    onClick={async () => {
                      const dateVal = (document.getElementById("retroDateInput") as HTMLInputElement)?.value
                      if (!dateVal) return
                      if (!confirm(`${dateVal} 날짜로 자정 마감(포지션 종가 기록 + 스냅샷)을 실행합니까?`)) return
                      const tok = localStorage.getItem("app_token") ?? ""
                      const res = await fetch(`/api/auto-signal/day-close?date=${dateVal}`, {
                        headers: { "x-internal-secret": "tasko-internal", Authorization: `Bearer ${tok}` },
                      })
                      const d = await res.json()
                      if (res.ok) {
                        alert(`완료: ${dateVal}\n마감 포지션 ${d.closed_count}개\nPNL $${d.daily_pnl?.toFixed(2) ?? "-"}\nEST. VALUE $${d.est_value?.toFixed(2) ?? "-"}`)
                      } else {
                        alert(`오류: ${d.error ?? "실패"}`)
                      }
                    }}
                    className="h-8 px-4 rounded-lg bg-amber-500/20 border border-amber-500/40 text-xs font-semibold text-amber-400 hover:bg-amber-500/30 transition-colors">
                    소급 실행
                  </button>
                  <span className="text-[10px] text-muted-foreground">누락된 날짜의 포지션 종가 기록 + 스냅샷을 수동으로 생성합니다</span>
                </div>
              </div>
            </div>

            {/* 포지션 목록 */}
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-secondary/30">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">
                    시그널 포지션 ({autoPositions.length})
                  </h2>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setAutoLoading(true)
                      const tok = localStorage.getItem("app_token") ?? ""
                      const r = await fetch("/api/auto-signal/positions", { headers: { Authorization: `Bearer ${tok}` } })
                      const d = await r.json()
                      setAutoPositions(d.positions ?? [])
                      setAutoLoading(false)
                    }}
                    className="h-7 px-3 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
                    새로고침
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("전체 포지션을 초기화합니까?")) return
                      const tok = localStorage.getItem("app_token") ?? ""
                      await fetch("/api/auto-signal/positions", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
                        body: JSON.stringify({ all: true }),
                      })
                      setAutoPositions([])
                    }}
                    className="h-7 px-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive hover:bg-destructive/20 transition-colors">
                    전체 초기화
                  </button>
                </div>
              </div>

              {autoLoading && (
                <div className="py-10 text-center text-xs text-muted-foreground">불러오는 중...</div>
              )}

              {!autoLoading && autoPositions.length === 0 && (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  아직 수신된 시그널이 없습니다.<br />
                  위 Webhook URL을 TradingView 알림에 연결하세요.
                </div>
              )}

              {!autoLoading && autoPositions.length > 0 && (
                <>
                  {/* 헤더 */}
                  <div className="grid grid-cols-[1fr_60px_60px_80px_90px_90px_90px_40px] gap-0 px-4 py-2 text-[10px] font-semibold text-muted-foreground bg-secondary/20">
                    <span>심볼 / 시그널</span>
                    <span>방향</span>
                    <span>레버</span>
                    <span>진입가</span>
                    <span className="text-right">진입 시각</span>
                    <span className="text-right">날짜</span>
                    <span className="text-right">상태</span>
                    <span></span>
                  </div>
                  {autoPositions.map(pos => (
                    <div key={pos.id}
                      className="grid grid-cols-[1fr_60px_60px_80px_90px_90px_90px_40px] gap-0 px-4 py-2.5 border-t border-border text-xs items-center hover:bg-secondary/10">
                      <div>
                        <span className="font-semibold text-foreground">{pos.symbol.replace("USDT","")}/USDT</span>
                        <span className="ml-2 text-[10px] text-muted-foreground">{pos.signal_type}</span>
                      </div>
                      <span style={{
                        padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, display: "inline-block",
                        background: pos.direction === "long" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                        color: pos.direction === "long" ? "#22c55e" : "#ef4444",
                      }}>{pos.direction === "long" ? "LONG" : "SHORT"}</span>
                      <span className="text-muted-foreground">{pos.leverage}x</span>
                      <span className="font-mono tabular-nums text-foreground">${pos.entry_price}</span>
                      <span className="text-right text-muted-foreground tabular-nums">
                        {new Date(pos.signal_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="text-right text-muted-foreground">{pos.date_label}</span>
                      <span className="text-right">
                        <span style={{
                          padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                          background: pos.is_closed ? "rgba(255,255,255,0.05)" : "rgba(34,197,94,0.1)",
                          color: pos.is_closed ? "rgba(255,255,255,0.3)" : "#22c55e",
                        }}>{pos.is_closed ? "청산" : "보유"}</span>
                      </span>
                      <button
                        onClick={async () => {
                          if (!confirm(`${pos.symbol} 포지션을 삭제합니까?`)) return
                          const tok = localStorage.getItem("app_token") ?? ""
                          await fetch("/api/auto-signal/positions", {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
                            body: JSON.stringify({ id: pos.id }),
                          })
                          setAutoPositions(prev => prev.filter(p => p.id !== pos.id))
                        }}
                        className="flex items-center justify-center w-6 h-6 rounded-md bg-secondary hover:bg-destructive/20 transition-colors ml-auto">
                        <Trash2 className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>

            </div>
            )}

            {/* ── 시드설정 서브탭 ── */}
            {autoSubTab === "seed" && (
              <div className="space-y-4 max-w-md pt-2">

                {/* 초기 시드 설정 카드 */}
                <div className="rounded-xl border border-border p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">초기 시드 설정</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      자동매매 화면에 표시될 초기 시드 금액을 설정합니다. 이 값은 수익률(ROI) 계산의 기준이 됩니다.
                    </p>
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="space-y-1 flex-1">
                      <label className="text-xs text-muted-foreground">초기 시드 (USD)</label>
                      <input
                        type="number" min={1} step={0.01}
                        value={initialSeed}
                        onChange={e => setInitialSeed(e.target.value)}
                        placeholder="640"
                        className="w-full h-9 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground"
                      />
                    </div>
                    <button
                      disabled={initialSeedSaving}
                      onClick={async () => {
                        setInitialSeedSaving(true); setSeedSettingsMsg(null)
                        try {
                          const tok = localStorage.getItem("app_token") ?? ""
                          const res = await fetch("/api/auto-signal/settings", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
                            body: JSON.stringify({ initial_seed: Number(initialSeed), seed_capital: Number(initialSeed) }),
                          })
                          const d = await res.json()
                          setSeedSettingsMsg(res.ok ? `저장됨: $${Number(initialSeed).toFixed(2)}` : (d.error ?? "오류"))
                        } finally { setInitialSeedSaving(false) }
                      }}
                      className="h-9 px-4 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap">
                      {initialSeedSaving ? "저장 중..." : "저장"}
                    </button>
                  </div>
                  {seedSettingsMsg && <p className="text-xs text-muted-foreground">{seedSettingsMsg}</p>}
                </div>

                {/* 출금 카드 */}
                <div className="rounded-xl border border-border p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">출금</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      출금 시 현재 잔고(seed_capital)에서 해당 금액이 차감됩니다.
                    </p>
                    {withdrawnTotal > 0 && (
                      <p className="text-xs text-foreground mt-2">
                        누적 출금: <span className="font-semibold tabular-nums">${withdrawnTotal.toFixed(2)}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="space-y-1 flex-1">
                      <label className="text-xs text-muted-foreground">출금 금액 (USD)</label>
                      <input
                        type="number" min={1} step={0.01}
                        value={withdrawAmount}
                        onChange={e => setWithdrawAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full h-9 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground"
                      />
                    </div>
                    <button
                      disabled={withdrawSaving || !withdrawAmount || Number(withdrawAmount) <= 0}
                      onClick={async () => {
                        if (!confirm(`$${Number(withdrawAmount).toFixed(2)} 출금 처리합니까? 현재 잔고에서 차감됩니다.`)) return
                        setWithdrawSaving(true); setWithdrawMsg(null)
                        try {
                          const tok = localStorage.getItem("app_token") ?? ""
                          const res = await fetch("/api/auto-signal/withdraw", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
                            body: JSON.stringify({ amount: Number(withdrawAmount) }),
                          })
                          const d = await res.json()
                          if (res.ok) {
                            setWithdrawMsg(`출금 완료: -$${Number(withdrawAmount).toFixed(2)} | 현재 잔고: $${d.new_balance?.toFixed(2) ?? "-"}`)
                            setWithdrawnTotal(d.withdrawn_total ?? 0)
                            setWithdrawAmount("")
                          } else {
                            setWithdrawMsg(d.error ?? "오류")
                          }
                        } finally { setWithdrawSaving(false) }
                      }}
                      className="h-9 px-4 rounded-lg bg-destructive/80 text-white text-xs font-semibold hover:bg-destructive transition-colors disabled:opacity-50 whitespace-nowrap">
                      {withdrawSaving ? "처리 중..." : "출금"}
                    </button>
                  </div>
                  {withdrawMsg && <p className={`text-xs ${withdrawMsg.includes("완료") ? "text-primary" : "text-destructive"}`}>{withdrawMsg}</p>}
                </div>

                {/* 수익 분배 카드 */}
                <div className="rounded-xl border border-border p-5 space-y-4">
                  {/* 헤더 + 체크박스 */}
                  <label className="flex items-center justify-between cursor-pointer select-none">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">수익 분배</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        수익 분배 항목을 추가하고 각 비율(%)을 설정합니다.
                      </p>
                    </div>
                    <div
                      onClick={() => setShowProfitDist(v => !v)}
                      className="relative ml-4 flex-shrink-0 w-9 h-5 rounded-full border transition-colors cursor-pointer"
                      style={{
                        background: showProfitDist ? "var(--color-primary, #22c55e)" : "var(--color-secondary, #1a1a1a)",
                        borderColor: showProfitDist ? "var(--color-primary, #22c55e)" : "var(--color-border, #333)",
                      }}
                    >
                      <div
                        className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                        style={{
                          left: showProfitDist ? "calc(100% - 18px)" : "2px",
                          background: showProfitDist ? "#000" : "rgba(255,255,255,0.35)",
                        }}
                      />
                    </div>
                  </label>

                  {showProfitDist && <div className="space-y-2">
                    {profitRows.map((row, idx) => (
                      <div key={row.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={row.label}
                          onChange={e => setProfitRows(prev => prev.map(r => r.id === row.id ? { ...r, label: e.target.value } : r))}
                          placeholder={`항목 ${idx + 1} (예: 운영비)`}
                          className="flex-1 h-9 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground"
                        />
                        <div className="relative">
                          <input
                            type="number" min={0} max={100} step={0.1}
                            value={row.pct}
                            onChange={e => setProfitRows(prev => prev.map(r => r.id === row.id ? { ...r, pct: e.target.value } : r))}
                            placeholder="0"
                            className="w-24 h-9 px-3 pr-7 rounded-lg bg-secondary border border-border text-sm text-foreground text-right"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                        </div>
                        <button
                          onClick={() => setProfitRows(prev => prev.filter(r => r.id !== row.id))}
                          disabled={profitRows.length === 1}
                          className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors disabled:opacity-30">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* 합계 */}
                  {profitRows.some(r => r.pct) && (
                    <p className={`text-xs font-medium tabular-nums ${
                      profitRows.reduce((s, r) => s + (Number(r.pct) || 0), 0) > 100
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}>
                      합계: {profitRows.reduce((s, r) => s + (Number(r.pct) || 0), 0).toFixed(1)}%
                      {profitRows.reduce((s, r) => s + (Number(r.pct) || 0), 0) > 100 && " (100% 초과)"}
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => setProfitRows(prev => [...prev, { id: Date.now(), label: "", pct: "" }])}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                      항목 추가
                    </button>
                    <button
                      disabled={profitSaving || profitRows.reduce((s, r) => s + (Number(r.pct) || 0), 0) > 100}
                      onClick={async () => {
                        setProfitSaving(true); setProfitMsg(null)
                        try {
                          const tok = localStorage.getItem("app_token") ?? ""
                          const res = await fetch("/api/auto-signal/settings", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
                            body: JSON.stringify({ profit_dist: JSON.stringify(profitRows) }),
                          })
                          const d = await res.json()
                          setProfitMsg(res.ok ? "저장됨" : (d.error ?? "오류"))
                        } finally { setProfitSaving(false) }
                      }}
                      className="h-8 px-4 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                      {profitSaving ? "저장 중..." : "저장"}
                    </button>
                    {profitMsg && <span className="text-xs text-muted-foreground">{profitMsg}</span>}
                  </div>
                  </div>}
                </div>

              </div>
            )}

          </div>
        )}

        {/* ── 입금 주소 관리 탭 (master 전용) ── */}
        {activeTab === "wallets" && myRole === "master" && (
          <div className="p-6 max-w-3xl mx-auto space-y-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">입금 주소 일괄 복구</h2>
              <p className="text-xs text-muted-foreground mt-1">
                wallet_address가 없거나 중복된 사용자에게 새 고유 주소를 할당합니다.
                기존에 올바른 주소를 가진 사용자는 변경되지 않습니다.
              </p>
            </div>

            <button
              onClick={async () => {
                setWalletRepairLoading(true)
                setWalletRepairResult(null)
                setWalletRepairError(null)
                try {
                  const token = localStorage.getItem("app_token") ?? ""
                  const res = await fetch("/api/admin/repair-wallets", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                  })
                  const data = await res.json()
                  if (!res.ok) setWalletRepairError(data.error ?? "오류 발생")
                  else setWalletRepairResult(data)
                } catch (e) {
                  setWalletRepairError(String(e))
                } finally {
                  setWalletRepairLoading(false)
                }
              }}
              disabled={walletRepairLoading}
              className="h-9 px-5 rounded-lg bg-primary text-black text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {walletRepairLoading ? "복구 중..." : "주소 일괄 복구 실행"}
            </button>

            {walletRepairError && (
              <p className="text-sm text-destructive">{walletRepairError}</p>
            )}

            {walletRepairResult && (
              <div className="space-y-3">
                <div className="flex gap-4 text-sm">
                  <span className="text-primary font-semibold">복구됨: {walletRepairResult.repairedCount}명</span>
                  <span className="text-muted-foreground">정상: {walletRepairResult.skippedCount}명</span>
                </div>
                {walletRepairResult.repaired.length > 0 && (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="grid grid-cols-[1fr_2fr_2fr] gap-0 text-[11px] font-semibold text-muted-foreground bg-secondary/40 px-4 py-2">
                      <span>유저���</span>
                      <span>기존 주소</span>
                      <span>새 주소</span>
                    </div>
                    {walletRepairResult.repaired.map((r) => (
                      <div key={r.id} className="grid grid-cols-[1fr_2fr_2fr] gap-0 px-4 py-2.5 border-t border-border text-xs">
                        <span className="font-medium text-foreground">{r.username}</span>
                        <span className="text-muted-foreground font-mono truncate">{r.oldAddress ?? "없음"}</span>
                        <span className="text-primary font-mono truncate">{r.newAddress}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 미반영 입금 수동 재처리 */}
            <div className="border-t border-border pt-6 space-y-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">미반영 입금 수동 처리</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  인덱서가 놓친 트랜잭션의 Solana signature를 입력하면 즉시 잔고를 반영합니다.
                  이미 처리된 signature는 중복 적립되지 않습니다.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  value={replaySig}
                  onChange={e => { setReplaySig(e.target.value); setReplayResult(null); setReplayError(null) }}
                  placeholder="트랜잭션 Signature 입력..."
                  className="flex-1 h-9 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
                />
                <button
                  onClick={async () => {
                    if (!replaySig.trim()) return
                    setReplayLoading(true)
                    setReplayResult(null)
                    setReplayError(null)
                    try {
                      const tok = localStorage.getItem("app_token") ?? ""
                      const res = await fetch("/api/admin/replay-deposit", {
                        method: "POST",
                        headers: {
                          "Content-Type":  "application/json",
                          "Authorization": `Bearer ${tok}`,
                        },
                        body: JSON.stringify({ signature: replaySig.trim() }),
                      })
                      const data = await res.json()
                      if (!res.ok) setReplayError(data.error ?? "오류 발생")
                      else setReplayResult(data)
                    } catch (e) {
                      setReplayError(String(e))
                    } finally {
                      setReplayLoading(false)
                    }
                  }}
                  disabled={replayLoading || !replaySig.trim()}
                  className="h-9 px-4 rounded-lg bg-primary text-black text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {replayLoading ? "처리 중..." : "재처리"}
                </button>
              </div>
              {replayError && <p className="text-sm text-destructive">{replayError}</p>}
              {replayResult && (
                replayResult.replayed.length === 0
                  ? <p className="text-sm text-muted-foreground">이미 처리된 트랜잭션이거나 해당 지갑의 유저가 없습니다.</p>
                  : <div className="rounded-xl border border-border overflow-hidden">
                      <div className="grid grid-cols-[2fr_1fr_1fr] text-[11px] font-semibold text-muted-foreground bg-secondary/40 px-4 py-2">
                        <span>지갑 주소</span>
                        <span>CHIPS</span>
                        <span>적립 R</span>
                      </div>
                      {replayResult.replayed.map((r, i) => (
                        <div key={i} className="grid grid-cols-[2fr_1fr_1fr] px-4 py-2.5 border-t border-border text-xs">
                          <span className="font-mono text-muted-foreground truncate">{r.owner}</span>
                          <span className="text-foreground">+{r.delta}</span>
                          <span className="text-primary font-semibold">+{r.creditAmount} R</span>
                        </div>
                      ))}
                      </div>
              )}
            </div>

          </div>
        )}

      </main>

    </div>
  )
}

// ── 글쓰기 권한 신청 관리 패널 ──────────────────────────────────────
interface WriteRequest {
  id: string
  status: string
  reason: string | null
  created_at: string
  reviewed_at: string | null
  allow_point_category: boolean
  profiles: { id: string; username: string; role: string } | null
}

function WriteRequestsPanel({ token }: { token: string }) {
  const [requests, setRequests]       = useState<WriteRequest[]>([])
  const [filter, setFilter]           = useState<"pending" | "approved" | "rejected" | "all">("pending")
  const [loading, setLoading]         = useState(false)
  const [processing, setProcessing]   = useState<string | null>(null)
  const [msg, setMsg]                 = useState<{ id: string; ok: boolean; text: string } | null>(null)
  // 각 신청별 포인트 전용 카테고리 허용 여부 체크 상태
  const [pointChecks, setPointChecks] = useState<Record<string, boolean>>({})

  const load = useCallback(async (f: typeof filter) => {
    setLoading(true)
    try {
      const appToken = typeof window !== "undefined" ? localStorage.getItem("app_token") : null
      const res = await fetch(`/api/market/write-permission/review?status=${f}`, {
        headers: appToken ? { Authorization: `Bearer ${appToken}` } : {},
      })
      const data = await res.json()
      const reqs: WriteRequest[] = data.requests ?? []
      setRequests(reqs)
      // 기존 approved 항목의 allow_point_category 값으로 체크 상태 초기화
      setPointChecks(Object.fromEntries(reqs.map(r => [r.id, r.allow_point_category ?? false])))
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  const handleUpdatePoint = async (requestId: string) => {
    setProcessing(requestId)
    setMsg(null)
    try {
      const appToken = typeof window !== "undefined" ? localStorage.getItem("app_token") : null
      const res = await fetch("/api/market/write-permission/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(appToken ? { Authorization: `Bearer ${appToken}` } : {}) },
        body: JSON.stringify({ requestId, action: "update_point", allowPointCategory: pointChecks[requestId] ?? false }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg({ id: requestId, ok: false, text: data.error ?? "저장 실패" }); return }
      setMsg({ id: requestId, ok: true, text: `포인트 카테고리 권한 ${pointChecks[requestId] ? "허용" : "해제"} 저장됨` })
    } catch { setMsg({ id: requestId, ok: false, text: "네트워크 오류" }) }
    finally { setProcessing(null) }
  }

  const handleAction = async (requestId: string, action: "approve" | "reject") => {
    setProcessing(requestId)
    setMsg(null)
    try {
      const appToken = typeof window !== "undefined" ? localStorage.getItem("app_token") : null
      const res = await fetch("/api/market/write-permission/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(appToken ? { Authorization: `Bearer ${appToken}` } : {}) },
        body: JSON.stringify({ requestId, action, allowPointCategory: pointChecks[requestId] ?? false }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg({ id: requestId, ok: false, text: data.error ?? "처리 실패" }); return }
      setMsg({ id: requestId, ok: true, text: action === "approve" ? `승인 완료${pointChecks[requestId] ? " (포인�� 카테고리 포함)" : ""}` : "거절 완료" })
      // 목록 새로고침 (역할 변경 반영)
      await load(filter)
    } catch {
      setMsg({ id: requestId, ok: false, text: "오류 발생" })
    } finally {
      setProcessing(null)
    }
  }

  const FILTER_OPTS: { key: typeof filter; label: string }[] = [
    { key: "pending",  label: "대기중" },
    { key: "approved", label: "승인됨" },
    { key: "rejected", label: "거절됨" },
    { key: "all",      label: "전체" },
  ]

  const ROLE_LABEL: Record<string, string> = { user: "일반", member: "멤버", admin: "���점", branch_admin: "총판", super_admin: "대총판", master: "마스터" }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground">글쓰기 권한 신청 관리</h2>
        <Button variant="ghost" size="sm" onClick={() => load(filter)} className="h-8 w-8 p-0">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* 필터 탭 */}
      <div className="flex items-center gap-1 border-b border-border">
        {FILTER_OPTS.map(o => (
          <button
            key={o.key}
            onClick={() => setFilter(o.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${filter === o.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">불러오는 중...</div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <UserCheck className="w-8 h-8 opacity-30" />
          <p className="text-sm">신청이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map(r => (
            <div key={r.id} className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card">
              {/* 유저 정보 */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{r.profiles?.username ?? "알수없음"}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary text-muted-foreground">
                    {ROLE_LABEL[r.profiles?.role ?? ""] ?? r.profiles?.role ?? "-"}
                  </span>
                  {r.status === "pending" && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-500">대기중</span>
                  )}
                  {r.status === "approved" && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/15 text-primary">승인됨</span>
                  )}
                  {r.status === "rejected" && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-destructive/15 text-destructive">거절됨</span>
                  )}
                </div>
                {r.reason && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{r.reason}</p>
                )}
                <p className="text-[10px] text-muted-foreground/60">
                  신청일: {new Date(r.created_at).toLocaleDateString("ko-KR")}
                  {r.reviewed_at && ` · 처리일: ${new Date(r.reviewed_at).toLocaleDateString("ko-KR")}`}
                </p>
                {msg?.id === r.id && (
                  <p className={`text-xs font-medium ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>
                )}
              </div>

              {/* 승인됨: 포인트 카테고리 체크박스 + 저장 / 역할 재적용 */}
              {r.status === "approved" && (
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pointChecks[r.id] ?? false}
                      onChange={e => setPointChecks(prev => ({ ...prev, [r.id]: e.target.checked }))}
                      className="w-3.5 h-3.5 accent-primary rounded"
                    />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">포인트 카테고리 허용</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleUpdatePoint(r.id)}
                      disabled={processing === r.id}
                      className="h-8 px-3 text-xs bg-primary text-black hover:bg-primary/90"
                    >
                      {processing === r.id ? "저장중..." : "저장"}
                    </Button>
                    {r.profiles?.role !== "seller" && (
                      <Button
                        size="sm"
                        onClick={() => handleAction(r.id, "approve")}
                        disabled={processing === r.id}
                        className="h-8 px-3 text-xs bg-secondary text-foreground border border-border hover:border-primary/40"
                      >
                        역할 적용
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {r.status === "pending" && (
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {/* 포인트 전용 카테고리 허용 체크박스 */}
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pointChecks[r.id] ?? false}
                      onChange={e => setPointChecks(prev => ({ ...prev, [r.id]: e.target.checked }))}
                      className="w-3.5 h-3.5 accent-primary rounded"
                    />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">포인트 전용 카테고리 허용</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleAction(r.id, "approve")}
                      disabled={processing === r.id}
                      className="h-8 px-3 text-xs bg-primary text-black hover:bg-primary/90"
                    >
                      {processing === r.id ? "처리중..." : "승인"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(r.id, "reject")}
                      disabled={processing === r.id}
                      className="h-8 px-3 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      거절
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 게임 접근 토글 컴포넌트 ───────────────────────────────────────
function GameAccessToggle({
  userId, enabled, token, onChanged,
}: {
  userId: string
  enabled: boolean
  token: string
  onChanged: (val: boolean) => void
}) {
  const [localEnabled, setLocalEnabled] = useState(enabled)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // 부모에서 enabled prop이 바뀌면 동기화
  useEffect(() => { setLocalEnabled(enabled) }, [enabled])

  const toggle = async () => {
    const next = !localEnabled
    setLocalEnabled(next)   // 낙관적 업데이트 (즉시 UI 반영)
    setLoading(true); setMsg(null)
    try {
      const res = await fetch("/api/admin/set-game-enabled", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, game_enabled: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLocalEnabled(!next)   // 실패 시 롤백
        setMsg(data.error ?? "실패")
        return
      }
      onChanged(next)
      setMsg(next ? "게임 활성화됨" : "게임 비활성화됨")
      setTimeout(() => setMsg(null), 2000)
    } catch {
      setLocalEnabled(!next)   // 실패 시 롤백
      setMsg("네트워크 오류")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pt-2 border-t border-border/50">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-foreground">게임 카테고리 활성화</p>
          <p className="text-[10px] text-muted-foreground">바카라 · 차트차트 접근 허용</p>
        </div>
        <button
          onClick={toggle}
          disabled={loading}
          className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${localEnabled ? "bg-primary" : "bg-muted-foreground/30"} disabled:opacity-50`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${localEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>
      {msg && <p className={`text-[10px] mt-1 ${msg.includes("활성화됨") ? "text-primary" : "text-muted-foreground"}`}>{msg}</p>}
    </div>
  )
}

// ─── 역할 변경 컴포넌트 ─────────────────────────────────────────────
function RoleChanger({
  userId, currentRole, token, roleLabel, onChanged,
}: {
  userId: string
  currentRole: string
  token: string
  roleLabel: Record<string, { label: string; color: string }>
  onChanged: (newRole: string) => void
}) {
  const [selected, setSelected] = useState(currentRole)
  const [loading,  setLoading]  = useState(false)
  const [msg,      setMsg]      = useState<{ text: string; ok: boolean } | null>(null)

  const ROLE_OPTIONS = [
    { value: "user",         label: "일반회원" },
    { value: "seller",       label: "셀러" },
    { value: "admin",        label: "지점관리자" },
    { value: "branch_admin", label: "총판" },
    { value: "super_admin",  label: "대총판" },
  ]

  const handleSave = async () => {
    if (selected === currentRole) return
    setLoading(true); setMsg(null)
    try {
      const res  = await fetch("/api/admin/set-role", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ userId, role: selected }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg({ text: data.error ?? "실패", ok: false }); return }
      setMsg({ text: `역할이 ${roleLabel[selected]?.label ?? selected}(으)로 변경됐습니다.`, ok: true })
      onChanged(selected)
    } catch {
      setMsg({ text: "네트워크 오류", ok: false })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pt-2 border-t border-border/50">
      <p className="text-xs font-medium text-foreground mb-2">역할 변경</p>
      <div className="flex gap-2 flex-wrap">
        {ROLE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setSelected(opt.value)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              selected === opt.value
                ? "bg-primary text-black border-primary"
                : "bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={handleSave}
          disabled={loading || selected === currentRole}
          className="h-7 px-3 text-xs rounded-lg bg-primary text-black font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          {loading ? "저장중..." : "저장"}
        </button>
        {msg && <p className={`text-xs ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>}
      </div>
    </div>
  )
}
