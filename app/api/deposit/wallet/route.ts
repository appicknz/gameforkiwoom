import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { deriveWalletAddress } from "@/lib/solana-wallet"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("wallet_address, wallet_index")
    .eq("id", auth.userId)
    .single()

  // 이미 발급된 주소가 있으면 바로 반환
  if (profile?.wallet_address) {
    return NextResponse.json({ walletAddress: profile.wallet_address })
  }

  // 없으면 즉석 발급 (SOLANA_HD_SEED 없으면 503 반환)
  if (!process.env.SOLANA_HD_SEED) {
    return NextResponse.json({ error: "Wallet service not configured" }, { status: 503 })
  }

  try {
    // 기존 wallet_index가 있으면 재사용, 없으면 전체 유저 수로 새 인덱스 할당
    let walletIndex = profile?.wallet_index as number | null
    if (walletIndex === null || walletIndex === undefined) {
      const { count } = await adminSupabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .not("wallet_index", "is", null)
      walletIndex = count ?? 0
    }

    const walletAddress = deriveWalletAddress(walletIndex)

    await adminSupabase
      .from("profiles")
      .update({ wallet_index: walletIndex, wallet_address: walletAddress })
      .eq("id", auth.userId)

    return NextResponse.json({ walletAddress })
  } catch (e) {
    console.error("[wallet] derive error", e)
    return NextResponse.json({ error: "Failed to generate wallet" }, { status: 500 })
  }
}
