import { createHash, createHmac } from "crypto"

export interface TelegramWidgetUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

/**
 * 텔레그램 로그인 위젯(Login Widget)에서 돌아온 사용자 데이터의 서명을 검증합니다.
 * https://core.telegram.org/widgets/login#checking-authorization
 *
 * 미니앱 initData 검증과는 다른 방식입니다:
 * - secret_key = SHA256(bot_token)  (미니앱은 HMAC-SHA256(bot_token, key="WebAppData"))
 */
export function verifyTelegramWidgetAuth(
  data: Record<string, string | number | undefined>,
  botToken: string,
  maxAgeSeconds = 86400,
): boolean {
  try {
    const { hash, ...rest } = data
    if (!hash || typeof hash !== "string") return false

    const authDate = Number(rest.auth_date)
    if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return false

    const checkString = Object.keys(rest)
      .filter((k) => rest[k] !== undefined && rest[k] !== null)
      .sort()
      .map((k) => `${k}=${rest[k]}`)
      .join("\n")

    const secretKey = createHash("sha256").update(botToken).digest()
    const expectedHash = createHmac("sha256", secretKey).update(checkString).digest("hex")

    return expectedHash === hash
  } catch {
    return false
  }
}
