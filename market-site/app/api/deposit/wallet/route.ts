export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { deriveWalletAddress } from "@/lib/solana-wallet"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = (auth as { userId: string }).userId

  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("wallet_address, wallet_index")
    .eq("id", userId)
    .single()

  if (profile?.wallet_address) {
    return NextResponse.json({ walletAddress: profile.wallet_address })
  }

  if (!process.env.SOLANA_HD_SEED) {
    return NextResponse.json({ error: "SOLANA_HD_SEED not set" }, { status: 503 })
  }

  try {
    let walletIndex = profile?.wallet_index as number | null

    if (walletIndex === null || walletIndex === undefined) {
      // 기존 max wallet_index + 1 — count 기반이 아니므로 삭제/재가입 시 충돌 없음
      const { data: maxRow } = await adminSupabase
        .from("profiles")
        .select("wallet_index")
        .not("wallet_index", "is", null)
        .order("wallet_index", { ascending: false })
        .limit(1)
        .single()

      walletIndex = (maxRow?.wallet_index ?? -1) + 1
    }

    let walletAddress = deriveWalletAddress(walletIndex)

    // 주소 충돌 방어 (동일 주소가 다른 유저에게 이미 할당된 경우)
    const { data: addrConflict } = await adminSupabase
      .from("profiles")
      .select("id")
      .eq("wallet_address", walletAddress)
      .neq("id", userId)
      .maybeSingle()

    if (addrConflict) {
      walletIndex += 1
      walletAddress = deriveWalletAddress(walletIndex)
    }

    await adminSupabase
      .from("profiles")
      .update({ wallet_index: walletIndex, wallet_address: walletAddress })
      .eq("id", userId)

    return NextResponse.json({ walletAddress })
  } catch (e) {
    console.error("[wallet] derive error", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
