import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { deriveWalletAddress } from "@/lib/solana-wallet"
import { sendTelegramMessage } from "@/lib/telegram"
import jwt from "jsonwebtoken"
import { randomUUID } from "crypto"

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? process.env.INTERNAL_SECRET ?? "fallback-secret"

export interface TelegramDeepLinkUser {
  id: number
  username?: string
  first_name?: string
  last_name?: string
}

export interface LinkedTelegramAccount {
  userId: string
  username: string
  role: string
  appToken: string
}

/**
 * 텔레그램 딥링크(/start) 로그인 전용 계정 연동/생성 로직.
 * app/api/auth/telegram-login (Mini App initData 방식)과는 완전히 분리된 별도 구현으로,
 * 기존 Mini App 로그인 동작에는 영향을 주지 않습니다.
 */
export async function linkOrCreateTelegramAccount(
  tgUser: TelegramDeepLinkUser,
): Promise<LinkedTelegramAccount> {
  const telegramId = String(tgUser.id)

  const { data: existing } = await adminSupabase
    .from("profiles")
    .select("id, username, role, session_version")
    .eq("telegram_id", telegramId)
    .maybeSingle()

  let userId: string
  let username: string
  let role: string

  if (existing) {
    userId = existing.id
    username = existing.username
    role = existing.role

    await adminSupabase.from("profiles").update({
      telegram_username:   tgUser.username ?? null,
      telegram_first_name: tgUser.first_name ?? null,
      telegram_last_name:  tgUser.last_name ?? null,
      telegram_linked_at:  new Date().toISOString(),
    }).eq("id", userId)
  } else {
    const baseName = tgUser.username ? `tg_${tgUser.username}` : `tg_${telegramId}`

    let finalUsername = baseName
    const { data: dup } = await adminSupabase
      .from("profiles").select("id").eq("username", baseName).maybeSingle()
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
      throw new Error("계정 생성 실패: " + (authError?.message ?? ""))
    }

    userId = authData.user.id
    username = finalUsername
    role = "user"

    let walletIndex: number | null = null
    let walletAddress: string | null = null
    if (process.env.SOLANA_HD_SEED) {
      const { data: maxRow } = await adminSupabase
        .from("profiles").select("wallet_index")
        .not("wallet_index", "is", null)
        .order("wallet_index", { ascending: false })
        .limit(1).single()
      walletIndex = (maxRow?.wallet_index ?? -1) + 1
      walletAddress = deriveWalletAddress(walletIndex)
    }

    const profileData: Record<string, unknown> = {
      id: userId,
      username: finalUsername,
      role: "user",
      telegram_id: telegramId,
      telegram_username:   tgUser.username ?? null,
      telegram_first_name: tgUser.first_name ?? null,
      telegram_last_name:  tgUser.last_name ?? null,
      telegram_linked_at:  new Date().toISOString(),
    }
    if (walletIndex !== null) profileData.wallet_index = walletIndex
    if (walletAddress !== null) profileData.wallet_address = walletAddress

    const { error: profileError } = await adminSupabase.from("profiles").upsert(profileData)
    if (profileError) {
      await adminSupabase.auth.admin.deleteUser(userId)
      throw new Error("프로필 저장 실패: " + profileError.message)
    }

    await adminSupabase.from("balances").upsert({ user_id: userId, amount: 0 })

    const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || tgUser.first_name || "-"
    await sendTelegramMessage(
      `<b>신규 텔레그램 딥링크 가입</b>\n이름: ${name}\n@${tgUser.username ?? telegramId}\nID: ${telegramId}`,
    ).catch(() => {})
  }

  const { data: profileForSv } = await adminSupabase
    .from("profiles").select("session_version").eq("id", userId).single()
  const nextSv = ((profileForSv as { session_version?: number } | null)?.session_version ?? 0) + 1
  await adminSupabase.from("profiles").update({ session_version: nextSv }).eq("id", userId)

  const appToken = jwt.sign({ sub: userId, sv: nextSv, role }, JWT_SECRET, { expiresIn: "30d" })

  return { userId, username, role, appToken }
}
