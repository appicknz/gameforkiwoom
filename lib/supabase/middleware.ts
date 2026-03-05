import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // 세션 갱신 — getUser() 이전에 다른 코드 삽입 금지
  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // /와 /game은 누구나 접근 가능 (공개 페이지)
  // /branch, /sogirl은 로그인 필요 (관리자 전용)
  const isAdminRoute =
    pathname.startsWith('/branch') ||
    pathname.startsWith('/sogirl')

  const isAuthRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/register')

  // 비로그인 상태에서 관리자 경로 접근 → 로그인 페이지로
  if (isAdminRoute && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 로그인 상태에서 로그인/회원가입 페이지 접근 → 대시보드로
  if (isAuthRoute && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // 역할 기반 접근 제어는 각 페이지에서 처리

  return supabaseResponse
}
