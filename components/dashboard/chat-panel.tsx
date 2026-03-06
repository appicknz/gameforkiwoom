"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Send, MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/app/api/chat/route"

const NICKNAME_KEY = "bitbet:chat:nickname"

function getRandomNickname() {
  const adj = ["빠른", "강한", "용감한", "날카로운", "조용한", "빛나는"]
  const noun = ["비트", "코인", "트레이더", "투자자", "고수", "챔피언"]
  return adj[Math.floor(Math.random() * adj.length)] + noun[Math.floor(Math.random() * noun.length)]
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function ChatPanel({ onClose }: { onClose?: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState("")
  const [nickname, setNickname] = useState("")
  const [editingNick, setEditingNick] = useState(false)
  const [nickInput, setNickInput] = useState("")
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastIdRef = useRef<string | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // 닉네임 초기화
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NICKNAME_KEY)
      if (saved) { setNickname(saved); return }
    } catch {}
    const nick = getRandomNickname()
    setNickname(nick)
    try { localStorage.setItem(NICKNAME_KEY, nick) } catch {}
  }, [])

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/chat")
      const data = await res.json()
      const msgs: ChatMessage[] = data.messages ?? []
      setMessages((prev) => {
        if (prev.length === msgs.length && prev[prev.length - 1]?.id === msgs[msgs.length - 1]?.id) return prev
        return msgs
      })
    } catch {}
  }, [])

  // 폴링 (2초)
  useEffect(() => {
    fetchMessages()
    pollRef.current = setInterval(fetchMessages, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchMessages])

  // 새 메시지 오면 스크롤
  useEffect(() => {
    const latest = messages[messages.length - 1]
    if (latest && latest.id !== lastIdRef.current) {
      lastIdRef.current = latest.id
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  const handleSend = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, text }),
      })
      setText("")
      await fetchMessages()
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const saveNickname = () => {
    const n = nickInput.trim().slice(0, 20)
    if (!n) return
    setNickname(n)
    try { localStorage.setItem(NICKNAME_KEY, n) } catch {}
    setEditingNick(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <MessageCircle className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">실시간 채팅</span>
        <span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
          {messages.length}
        </span>
      </div>

      {/* 닉네임 */}
      <div className="px-4 py-2 border-b border-border bg-secondary/30 shrink-0">
        {editingNick ? (
          <div className="flex gap-2 items-center">
            <input
              value={nickInput}
              onChange={e => setNickInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveNickname()}
              placeholder="닉네임 (최대 20자)"
              maxLength={20}
              className="flex-1 text-xs bg-background border border-border rounded px-2 py-1 outline-none focus:border-primary"
              autoFocus
            />
            <button onClick={saveNickname} className="text-xs text-primary font-medium">저장</button>
            <button onClick={() => setEditingNick(false)} className="text-xs text-muted-foreground">취소</button>
          </div>
        ) : (
          <button
            onClick={() => { setNickInput(nickname); setEditingNick(true) }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            닉네임: <span className="text-foreground font-medium">{nickname}</span> <span className="underline underline-offset-2">변경</span>
          </button>
        )}
      </div>

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            첫 번째 메시지를 보내보세요.
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.nickname === nickname
          return (
            <div key={msg.id} className={cn("flex flex-col gap-0.5", isMe && "items-end")}>
              <div className="flex items-center gap-1.5">
                {!isMe && (
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold text-primary">{msg.nickname[0]}</span>
                  </div>
                )}
                <span className="text-[10px] text-muted-foreground font-medium">{msg.nickname}</span>
                <span className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
              </div>
              <div className={cn(
                "max-w-[80%] px-3 py-1.5 rounded-2xl text-xs leading-relaxed break-words",
                isMe
                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                  : "bg-secondary text-foreground rounded-tl-sm"
              )}>
                {msg.text}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="px-3 py-3 border-t border-border shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지 입력..."
            rows={1}
            maxLength={300}
            className="flex-1 text-xs bg-secondary border border-border rounded-xl px-3 py-2 outline-none focus:border-primary resize-none leading-relaxed"
            style={{ minHeight: "36px", maxHeight: "80px" }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0",
              text.trim() && !sending
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
            )}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
