import { createHash, timingSafeEqual } from "node:crypto"

// ── 텔레그램 설정 ────────────────────────────────────────────────
// env 파일이 sync로 덮어쓰이는 경우를 대비해 상수로 fallback 고정
const FALLBACK_BOT_TOKEN      = "8850131651:AAEEvBYRa5dym7lC3To2ajbjLpcVUmMyvlI"
const FALLBACK_BETTING_CHANNEL = "-1004471984422"

export function getBotToken(): string {
  const v = process.env.TELEGRAM_BOT_TOKEN
  // 구버전 토큰이 env에 세팅돼 있는 경우 fallback 사용
  if (!v || v.startsWith("8902120234") || v === "undefined") return FALLBACK_BOT_TOKEN
  return v
}

export function getTelegramWebhookSecret(): string {
  const source = process.env.INTERNAL_SECRET ?? getBotToken()
  return createHash("sha256").update(`telegram-webhook:${source}`).digest("hex")
}

export function verifyTelegramWebhookSecret(value: string | null): boolean {
  if (!value) return false
  const expected = Buffer.from(getTelegramWebhookSecret())
  const received = Buffer.from(value)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

function getBettingChannelId(): string {
  const v = process.env.TELEGRAM_BETTING_CHANNEL_ID
  if (!v || v === "undefined") return FALLBACK_BETTING_CHANNEL
  return v
}

// ── 공용 메시지 전송 ─────────────────────────────────────────────

export async function sendTelegramMessage(
  message: string,
  botToken?: string,
  chatId?: string,
) {
  const token = botToken ?? process.env.TELEGRAM_BOT_TOKEN
  const chat  = chatId  ?? process.env.TELEGRAM_CHAT_ID

  if (!token || !chat) {
    console.error("[telegram] BOT_TOKEN or CHAT_ID not configured")
    return false
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: message,
        parse_mode: "HTML",
      }),
    })
    const data = await res.json()
    if (!data.ok) {
      console.error("[telegram] API error:", data.description)
      return false
    }
    return true
  } catch (err) {
    console.error("[telegram] fetch error:", err)
    return false
  }
}

// ── 바카라 배팅 채널 전용 함수들 ────────────────────────────────────

/** 라운드 시작 시 배팅 버튼 메시지 전송 */
export async function sendBaccaratBettingMessage(params: {
  roundNumber: number
  bankerOdds: number
  playerOdds: number
  tieOdds: number
}): Promise<{ ok: boolean; messageId?: number }> {
  const token  = getBotToken()
  const chatId = getBettingChannelId()

  console.log("[telegram/betting] token_prefix:", token.slice(0, 10), "chatId:", chatId)

  const { roundNumber, bankerOdds, playerOdds, tieOdds } = params

  const text =
    `🎲 <b>Round ${roundNumber}</b> — 배팅을 시작하세요!\n\n` +
    `뱅커 <b>${bankerOdds.toFixed(2)}x</b>  |  플레이어 <b>${playerOdds.toFixed(2)}x</b>  |  타이 <b>${tieOdds.toFixed(2)}x</b>\n\n` +
    `아래 버튼을 눌러 배팅하세요. 라운드당 1회만 가능합니다.`

  const inline_keyboard = [[
    { text: `🔵 뱅커  ${bankerOdds.toFixed(2)}x`,      callback_data: `bet:banker:${roundNumber}` },
    { text: `🟢 플레이어  ${playerOdds.toFixed(2)}x`,  callback_data: `bet:player:${roundNumber}` },
    { text: `🟡 타이  ${tieOdds.toFixed(2)}x`,          callback_data: `bet:tie:${roundNumber}` },
  ]]

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard },
      }),
    })
    const data = await res.json()
    if (!data.ok) {
      console.error("[telegram/betting] sendBettingMessage error:", data.description, "| chatId:", chatId)
      return { ok: false }
    }
    console.log("[telegram/betting] sent ok, messageId:", data.result?.message_id)
    return { ok: true, messageId: data.result?.message_id }
  } catch (err) {
    console.error("[telegram/betting] fetch error:", err)
    return { ok: false }
  }
}

/** 라운드 결과 메시지 전송 */
export async function sendBaccaratResultMessage(params: {
  roundNumber: number
  result: "banker" | "player" | "tie"
  bankerOdds: number
  playerOdds: number
  tieOdds: number
  betSummary: { banker: number; player: number; tie: number }
}): Promise<boolean> {
  const token  = getBotToken()
  const chatId = getBettingChannelId()

  const { roundNumber, result, bankerOdds, playerOdds, tieOdds, betSummary } = params

  const resultLabel: Record<string, string> = {
    banker: "🔵 뱅커",
    player: "🟢 플레이어",
    tie:    "🟡 타이",
  }

  const wonOdds = result === "banker" ? bankerOdds : result === "player" ? playerOdds : tieOdds
  const total   = betSummary.banker + betSummary.player + betSummary.tie

  const text =
    `🏁 <b>Round ${roundNumber} 결과</b>\n\n` +
    `결과: <b>${resultLabel[result] ?? result}</b>  (${wonOdds.toFixed(2)}x)\n\n` +
    `📊 배팅 현황 (총 ${total}명)\n` +
    `뱅커 ${betSummary.banker}명  |  플레이어 ${betSummary.player}명  |  타이 ${betSummary.tie}명`

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    })
    const data = await res.json()
    if (!data.ok) {
      console.error("[telegram/betting] sendResultMessage error:", data.description)
      return false
    }
    return true
  } catch (err) {
    console.error("[telegram/betting] fetch error:", err)
    return false
  }
}

/** callback_query 응답 (버튼 클릭 피드백) */
export async function answerCallbackQuery(callbackQueryId: string, text: string, showAlert = false): Promise<void> {
  const token = getBotToken()
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: showAlert }),
  }).catch(() => {})
}

/** 개인 DM으로 배팅 결과 전송 */
export async function sendDirectMessage(telegramId: string, text: string): Promise<void> {
  const token = getBotToken()
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: telegramId, text, parse_mode: "HTML" }),
  }).catch(() => {})
}
