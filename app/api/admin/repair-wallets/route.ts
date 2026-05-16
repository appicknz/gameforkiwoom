export const dynamic = "force-dynamic"
/**
 * POST /api/admin/repair-wallets
 * master 계정 전용 — wallet_address가 없거나 중복된 사용자에게 새 주소 할당
 */
import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { deriveWalletAddress } from "@/lib/solana-wallet"
import { NextResponse } from "next/server"

function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    )
    return payload.sub ?? null
  } catch { return null }
}

export async function POST(req: Request) {
  if (!process.env.SOLANA_HD_SEED) {
    return NextResponse.json({ error: "SOLANA_HD_SEED not set" }, { status: 503 })
  }

  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""
  const callerId = decodeJwtSub(token)
  if (!callerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: caller } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .single()

  if (!caller || !["master", "super_admin"].includes(caller.role)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  // 모든 사용자 가져오기
  const { data: allProfiles, error } = await adminSupabase
    .from("profiles")
    .select("id, username, wallet_index, wallet_address")
    .order("created_at", { ascending: true })

  if (error || !allProfiles) {
    return NextResponse.json({ error: "프로필 조회 실패" }, { status: 500 })
  }

  // 현재 할당된 주소 → userId 맵 (중복 감지용)
  const addressMap = new Map<string, string>() // address → userId
  for (const p of allProfiles) {
    if (p.wallet_address) addressMap.set(p.wallet_address, p.id)
  }

  // 현재 DB 최대 index
  const maxExistingIndex = allProfiles.reduce(
    (max, p) => (p.wallet_index != null && p.wallet_index > max ? p.wallet_index : max),
    -1
  )
  let nextIndex = maxExistingIndex + 1

  const repaired: { id: string; username: string; oldAddress: string | null; newAddress: string }[] = []
  const skipped: { id: string; username: string; address: string }[] = []

  for (const profile of allProfiles) {
    // 이미 주소가 있고 다른 유저와 중복이 아닌 경우 → 스킵
    if (profile.wallet_address) {
      const occupant = addressMap.get(profile.wallet_address)
      if (occupant === profile.id) {
        skipped.push({ id: profile.id, username: profile.username, address: profile.wallet_address })
        continue
      }
    }

    // 새 고유 주소 할당
    let newAddress = deriveWalletAddress(nextIndex)
    while (addressMap.has(newAddress)) {
      nextIndex++
      newAddress = deriveWalletAddress(nextIndex)
    }

    await adminSupabase
      .from("profiles")
      .update({ wallet_index: nextIndex, wallet_address: newAddress })
      .eq("id", profile.id)

    addressMap.set(newAddress, profile.id)
    repaired.push({
      id: profile.id,
      username: profile.username,
      oldAddress: profile.wallet_address,
      newAddress,
    })
    nextIndex++
  }

  return NextResponse.json({
    ok: true,
    repairedCount: repaired.length,
    skippedCount: skipped.length,
    repaired,
  })
}
