import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

export async function GET(req: Request) {
  const ids = new URL(req.url).searchParams.get("ids")?.split(",").filter(Boolean) ?? []
  if (!ids.length) return NextResponse.json({ reactions: {} })

  const [{ data: likes }, { data: comments }, { data: shares }] = await Promise.all([
    (adminSupabase.from("market_item_likes" as never) as any).select("item_id, user_id").in("item_id", ids),
    (adminSupabase.from("market_item_comments" as never) as any).select("id, item_id, user_id, body, created_at, profiles(username)").in("item_id", ids).order("created_at", { ascending: true }),
    (adminSupabase.from("market_item_shares" as never) as any).select("item_id").in("item_id", ids),
  ])

  const reactions: Record<string, unknown> = {}
  for (const id of ids) {
    const itemLikes = (likes ?? []).filter((x: any) => x.item_id === id)
    reactions[id] = {
      likeCount: itemLikes.length,
      commentCount: (comments ?? []).filter((x: any) => x.item_id === id).length,
      shareCount: (shares ?? []).filter((x: any) => x.item_id === id).length,
      comments: (comments ?? []).filter((x: any) => x.item_id === id),
      liked: false,
    }
  }

  const auth = await verifySession(req)
  if (auth.ok) {
    for (const id of ids) {
      const row = (likes ?? []).find((x: any) => x.item_id === id && x.user_id === auth.userId)
      if (reactions[id]) (reactions[id] as any).liked = Boolean(row)
    }
  }
  return NextResponse.json({ reactions })
}

export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const { itemId, action } = body
  if (!itemId || !["like", "comment", "share"].includes(action)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }

  if (action === "like") {
    const { data: existing } = await (adminSupabase.from("market_item_likes" as never) as any).select("item_id").eq("item_id", itemId).eq("user_id", auth.userId).maybeSingle()
    if (existing) {
      await (adminSupabase.from("market_item_likes" as never) as any).delete().eq("item_id", itemId).eq("user_id", auth.userId)
      return NextResponse.json({ liked: false })
    }
    const { error } = await (adminSupabase.from("market_item_likes" as never) as any).insert({ item_id: itemId, user_id: auth.userId })
    if (error) return NextResponse.json({ error: "좋아요 처리에 실패했습니다." }, { status: 500 })
    return NextResponse.json({ liked: true })
  }

  if (action === "share") {
    const { error } = await (adminSupabase.from("market_item_shares" as never) as any).insert({ item_id: itemId, user_id: auth.userId })
    if (error) return NextResponse.json({ error: "공유 기록에 실패했습니다." }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const text = String(body.body ?? "").trim()
  if (!text || text.length > 1000) return NextResponse.json({ error: "댓글은 1~1000자로 입력하세요." }, { status: 400 })
  const { data, error } = await (adminSupabase.from("market_item_comments" as never) as any).insert({ item_id: itemId, user_id: auth.userId, body: text }).select("id, item_id, user_id, body, created_at, profiles(username)").single()
  if (error) return NextResponse.json({ error: "댓글 등록에 실패했습니다." }, { status: 500 })
  return NextResponse.json({ comment: data })
}
