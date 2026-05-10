export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { deriveWalletAddress } from "@/lib/solana-wallet"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { randomUUID } from "crypto"

function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: Request) {
  const { username, password } = await req.json()

  if (!username || username.length < 2) {
    return NextResponse.json({ error: "아이디는 2자 이상이어야 합니다." }, { status: 400 })
  }
  if (!password || password.length < 4) {
    return NextResponse.json({ error: "비밀번호는 4자 이상이어야 합니다." }, { status: 400 })
  }

  const { data: existing } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .single()

  if (existing) {
    return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 })
  }

  const uid = randomUUID()
  const email = `${uid}@noreply.app`
  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  const userId = authData.user.id

  // HD 지갑 주소 발급 — SOLANA_HD_SEED가 없으면 null로 가입 진행
  let walletIndex: number | null = null
  let walletAddress: string | null = null
  if (process.env.SOLANA_HD_SEED) {
    const { count: userCount } = await adminSupabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
    walletIndex = userCount ?? 0
    walletAddress = deriveWalletAddress(walletIndex)
  }

  const profileData: Record<string, unknown> = { id: userId, username, role: "user" }
  if (walletIndex !== null) profileData.wallet_index = walletIndex
  if (walletAddress !== null) profileData.wallet_address = walletAddress

  const { error: profileError } = await adminSupabase
    .from("profiles")
    .upsert(profileData)

  if (profileError) {
    await adminSupabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  const { data: signIn, error: signInError } = await getAnonClient().auth.signInWithPassword({
    email,
    password,
  })

  if (signInError || !signIn.session) {
    return NextResponse.json({ success: true, username, needsLogin: true })
  }

  return NextResponse.json({
    token: signIn.session.access_token,
    username,
    role: "user",
  })
}
