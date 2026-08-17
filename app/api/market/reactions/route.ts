import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

export async function GET(req: Request) {
  const ids = new URL(req.url).searchParams.get("ids")?.split(",").filter(Boolean) ?? []
  if (!ids.length) return NextResponse.json({ reactions: {} })

  const [{ data: likes }, { data: comments }, { data: shares }, { data: items }] = await Promise.all([
    (adminSupabase.from("market_item_likes" as never) as any).select("item_id, user_id").in("item_id", ids),
    (adminSupabase.from("market_item_comments" as never) as any).select("id, item_id, user_id, body, created_at, profiles(username)").in("item_id", ids).order("created_at", { ascending: true }),
    (adminSupabase.from("market_item_shares" as never) as any).select("item_id").in("item_id", ids),
    adminSupabase.from("market_items").select("id, publisher_id").in("id", ids),
  ])

  const publisherIds = Array.from(new Set((items ?? []).map((item: any) => item.publisher_id).filter(Boolean)))
  const { data: balances } = publisherIds.length
    ? await adminSupabase.from("balances").select("user_id, amount").in("user_id", publisherIds)
    : { data: [] as Array<{ user_id: string; amount: number }> }
  const balanceByUser = new Map((balances ?? []).map((balance: any) => [balance.user_id, Number(balance.amount ?? 0)]))

  const reactions: Record<string, unknown> = {}
  for (const id of ids) {
    const itemLikes = (likes ?? []).filter((x: any) => x.item_id === id)
    const publisherId = (items ?? []).find((item: any) => item.id === id)?.publisher_id
    reactions[id] = {
      publisherBalance: publisherId ? balanceByUser.get(publisherId) ?? 0 : 0,
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
    const { data, error } = await adminSupabase.rpc("reward_market_item_like", {
      p_item_id: itemId,
      p_user_id: auth.userId,
    })
    if (error) {
      if (error.message?.includes("ITEM_NOT_FOUND")) return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 })
      return NextResponse.json({ error: "좋아요 처리에 실패했습니다." }, { status: 500 })
    }
    const result = Array.isArray(data) ? data[0] : data
    return NextResponse.json({ liked: true, alreadyLiked: Boolean(result?.already_liked), publisherBalance: result?.publisher_balance ?? null })
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
