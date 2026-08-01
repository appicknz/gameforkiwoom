import { NextRequest, NextResponse } from "next/server"

/**
 * 관리자 패널에서 외부 웹훅을 테스트하는 서버사이드 프록시
 * 브라우저 → 이 API → 외부 웹훅 URL (CORS 우회)
 */
export async function POST(req: NextRequest) {
  let body: { url?: string; payload?: unknown; secret?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, status: 0, body: "Invalid JSON" }, { status: 400 })
  }

  const { url, payload, secret } = body
  if (!url) return NextResponse.json({ ok: false, status: 0, body: "url is required" }, { status: 400 })

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (secret) headers["x-webhook-secret"] = secret

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload ?? {}),
      signal: AbortSignal.timeout(15000),
    })

    let resBody = ""
    try { resBody = await res.text() } catch { resBody = "(empty)" }

    // JSON이면 pretty print
    let prettyBody = resBody
    try {
      prettyBody = JSON.stringify(JSON.parse(resBody), null, 2)
    } catch { /* plain text */ }

    return NextResponse.json({ ok: res.ok, status: res.status, body: prettyBody })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, status: 0, body: msg })
  }
}
