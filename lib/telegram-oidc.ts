import "server-only"
import { createRemoteJWKSet, jwtVerify } from "jose"

// https://core.telegram.org/bots/telegram-login (신규 OIDC 로그인)
// telegram-login.js가 클라이언트에서 돌려주는 id_token은 서명 검증 전에는
// 신뢰할 수 없다 (라이브러리 자체도 base64 디코딩만 하고 서명 검증은 안 함).
// 반드시 서버에서 JWKS로 서명을 검증한 뒤 클레임을 사용해야 한다.

const JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json"
const ISSUER = "https://oauth.telegram.org"

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(JWKS_URL))
  return jwks
}

export interface TelegramOidcClaims {
  sub: string
  aud: string
  iss: string
  iat: number
  exp: number
  id: number
  name?: string
  given_name?: string
  family_name?: string
  preferred_username?: string
  picture?: string
  phone_number?: string
  phone_number_verified?: boolean
}

/**
 * id_token(JWT)의 서명/발행자/대상(aud=client_id=bot id)을 검증하고
 * 검증된 클레임을 반환한다. 실패 시 null.
 */
export async function verifyTelegramIdToken(idToken: string, expectedClientId: string): Promise<TelegramOidcClaims | null> {
  try {
    const { payload } = await jwtVerify(idToken, getJwks(), {
      issuer: ISSUER,
      audience: expectedClientId,
    })
    if (!payload.id || typeof payload.id !== "number") return null
    return payload as unknown as TelegramOidcClaims
  } catch {
    return null
  }
}
