const TG_API = "https://api.telegram.org"

export async function sendPayTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  inlineKeyboard?: { text: string; callback_data: string }[][],
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  }
  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard }
  }

  const res = await fetch(`${TG_API}/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function answerPayCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text: string,
) {
  await fetch(`${TG_API}/bot${botToken}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: true }),
  })
}

export async function editPayMessage(
  botToken: string,
  chatId: string,
  messageId: number,
  text: string,
  inlineKeyboard?: { text: string; callback_data: string }[][],
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  }
  if (inlineKeyboard !== undefined) {
    body.reply_markup = { inline_keyboard: inlineKeyboard }
  }
  await fetch(`${TG_API}/bot${botToken}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export async function setPayWebhook(botToken: string, webhookUrl: string) {
  const res = await fetch(`${TG_API}/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, allowed_updates: ["callback_query", "message"] }),
  })
  return res.json()
}
