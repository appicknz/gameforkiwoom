import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// 로그인 없이도 접근 가능한 경로
const PUBLIC_PATHS = ["/market", "/api/market/items", "/api/market/categories"]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 퍼블릭 경로는 통과
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 보호된 페이지: /purchases, /seller, /settlement, /deposit
  const PROTECTED = ["/purchases", "/seller", "/settlement", "/deposit"]
  if (PROTECTED.some(p => pathname.startsWith(p))) {
    const token = request.cookies.get("app_token")?.value
      ?? request.headers.get("authorization")?.replace("Bearer ", "")

    if (!token) {
      const url = request.nextUrl.clone()
      url.pathname = "/market"
      url.searchParams.set("auth", "login")
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/purchases/:path*", "/seller/:path*", "/settlement/:path*", "/deposit/:path*"],
}
