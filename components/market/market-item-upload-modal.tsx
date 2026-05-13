"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { X, Upload, ImageIcon, Loader2, CheckCircle, AlertCircle, ChevronDown } from "lucide-react"
import Image from "next/image"

interface Category { id: string; name: string; icon: string }

interface Props {
  onClose: () => void
  onSuccess: () => void
}

function getToken() {
  try { return localStorage.getItem("app_token") } catch { return null }
}

export default function MarketItemUploadModal({ onClose, onSuccess }: Props) {
  const [title, setTitle]           = useState("")
  const [description, setDesc]      = useState("")
  const [price, setPrice]           = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [imageUrl, setImageUrl]     = useState<string | null>(null)
  const [imageFile, setImageFile]   = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [uploading, setUploading]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState("")
  const [done, setDone]             = useState(false)
  const [catOpen, setCatOpen]       = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  // 카테고리 로드
  useEffect(() => {
    fetch("/api/market/categories")
      .then(r => r.json())
      .then(d => setCategories((d.categories ?? []).filter((c: Category) => c.name !== "전체")))
      .catch(() => {})
  }, [])

  // 이미지 선택 처리
  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) { setError("이미지 파일만 업로드할 수 있습니다."); return }
    if (file.size > 10 * 1024 * 1024) { setError("파일 크기는 10MB 이하여야 합니다."); return }
    setError("")
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    // 즉시 Blob 업로드
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res  = await fetch("/api/market/upload", {
        method:  "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body:    fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "업로드 실패")
      setImageUrl(data.url)
    } catch (e: any) {
      setError(e.message)
      setImageFile(null)
      setImagePreview(null)
    } finally {
      setUploading(false)
    }
  }, [])

  // 드래그 앤 드롭
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    const priceNum = Number(price.replace(/,/g, ""))
    if (!title.trim())      { setError("제목을 입력해주세요."); return }
    if (!priceNum || priceNum < 100) { setError("가격을 100원 이상 입력해주세요."); return }
    if (uploading)           { setError("이미지 업로드 중입니다. 잠시 기다려주세요."); return }

    setSubmitting(true)
    try {
      const res = await fetch("/api/market/items", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          title:       title.trim(),
          description: description.trim(),
          price_krw:   priceNum,
          category_id: categoryId || null,
          image_url:   imageUrl ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "등록 실패")
      setDone(true)
      setTimeout(() => { onSuccess(); onClose() }, 1200)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const selectedCat = categories.find(c => c.id === categoryId)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">상품 등록</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 성공 상태 */}
        {done ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
            <p className="text-sm font-semibold text-foreground">상품이 등록되었습니다!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[80vh]">
            <div className="p-5 space-y-4">

              {/* 이미지 업로드 */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  상품 이미지 <span className="opacity-50">(선택)</span>
                </label>
                <div
                  ref={dropRef}
                  onDragOver={e => e.preventDefault()}
                  onDrop={onDrop}
                  onClick={() => !imagePreview && fileRef.current?.click()}
                  className={[
                    "relative w-full rounded-xl border-2 border-dashed transition-colors overflow-hidden",
                    imagePreview
                      ? "border-border cursor-default aspect-video"
                      : "border-border hover:border-primary/50 cursor-pointer aspect-video flex flex-col items-center justify-center gap-2 bg-secondary/30",
                  ].join(" ")}
                >
                  {imagePreview ? (
                    <>
                      <Image src={imagePreview} alt="preview" fill className="object-cover" />
                      {/* 업로드 중 오버레이 */}
                      {uploading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="w-6 h-6 text-white animate-spin" />
                        </div>
                      )}
                      {/* 변경 버튼 */}
                      {!uploading && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setImagePreview(null); setImageFile(null); setImageUrl(null) }}
                          className="absolute top-2 right-2 p-1 rounded-md bg-black/60 text-white hover:bg-black/80 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="p-3 rounded-full bg-secondary">
                        <ImageIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="text-xs text-muted-foreground">클릭하거나 드래그해서 이미지 추가</p>
                      <p className="text-[10px] text-muted-foreground/50">JPG, PNG, WebP · 최대 10MB</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                />
              </div>

              {/* 제목 */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  제목 <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="상품 제목을 입력하세요"
                  maxLength={80}
                  className="w-full h-10 px-3 text-sm bg-secondary/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50"
                />
              </div>

              {/* 카테고리 + 가격 (나란히) */}
              <div className="grid grid-cols-2 gap-3">
                {/* 카테고리 드롭다운 */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">카테고리</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setCatOpen(v => !v)}
                      className="w-full h-10 px-3 flex items-center justify-between text-sm bg-secondary/40 border border-border rounded-lg hover:border-primary/40 transition-colors text-foreground"
                    >
                      <span className={selectedCat ? "text-foreground" : "text-muted-foreground/50"}>
                        {selectedCat ? `${selectedCat.icon} ${selectedCat.name}` : "선택"}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </button>
                    {catOpen && (
                      <div className="absolute z-20 top-full mt-1 left-0 right-0 rounded-xl border border-border bg-background shadow-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => { setCategoryId(""); setCatOpen(false) }}
                          className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors"
                        >
                          선택 안함
                        </button>
                        {categories.map(cat => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => { setCategoryId(cat.id); setCatOpen(false) }}
                            className={[
                              "w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors",
                              cat.id === categoryId
                                ? "bg-primary/10 text-primary"
                                : "hover:bg-secondary text-foreground",
                            ].join(" ")}
                          >
                            <span>{cat.icon}</span> {cat.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 가격 */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    가격 (원) <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={price}
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9]/g, "")
                        setPrice(v ? Number(v).toLocaleString("ko-KR") : "")
                      }}
                      placeholder="0"
                      className="w-full h-10 pl-3 pr-6 text-sm bg-secondary/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">원</span>
                  </div>
                </div>
              </div>

              {/* 설명 */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  설명 <span className="opacity-50">(선택)</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="상품에 대한 설명을 입력하세요"
                  rows={4}
                  maxLength={1000}
                  className="w-full px-3 py-2.5 text-sm bg-secondary/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50 resize-none leading-relaxed"
                />
                <p className="text-[10px] text-muted-foreground/50 mt-1 text-right">{description.length}/1000</p>
              </div>

              {/* 에러 */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}
            </div>

            {/* 푸터 버튼 */}
            <div className="px-5 pb-5 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-10 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting || uploading}
                className="flex-1 h-10 rounded-xl bg-primary text-black text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 등록 중...</>
                ) : (
                  <><Upload className="w-4 h-4" /> 상품 등록</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
