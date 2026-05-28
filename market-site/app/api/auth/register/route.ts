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
    // 현재 DB에 존재하는 최대 wallet_index + 1 사용
    // count 기반이 아닌 max 기반 → 사용자 삭제/재가입 시에도 절대 충돌 없음
    const { data: maxRow } = await adminSupabase
      .from("profiles")
      .select("wallet_index")
      .not("wallet_index", "is", null)
      .order("wallet_index", { ascending: false })
      .limit(1)
      .single()

    walletIndex = (maxRow?.wallet_index ?? -1) + 1
    walletAddress = deriveWalletAddress(walletIndex)

    // 만약 동일한 주소가 이미 다른 사용자에게 할당된 경우를 방어
    const { data: addrConflict } = await adminSupabase
      .from("profiles")
      .select("id")
      .eq("wallet_address", walletAddress)
      .maybeSingle()

    if (addrConflict) {
      // 충돌 시 한 칸 더 올림 (중복이 연속으로 일어날 수 없으므로 +1 충분)
      walletIndex += 1
      walletAddress = deriveWalletAddress(walletIndex)
    }
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
