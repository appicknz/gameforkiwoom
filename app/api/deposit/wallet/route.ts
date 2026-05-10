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
      .eq("id", userId)

    return NextResponse.json({ walletAddress })
  } catch (e) {
    console.error("[wallet] derive error", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
