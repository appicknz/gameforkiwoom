// ── 텔레그램 설정 ────────────────────────────────────────────────
const FALLBACK_BETTING_CHANNEL = "-1004471984422"

/**
 * 봇 토큰은 반드시 TELEGRAM_BOT_TOKEN 환경변수에서만 읽습니다.
 * (과거 소스에 하드코딩돼 있던 토큰은 노출된 값이라 완전히 제거했습니다 — 반드시 새 토큰을 env에 설정하세요.)
 */
export function getBotToken(): string {
  const v = process.env.TELEGRAM_BOT_TOKEN
  if (!v || v === "undefined") {
    console.error("[telegram] TELEGRAM_BOT_TOKEN 환경변수가 설정되지 않았습니다.")
    return ""
  }
  return v
}

function getBettingChannelId(): string {
  const v = process.env.TELEGRAM_BETTING_CHANNEL_ID
  if (!v || v === "undefined") return FALLBACK_BETTING_CHANNEL
  return v
}

// ── 가입 필수 채널(코인레이스 조인) 설정 ──────────────────────────
// chat.id는 실제 채널 관리자 등록 후 getUpdates로 확인한 값 (2024-xx 확인)
const FALLBACK_JOIN_CHANNEL_ID = "-1004354629908"

function getJoinChannelId(): string {
  const v = process.env.TELEGRAM_JOIN_CHANNEL_ID
  if (!v || v === "undefined") return FALLBACK_JOIN_CHANNEL_ID
  return v
}

/** 딥링크/안내에 노출할 채널 @username (https://t.me/<username>) */
export function getJoinChannelUsername(): string {
  return process.env.TELEGRAM_JOIN_CHANNEL_USERNAME || "coinracejoin"
}

// 봇 @username은 warm 람다 인스턴스 동안 캐시 (getMe 재호출 방지)
let cachedBotUsername: string | null = null

/** 딥링크(https://t.me/<bot>?start=...) 생성에 필요한 봇 @username 조회 */
export async function getBotUsername(): Promise<string | null> {
  if (cachedBotUsername) return cachedBotUsername
  const token = getBotToken()
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const data = await res.json()
    if (data.ok && data.result?.username) {
      cachedBotUsername = data.result.username as string
      return cachedBotUsername
    }
    console.error("[telegram] getMe 실패:", data.description)
    return null
  } catch (err) {
    console.error("[telegram] getMe fetch error:", err)
    return null
  }
}

/**
 * 특정 텔레그램 유저가 가입 필수 채널의 멤버인지 확인합니다.
 * 봇이 해당 채널의 관리자로 등록되어 있어야 정상 동작합니다.
 */
export async function isJoinChannelMember(telegramUserId: number | string): Promise<boolean> {
  const token  = getBotToken()
  const chatId = getJoinChannelId()
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${telegramUserId}`,
    )
    const data = await res.json()
    if (!data.ok) {
      console.error("[telegram] getChatMember 실패:", data.description)
      return false
    }
    const status = data.result?.status as string | undefined
    // creator/administrator/member: 정상 멤버, restricted: 제한은 있지만 여전히 채널 소속
    return ["creator", "administrator", "member", "restricted"].includes(status ?? "")
  } catch (err) {
    console.error("[telegram] getChatMember fetch error:", err)
    return false
  }
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
