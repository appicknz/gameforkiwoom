"use client"

import { useState, useRef, useEffect } from "react"
import { X, Upload, Link as LinkIcon, Loader2 } from "lucide-react"

interface Category { id: string; name: string; icon: string }
interface Publisher { id: string; username: string; role: string }

export interface EditItem {
  id: string
  title: string
  description: string
  link_url: string | null
  price_krw: number
  category_id: string | null
  publisher_id: string
  image_url: string | null
  is_active: boolean
  game_bonus_rate: number
  content_type: string | null
  data_source_type: string | null
}

const CONTENT_TYPES = [
  { value: "ebook",    label: "전자책" },
  { value: "line",     label: "라인커뮤니티" },
  { value: "youtube",  label: "유튜브" },
  { value: "telegram", label: "텔레그램" },
  { value: "discord",  label: "디스코드" },
]

const DATA_SOURCE_TYPES = [
  { value: "individual",   label: "개별연결" },
  { value: "text",         label: "텍스트" },
  { value: "tradingview",  label: "트뷰계정" },
]

interface Props {
  categories: Category[]
  onClose: () => void
  onSuccess: () => void
  editItem?: EditItem | null     // 수정 모드일 때 전달
  isMaster?: boolean             // true면 발행자 선택 표시
  selfPublisherId?: string | null // isMaster=false일 때 자동 설정
}

const ROLE_LABEL: Record<string, string> = {
  super_admin:  "대총판",
  branch_admin: "총판",
  admin:        "지점",
  master:       "마스터",
}

function getToken() {
  try { return localStorage.getItem("app_token") } catch { return null }
}

export default function MarketAdminPanel({ categories, onClose, onSuccess, editItem, isMaster = false, selfPublisherId }: Props) {
  const isEdit = !!editItem

  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [form, setForm] = useState({
    title:            editItem?.title            ?? "",
    description:      editItem?.description      ?? "",
    link_url:         editItem?.link_url          ?? "",
    price_krw:        editItem?.price_krw        ? String(editItem.price_krw) : "",
    category_id:      editItem?.category_id      ?? "",
    // master가 아니면 selfPublisherId 자동 설정, master면 선택
    publisher_id:     editItem?.publisher_id     ?? (!isMaster && selfPublisherId ? selfPublisherId : ""),
    is_active:        editItem?.is_active        ?? true,
    game_bonus_rate:  editItem?.game_bonus_rate  != null ? String(editItem.game_bonus_rate) : "0",
    content_type:     editItem?.content_type     ?? "ebook",
    data_source_type: editItem?.data_source_type ?? "",
  })
  const [imageFile, setImageFile]       = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(editItem?.image_url ?? null)
  const [uploading, setUploading]       = useState(false)
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch("/api/market/publishers", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setPublishers(d.publishers ?? []))
      .catch(() => {})
  }, [])

  const handleImage = (file: File) => {
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!form.title || !form.price_krw || !form.publisher_id) {
      setError("타이틀, 가격, 발행자는 필수입니다."); return
    }

    setSubmitting(true)
    try {
      let image_url: string | null = editItem?.image_url ?? null

      if (imageFile) {
        setUploading(true)
        const fd = new FormData()
        fd.append("file", imageFile)
        const res  = await fetch("/api/market/upload", {
          method:  "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
          body:    fd,
        })
        const data = await res.json()
        image_url  = data.url ?? null
        setUploading(false)
      }

      const token = getToken()
      const url    = isEdit ? `/api/market/items/${editItem!.id}` : "/api/market/items"
      const method = isEdit ? "PATCH" : "POST"

      const bonusRate = Math.min(100, Math.max(0, parseInt(form.game_bonus_rate, 10) || 0))
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title:            form.title,
          description:      form.description,
          link_url:         form.link_url || null,
          price_krw:        parseInt(form.price_krw, 10),
          category_id:      form.category_id || null,
          publisher_id:     form.publisher_id,
          is_active:        form.is_active,
          image_url,
          game_bonus_rate:  bonusRate,
          content_type:     form.content_type || "ebook",
          data_source_type: form.data_source_type || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errVal = data.error
        setError(typeof errVal === "string" ? errVal : (errVal?.message ?? (isEdit ? "수정 실패" : "등록 실패")))
        return
      }
      onSuccess()
    } catch {
      setError("오류가 발생했습니다.")
    } finally {
      setSubmitting(false)
      setUploading(false)
    }
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-secondary/30 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">
          {isEdit ? "상품 수정" : "상품 등록"}
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 좌측: 이미지 + 링크 */}
        <div className="space-y-3">
          <div
            onClick={() => fileRef.current?.click()}
            className="relative aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-secondary/40 cursor-pointer overflow-hidden transition-colors flex items-center justify-center"
          >
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="w-8 h-8" />
                <span className="text-xs">이미지 업로드</span>
              </div>
            )}
          </div>
          <input
            ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => e.target.files?.[0] && handleImage(e.target.files[0])}
          />

          <div className="relative">
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="url" placeholder="링크 (선택)"
              value={form.link_url}
              onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* 수정 모드: 활성/비활성 토글 */}
          {isEdit && (
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${form.is_active ? "bg-primary" : "bg-secondary border border-border"}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.is_active ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
              <span className="text-xs text-muted-foreground">
                {form.is_active ? "판매 중" : "판매 중단"}
              </span>
            </label>
          )}
        </div>

        {/* 우측: 텍스트 정보 */}
        <div className="space-y-3">
          <input
            type="text" placeholder="상품 타이틀 *"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <textarea
            placeholder="상품 설명"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₩</span>
            <input
              type="number" placeholder="가격 (원) *" min={0}
              value={form.price_krw}
              onChange={e => setForm(f => ({ ...f, price_krw: e.target.value }))}
              className="w-full pl-7 pr-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* 보너스 게임 적립 비율 */}
          <div className="space-y-1">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              <input
                type="number" placeholder="보너스 게임 적립률 (0~100)" min={0} max={100}
                value={form.game_bonus_rate}
                onChange={e => setForm(f => ({ ...f, game_bonus_rate: e.target.value }))}
                className="w-full pl-7 pr-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {parseInt(form.game_bonus_rate || "0", 10) > 0 && (
              <p className="text-[10px] text-primary/80">
                구매 시 가격의 {form.game_bonus_rate}%가 보너스 게임 잔고로 자동 적립됩니다.
                {form.price_krw ? ` (₩${Math.floor(parseInt(form.price_krw,10) * parseInt(form.game_bonus_rate,10) / 100).toLocaleString()} 적립)` : ""}
              </p>
            )}
          </div>

          <select
            value={form.category_id}
            onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">카테고리 선택</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>

          {/* 구분 — 컨텐츠 유형 */}
          <select
            value={form.content_type}
            onChange={e => setForm(f => ({ ...f, content_type: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">구분 선택</option>
            {CONTENT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          {/* 데이터 소스 — 지표용 */}
          <select
            value={form.data_source_type}
            onChange={e => setForm(f => ({ ...f, data_source_type: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">데이터 소스 선택 (선택)</option>
            {DATA_SOURCE_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          {/* master만 발행자 선택 가능, 일반 글쓰기 권한자는 본인으로 자동 설정 */}
          {isMaster && (
            <select
              value={form.publisher_id}
              onChange={e => setForm(f => ({ ...f, publisher_id: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">발행자 선택 *</option>
              {publishers.map(p => (
                <option key={p.id} value={p.id}>
                  {p.username} ({ROLE_LABEL[p.role] ?? p.role})
                </option>
              ))}
            </select>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit" disabled={submitting}
            className="w-full py-2 rounded-lg bg-primary text-black text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {(submitting || uploading) && <Loader2 className="w-4 h-4 animate-spin" />}
            {uploading ? "이미지 업로드 중..." : submitting ? (isEdit ? "수정 중..." : "등록 중...") : (isEdit ? "수정 완료" : "상품 등록")}
          </button>
        </div>
      </form>
    </div>
  )
}
