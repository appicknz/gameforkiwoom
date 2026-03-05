import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /sogirl 경로 — Supabase Auth 무관, 자체 쿠키로 보호
  if (pathname.startsWith('/sogirl')) {
    // /sogirl/login 은 항상 접근 허용
    if (pathname === '/sogirl/login') {
      return NextResponse.next()
    }
    // 그 외 /sogirl/* 는 쿠키 체크
    const adminCookie = request.cookies.get('sogirl_admin')
    if (adminCookie?.value !== '1') {
      const url = request.nextUrl.clone()
      url.pathname = '/sogirl/login'
      return NextResponse.redirect(url)
    }
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
