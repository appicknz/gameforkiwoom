import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { deriveWalletAddress } from "@/lib/solana-wallet"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const auth = await verifySession(req)
  console.log("[v0] wallet GET: auth ok?", auth.ok, "userId:", (auth as { userId?: string }).userId)
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = (auth as { userId: string }).userId

  const { data: profile, error: profileErr } = await adminSupabase
    .from("profiles")
    .select("wallet_address, wallet_index")
    .eq("id", userId)
    .single()

  console.log("[v0] wallet GET: profile=", profile, "err=", profileErr?.message)

  // 이미 발급된 주소가 있으면 바로 반환
  if (profile?.wallet_address) {
    console.log("[v0] wallet GET: returning existing address")
    return NextResponse.json({ walletAddress: profile.wallet_address })
  }

  // SOLANA_HD_SEED 없으면 503 반환
  if (!process.env.SOLANA_HD_SEED) {
    console.log("[v0] wallet GET: SOLANA_HD_SEED missing")
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
    console.log("[v0] wallet GET: deriving index=", walletIndex)

    const walletAddress = deriveWalletAddress(walletIndex)
    console.log("[v0] wallet GET: derived address=", walletAddress)

    await adminSupabase
      .from("profiles")
      .update({ wallet_index: walletIndex, wallet_address: walletAddress })
      .eq("id", userId)

    return NextResponse.json({ walletAddress })
  } catch (e) {
    console.error("[v0] wallet GET: derive error", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
