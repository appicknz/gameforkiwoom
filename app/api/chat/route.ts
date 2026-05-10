export const dynamic = "force-dynamic"
import { redis } from "@/lib/redis"
import { NextRequest, NextResponse } from "next/server"

const CHAT_KEY    = "bitbet:chat:messages"
const VERSION_KEY = "bitbet:chat:version"
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
    // 메시지 저장 + 버전 카운터 incr (SSE 클라이언트 깨우기)
    await Promise.all([
      redis.lpush(CHAT_KEY, msg),
      redis.incr(VERSION_KEY),
    ])
    await redis.ltrim(CHAT_KEY, 0, MAX_MESSAGES - 1)
    return NextResponse.json({ message: msg })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
