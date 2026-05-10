import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("wallet_address")
    .eq("id", auth.userId)
    .single()

  if (!profile?.wallet_address) {
    return NextResponse.json({ error: "Wallet not assigned" }, { status: 404 })
  }

  return NextResponse.json({ walletAddress: profile.wallet_address })
}
