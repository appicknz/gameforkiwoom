import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

async function getUserFromToken(token: string) {
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await anonClient.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

// PATCH /api/admin/branches/betting
export async function PATCH(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "JWT token required" }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const authUser = await getUserFromToken(token)
  if (!authUser) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  const { data: requester } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", authUser.id)
    .single()

  if (!requester || !["master", "super_admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
  }

  const body = await req.json()
  const { branchId, bettingMode } = body

  if (!branchId) {
    return NextResponse.json({ error: "branchId required" }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (bettingMode !== undefined) {
    updates.betting_mode = bettingMode
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from("branches")
    .update(updates)
    .eq("id", branchId)
    .select("id, name, betting_mode")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Redis 캐시 무효화
  try {
    const { data: allUsers } = await adminSupabase.from("profiles").select("id").eq("branch_id", branchId)
    if (allUsers && allUsers.length > 0) {
      const cacheKeys = allUsers.map(u => `profile:branch:${u.id}`)
      await redis.del(...cacheKeys).catch(() => {})
    }
  } catch {}

  return NextResponse.json({ branch: data })
}
