import { NextRequest, NextResponse } from "next/server"
import { getMasterSettingsAction, saveMasterSettings } from "@/lib/pay/actions"

// GET — 현재 설정 조회
export async function GET() {
  const s = await getMasterSettingsAction()
  return NextResponse.json({
    webhookUrl:    s?.webhookUrl    ?? "",
    webhookSecret: s?.webhookSecret ?? "",
    siteId:        s?.siteId        ?? "",
    tgBtnText:     s?.tgBtnText     ?? "",
    tgBtnUrl:      s?.tgBtnUrl      ?? "",
  })
}

// POST — 설정 저장 (webhookUrl, webhookSecret, siteId, tgBtnText, tgBtnUrl)
export async function POST(req: NextRequest) {
  const body = await req.json()
  await saveMasterSettings({
    webhookUrl:    body.webhookUrl,
    webhookSecret: body.webhookSecret,
    siteId:        body.siteId,
    tgBtnText:     body.tgBtnText,
    tgBtnUrl:      body.tgBtnUrl,
  })
  return NextResponse.json({ ok: true })
}
