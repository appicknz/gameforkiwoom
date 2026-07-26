export const dynamic = "force-dynamic"
/**
 * POST /api/auto-trading/setup
 * auto_trading_accounts, auto_trading_global_settings 테이블 생성
 * 최초 1회 실행 (패널 자동주문 탭에서 호출)
 */
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

export async function POST(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })
  if (session.role !== "master") return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  const projectRef  = supabaseUrl.replace("https://", "").split(".")[0]

  const ddl = `
    CREATE TABLE IF NOT EXISTS auto_trading_global_settings (
      id          INT PRIMARY KEY DEFAULT 1,
      webhook_url TEXT NOT NULL DEFAULT '',
      enabled     BOOL NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ DEFAULT now(),
      updated_at  TIMESTAMPTZ DEFAULT now()
    );
    INSERT INTO auto_trading_global_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS auto_trading_accounts (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_name         TEXT NOT NULL UNIQUE,
      auth_token           TEXT NOT NULL DEFAULT '',
      leverage             INT NOT NULL DEFAULT 20,
      base_amount          NUMERIC NOT NULL DEFAULT 100,
      enabled              BOOL NOT NULL DEFAULT true,
      take_profit_enabled  BOOL NOT NULL DEFAULT false,
      take_profit_percent  NUMERIC DEFAULT NULL,
      stop_loss_enabled    BOOL NOT NULL DEFAULT false,
      stop_loss_percent    NUMERIC DEFAULT NULL,
      memo                 TEXT DEFAULT '',
      created_at           TIMESTAMPTZ DEFAULT now(),
      updated_at           TIMESTAMPTZ DEFAULT now()
    );
  `

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: ddl }),
    }
  )

  const raw = await res.text()
  if (!res.ok) {
    return NextResponse.json({
      ok:      false,
      message: "Management API 인증 실패. Supabase 대시보드 SQL Editor에서 직접 실행하세요.",
      ddl,
      raw:     raw.slice(0, 300),
    })
  }

  return NextResponse.json({ ok: true, message: "테이블 생성 완료" })
}
