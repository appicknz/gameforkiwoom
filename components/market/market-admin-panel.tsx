"use client"

import { useState, useRef } from "react"
import { X, Upload, Link as LinkIcon, Loader2 } from "lucide-react"

interface Category { id: string; name: string; icon: string }
interface Publisher { id: string; username: string; role: string }

interface Props {
  categories: Category[]
  onClose: () => void
  onSuccess: () => void
}

const ROLE_LABEL: Record<string, string> = {
  super_admin:  "대총판",
  branch_admin: "총판",
  admin:        "지점",
}

function getToken() {
  try { return localStorage.getItem("app_token") } catch { return null }
}

export default function MarketAdminPanel({ categories, onClose, onSuccess }: Props) {
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [pubLoaded, setPubLoaded]   = useState(false)
  const [form, setForm] = useState({
    title: "", description: "", link_url: "",
    price_krw: "", category_id: "", publisher_id: "",
  })
  const [imageFile, setImageFile]     = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploading, setUploading]     = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  // 발행자 목록 최초 1회 로드
  useState(() => {
    const token = getToken()
    if (!token) return
    fetch("/api/market/publishers", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setPublishers(d.publishers ?? []); setPubLoaded(true) })
      .catch(() => setPubLoaded(true))
  })

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
      let image_url: string | null = null

      // 이미지 업로드 (Vercel Blob)
      if (imageFile) {
        setUploading(true)
        const fd = new FormData()
        fd.append("file", imageFile)
        const res = await fetch("/api/market/upload", { method: "POST", body: fd })
        const data = await res.json()
        image_url = data.url ?? null
        setUploading(false)
      }

      const token = getToken()
      const res = await fetch("/api/market/items", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title:        form.title,
          description:  form.description,
          link_url:     form.link_url || null,
          price_krw:    parseInt(form.price_krw, 10),
          category_id:  form.category_id || null,
          publisher_id: form.publisher_id,
          image_url,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "등록 실패"); return }
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
        <h3 className="text-sm font-bold text-foreground">상품 등록</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 좌측: 이미지 + 기본 정보 */}
        <div className="space-y-3">
          {/* 이미지 업로드 */}
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

          {/* 링크 */}
          <div className="relative">
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="url" placeholder="링크 (선택)"
              value={form.link_url}
              onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* 우측: 텍스트 정보 */}
        <div className="space-y-3">
          {/* 타이틀 */}
          <input
            type="text" placeholder="상품 타이틀 *"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />

          {/* 설명 */}
          <textarea
            placeholder="상품 설명"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />

          {/* 가격 */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₩</span>
            <input
              type="number" placeholder="가격 (원) *" min={0}
              value={form.price_krw}
              onChange={e => setForm(f => ({ ...f, price_krw: e.target.value }))}
              className="w-full pl-7 pr-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* 카테고리 */}
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

          {/* 발행자 선택 */}
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

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit" disabled={submitting}
            className="w-full py-2 rounded-lg bg-primary text-black text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {(submitting || uploading) && <Loader2 className="w-4 h-4 animate-spin" />}
            {uploading ? "이미지 업로드 중..." : submitting ? "등록 중..." : "상품 등록"}
          </button>
        </div>
      </form>
    </div>
  )
}
