"use client"

import { useEffect, useMemo, useState } from "react"
import { Heart, MessageCircle, Repeat2, Send, UserRound } from "lucide-react"
import { blobImageUrl } from "@/lib/blob-image"

type FeedItem = { id: string; title: string; description: string; image_url: string | null; price_krw: number; created_at: string; profiles: { username: string; role: string; balance?: number } | null }
type Comment = { id: string; body: string; created_at: string; profiles?: { username: string } | null }
type Reaction = { likeCount: number; commentCount: number; shareCount: number; liked: boolean; comments: Comment[]; publisherBalance?: number }

export default function IndicatorFeed({ items, token, viewMode = "compact", hasMore = false, page = 1, onPageChange = () => {} }: { items: FeedItem[]; token: string | null; viewMode?: "compact" | "expanded"; hasMore?: boolean; page?: number; onPageChange?: (page: number) => void }) {
  const [reactions, setReactions] = useState<Record<string, Reaction>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [commentOpen, setCommentOpen] = useState<string | null>(null)
  const [commentText, setCommentText] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [expandedImage, setExpandedImage] = useState<string | null>(null)

  useEffect(() => {
    if (!items.length) return
    fetch(`/api/market/reactions?ids=${items.map((item) => item.id).join(",")}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined }).then((res) => res.json()).then((data) => setReactions(data.reactions ?? {})).catch(() => {})
  }, [items, token])
  const authHeaders = useMemo(() => ({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }), [token])
  const sendAction = async (itemId: string, action: "like" | "share" | "comment", body?: string) => {
    if (!token) { alert("로그인이 필요합니다."); return }
    setBusy(itemId)
    const res = await fetch("/api/market/reactions", { method: "POST", headers: authHeaders, body: JSON.stringify({ itemId, action, body }) })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setReactions((prev) => { const current = prev[itemId] ?? { likeCount: 0, commentCount: 0, shareCount: 0, liked: false, comments: [] }; if (action === "like") return { ...prev, [itemId]: { ...current, liked: true, likeCount: data.alreadyLiked ? current.likeCount : current.likeCount + 1 } }; if (action === "share") return { ...prev, [itemId]: { ...current, shareCount: current.shareCount + 1 } }; if (data.comment) return { ...prev, [itemId]: { ...current, commentCount: current.commentCount + 1, comments: [...current.comments, data.comment] } }; return prev })
    else alert(data.error ?? "처리할 수 없습니다.")
    setCommentText(""); setBusy(null)
  }
  if (!items.length) return <div className="py-12 text-center text-muted-foreground">등록된 게시글이 없습니다.</div>
  return <div className="pb-4" onClick={() => setExpanded(null)}>
    {items.map((item) => {
      const reaction = reactions[item.id] ?? { likeCount: 0, commentCount: 0, shareCount: 0, liked: false, comments: [] }
      const image = blobImageUrl(item.image_url)
      const isExpanded = viewMode === "expanded" || expanded === item.id
      return <article key={item.id} onClick={(event) => event.stopPropagation()} className="border-b border-border/60 py-6 first:pt-2">
        <div className="flex w-full items-center gap-3 text-left"><button type="button" onClick={() => setExpanded(isExpanded ? null : item.id)} aria-expanded={isExpanded} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><UserRound className="size-5" /></div>
          <div className="min-w-0 flex-1"><div className="min-w-0"><strong className="block truncate text-sm text-foreground">{item.profiles?.username ?? "게시글 작성자"}</strong>{item.profiles && <span className="block text-[11px] text-emerald-500">잔고 {Number(item.profiles.balance ?? 0).toLocaleString()}원</span>}</div><p className={viewMode === "compact" ? "truncate text-sm text-foreground/85" : "text-sm text-foreground/85"}>{item.title}</p></div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground"><div className="flex items-center gap-2"><span><Heart className="mr-1 inline size-3.5" />{reaction.likeCount}</span><span><MessageCircle className="mr-1 inline size-3.5" />{reaction.commentCount}</span></div><span className="text-right text-[11px]">{new Date(item.created_at).toLocaleDateString("ko-KR").replace(/\.$/, "")}</span></div>
        </button>{image && <button type="button" onClick={(event) => { event.stopPropagation(); setExpandedImage(expandedImage === item.id ? null : item.id) }} className="size-20 shrink-0 overflow-hidden rounded-lg border border-border" aria-label="이미지 크게 보기"><img src={image} alt={`${item.title} 썸네일`} className="size-full object-cover" /></button>}</div>
        {isExpanded && <div className="mt-3 ml-12 border-t border-border/50 pt-3" onClick={(event) => event.stopPropagation()}><p className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">{item.description?.trim() || item.title}</p><div className="mt-3 flex items-center gap-5 text-sm text-muted-foreground"><button type="button" onClick={() => void sendAction(item.id, "like")} disabled={busy === item.id} className={reaction.liked ? "text-rose-500" : "hover:text-rose-500"}><Heart className={`mr-1 inline size-4 ${reaction.liked ? "fill-current" : ""}`} />{reaction.likeCount}</button><button type="button" onClick={() => setCommentOpen(commentOpen === item.id ? null : item.id)} className="hover:text-primary"><MessageCircle className="mr-1 inline size-4" />{reaction.commentCount}</button><button type="button" onClick={() => void sendAction(item.id, "share")} className="hover:text-primary"><Repeat2 className="mr-1 inline size-4" />{reaction.shareCount}</button><Send className="size-4" /></div>{commentOpen === item.id && <div className="mt-3 space-y-2 rounded-lg bg-muted/30 p-3">{reaction.comments.map((comment) => <p key={comment.id} className="text-xs"><strong className="mr-2">{comment.profiles?.username ?? "사용자"}</strong>{comment.body}</p>)}<form onSubmit={(event) => { event.preventDefault(); void sendAction(item.id, "comment", commentText) }} className="flex gap-2"><input value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="댓글을 입력하세요" className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs" /><button type="submit" className="rounded-md bg-primary px-2 text-primary-foreground"><Send className="size-3.5" /></button></form></div>}</div>}
      </article>
    })}
    {expandedImage && (() => { const preview = items.find((item) => item.id === expandedImage); const previewUrl = preview ? blobImageUrl(preview.image_url) : null; return previewUrl ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-6" onClick={() => setExpandedImage(null)}><img src={previewUrl} alt={`${preview?.title ?? "게시글"} 이미지 크게 보기`} className="max-h-[90vh] max-w-[90vw] object-contain" /></div> : null })()}
    <div className="flex items-center justify-center gap-3 pt-4"><button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-40">이전</button><span className="text-xs text-muted-foreground">{page} 페이지</span><button type="button" disabled={!hasMore} onClick={() => onPageChange(page + 1)} className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-40">다음</button></div>
  </div>
}
