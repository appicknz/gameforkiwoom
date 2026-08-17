"use client"

import { useEffect, useMemo, useState } from "react"
import { Heart, MessageCircle, Repeat2, Send, UserRound } from "lucide-react"
import { blobImageUrl } from "@/lib/blob-image"

type FeedItem = {
  id: string
  title: string
  description: string
  image_url: string | null
  price_krw: number
  created_at: string
  profiles: { username: string; role: string } | null
}
type Comment = { id: string; body: string; created_at: string; profiles?: { username: string } | null }
type Reaction = { likeCount: number; commentCount: number; shareCount: number; liked: boolean; comments: Comment[] }

export default function IndicatorFeed({ items, token, onOpen }: { items: FeedItem[]; token: string | null; onOpen: (item: FeedItem) => void }) {
  const [reactions, setReactions] = useState<Record<string, Reaction>>({})
  const [commentOpen, setCommentOpen] = useState<string | null>(null)
  const [commentText, setCommentText] = useState("")
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!items.length) return
    fetch(`/api/market/reactions?ids=${items.map((item) => item.id).join(",")}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then((res) => res.json()).then((data) => setReactions(data.reactions ?? {})).catch(() => {})
  }, [items, token])

  const authHeaders = useMemo(() => ({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }), [token])
  const sendAction = async (itemId: string, action: "like" | "share" | "comment", body?: string) => {
    if (!token) { alert("로그인이 필요합니다."); return }
    setBusy(itemId)
    const res = await fetch("/api/market/reactions", { method: "POST", headers: authHeaders, body: JSON.stringify({ itemId, action, body }) })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setReactions((prev) => {
        const current = prev[itemId] ?? { likeCount: 0, commentCount: 0, shareCount: 0, liked: false, comments: [] }
        if (action === "like") return { ...prev, [itemId]: { ...current, liked: data.liked, likeCount: current.likeCount + (data.liked ? 1 : -1) } }
        if (action === "share") { navigator.clipboard?.writeText(window.location.href); return { ...prev, [itemId]: { ...current, shareCount: current.shareCount + 1 } } }
        if (action === "comment" && data.comment) { setCommentText(""); return { ...prev, [itemId]: { ...current, commentCount: current.commentCount + 1, comments: [...current.comments, data.comment] } } }
        return prev
      })
    } else alert(data.error ?? "처리할 수 없습니다.")
    setBusy(null)
  }

  if (!items.length) return <div className="py-20 text-center text-muted-foreground">등록된 지표가 없습니다.</div>
  return <div className="mx-auto flex max-w-2xl flex-col gap-8 pb-12">
    {items.map((item) => {
      const reaction = reactions[item.id] ?? { likeCount: 0, commentCount: 0, shareCount: 0, liked: false, comments: [] }
      const image = blobImageUrl(item.image_url)
      return <article key={item.id} className="border-b border-border/60 pb-8">
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground"><UserRound className="size-6" /></div>
            <div className="min-w-0"><div className="flex items-center gap-2"><strong className="truncate text-sm text-foreground">{item.profiles?.username ?? "지표 작성자"}</strong><span className="rounded bg-primary/15 px-2 py-0.5 text-[11px] text-primary">팔로우 부자</span></div><p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString("ko-KR")} · 지표에 남긴 글</p></div>
          </div>
          <button className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">팔로우</button>
        </header>
        <button onClick={() => onOpen(item)} className="mt-4 block w-full text-left"><h2 className="text-xl font-bold leading-tight text-foreground">{item.title}</h2><p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-foreground/85">{item.description}</p>{image && <img src={image} alt={`${item.title} 분석 차트`} className="mt-5 max-h-[620px] w-full rounded-2xl border border-border object-contain" />}</button>
        <div className="mt-4 flex items-center gap-6 text-sm text-muted-foreground"><button onClick={() => sendAction(item.id, "like")} disabled={busy === item.id} className={reaction.liked ? "text-rose-500" : "hover:text-rose-500"}><Heart className={`mr-1 inline size-5 ${reaction.liked ? "fill-current" : ""}`} />{reaction.likeCount}</button><button onClick={() => setCommentOpen(commentOpen === item.id ? null : item.id)} className="hover:text-primary"><MessageCircle className="mr-1 inline size-5" />{reaction.commentCount}</button><button onClick={() => sendAction(item.id, "share")} className="hover:text-primary"><Repeat2 className="mr-1 inline size-5" />{reaction.shareCount}</button><button onClick={() => navigator.clipboard?.writeText(window.location.href)} className="hover:text-primary"><Send className="size-5" /></button></div>
        {commentOpen === item.id && <div className="mt-4 space-y-3 rounded-xl bg-muted/30 p-3">{reaction.comments.map((comment) => <div key={comment.id} className="text-sm"><strong className="mr-2 text-foreground">{comment.profiles?.username ?? "사용자"}</strong><span className="text-muted-foreground">{comment.body}</span></div>)}<form onSubmit={(event) => { event.preventDefault(); void sendAction(item.id, "comment", commentText) }} className="flex gap-2"><input value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength={1000} placeholder="댓글을 입력하세요" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none" /><button type="submit" className="rounded-lg bg-primary px-3 text-primary-foreground"><Send className="size-4" /></button></form></div>}
      </article>
    })}
  </div>
}
