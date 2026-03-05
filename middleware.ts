import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /sogirl 경로 — 인증 없이 바로 접근 허용
  if (pathname.startsWith('/sogirl')) {
    return NextResponse.next()
  }

  // 나머지 경로는 Supabase 세션 처리
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/).*)',
  ],
}
