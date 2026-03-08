import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const CHAT_KEY = "bitbet:chat:messages"
const MAX_MESSAGES = 200

export interface ChatMessage {
  id: string
  nickname: string
  text: string
  createdAt: number
}

export async function GET() {
  try {
    const messages = await redis.lrange<ChatMessage>(CHAT_KEY, 0, MAX_MESSAGES - 1)
    return NextResponse.json({ messages: messages.reverse() })
  } catch {
    return NextResponse.json({ messages: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { nickname, text } = await req.json()
    if (!text?.trim() || !nickname?.trim()) {
      return NextResponse.json({ error: "Invalid" }, { status: 400 })
    }
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nickname: nickname.trim().slice(0, 20),
      text: text.trim().slice(0, 300),
      createdAt: Date.now(),
    }
    await redis.lpush(CHAT_KEY, msg)
    await redis.ltrim(CHAT_KEY, 0, MAX_MESSAGES - 1)
    return NextResponse.json({ message: msg })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
