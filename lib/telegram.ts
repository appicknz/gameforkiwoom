export async function sendTelegramMessage(
  message: string,
  botToken?: string,
  chatId?: string,
) {
  const token = botToken ?? process.env.TELEGRAM_BOT_TOKEN
  const chat = chatId ?? process.env.TELEGRAM_CHAT_ID

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
