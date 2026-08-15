import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { deriveWalletAddress } from "@/lib/solana-wallet"
import { getBotToken } from "@/lib/telegram"
import jwt from "jsonwebtoken"
import { randomUUID } from "crypto"

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? process.env.INTERNAL_SECRET ?? "fallback-secret"

export interface NormalizedTelegramUser {
  id: string
  firstName: string
  lastName?: string
  username?: string
  photoUrl?: string
}

export interface TelegramSessionResult {
  appToken: string
  username: string
  role: string
}

/**
 * 텔레그램 인증(위젯/OIDC 공용)이 끝난 뒤 계정을 조회/생성하고 앱 세션 토큰을 발급한다.
 * 위젯 로그인과 신규 OIDC 로그인 라우트에서 공통으로 사용한다.
 */
export async function upsertTelegramProfileAndIssueToken(
  user: NormalizedTelegramUser,
): Promise<TelegramSessionResult | { error: string }> {
  const telegramId = user.id
  const firstName = user.firstName
  const lastName = user.lastName
  const username = user.username
  const photoUrl = user.photoUrl
  const botToken = getBotToken()

  const { data: existing } = await adminSupabase
    .from("profiles")
    .select("id, username, role, session_version")
    .eq("telegram_id", telegramId)
    .maybeSingle()

  let userId: string
  let appUsername: string
  let role: string

  if (existing) {
    userId = existing.id
    appUsername = existing.username
    role = existing.role

    await adminSupabase
      .from("profiles")
      .update({
        telegram_username: username ?? null,
        telegram_first_name: firstName || null,
        telegram_last_name: lastName ?? null,
        telegram_photo_url: photoUrl ?? null,
        telegram_linked_at: new Date().toISOString(),
      })
      .eq("id", userId)
  } else {
    const baseName = username ? `tg_${username}` : `tg_${telegramId}`
    let finalUsername = baseName
    const { data: dup } = await adminSupabase.from("profiles").select("id").eq("username", baseName).maybeSingle()
    if (dup) finalUsername = `${baseName}_${Date.now().toString(36)}`

    const uid = randomUUID()
    const email = `${uid}@noreply.app`
    const password = randomUUID()

    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: finalUsername },
    })
    if (authError || !authData.user) {
      return { error: "계정 생성 실패: " + (authError?.message ?? "") }
    }

    userId = authData.user.id
    appUsername = finalUsername
    role = "user"

    let walletIndex: number | null = null
    let walletAddress: string | null = null
    if (process.env.SOLANA_HD_SEED) {
      const { data: maxRow } = await adminSupabase
        .from("profiles")
        .select("wallet_index")
        .not("wallet_index", "is", null)
        .order("wallet_index", { ascending: false })
        .limit(1)
        .single()
      walletIndex = (maxRow?.wallet_index ?? -1) + 1
      walletAddress = deriveWalletAddress(walletIndex)
    }

    const profileData: Record<string, unknown> = {
      id: userId,
      username: finalUsername,
      role: "user",
      telegram_id: telegramId,
      telegram_username: username ?? null,
      telegram_first_name: firstName || null,
      telegram_last_name: lastName ?? null,
      telegram_photo_url: photoUrl ?? null,
      telegram_linked_at: new Date().toISOString(),
    }
    if (walletIndex !== null) profileData.wallet_index = walletIndex
    if (walletAddress !== null) profileData.wallet_address = walletAddress

    const { error: profileError } = await adminSupabase.from("profiles").upsert(profileData)
    if (profileError) {
      await adminSupabase.auth.admin.deleteUser(userId)
      return { error: "프로필 저장 실패: " + profileError.message }
    }

    await adminSupabase.from("balances").upsert({ user_id: userId, amount: 0 })

    const chatId = process.env.TELEGRAM_CHAT_ID
    if (chatId) {
      const msg = `신규 텔레그램 가입\n이름: ${firstName}${lastName ? " " + lastName : ""}\n@${username ?? telegramId}\nID: ${telegramId}`
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: msg }),
      }).catch(() => {})
    }
  }

  const { data: profileForSv } = await adminSupabase
    .from("profiles")
    .select("session_version")
    .eq("id", userId)
    .single()
  const nextSv = ((profileForSv as any)?.session_version ?? 0) + 1
  await adminSupabase.from("profiles").update({ session_version: nextSv }).eq("id", userId)

  const appToken = jwt.sign({ sub: userId, sv: nextSv, role }, JWT_SECRET, { expiresIn: "30d" })

  return { appToken, username: appUsername, role }
}
