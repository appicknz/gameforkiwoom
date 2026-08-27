"use client"

/**
 * use-gateway.ts
 *
 * Railway WS 게이트웨이 단일 연결 훅.
 * balance / chat / odds:baccarat / odds:race 채널을 하나의 WebSocket으로 구독.
 *
 * 이전: 유저당 SSE 3개 → Vercel Function 3개 점유
 * 이후: 유저당 WS 1개 → Railway 단일 프로세스가 수만 연결 처리
 */

import { useEffect, useRef, useCallback } from "react"

const RAILWAY_WS_URL = process.env.NEXT_PUBLIC_PRICE_SERVER_URL
  ? process.env.NEXT_PUBLIC_PRICE_SERVER_URL.replace(/^http/, "ws")
  : null

// ─── 전역 싱글톤 WS 인스턴스 ─────────────────────────────────────────
// 같은 페이지에서 여러 컴포넌트가 훅을 호출해도 WS는 1개만 유지
let gWs: WebSocket | null = null
let gToken: string | null = null
let gReconnectTimer: ReturnType<typeof setTimeout> | null = null
const gListeners = new Map<string, Set<(data: unknown) => void>>()
// 등록된 모든 채널을 추적 — 재연결 시 전체 재구독, CONNECTING 중 버퍼링
const gRegisteredChannels = new Set<string>()

function emit(channel: string, data: unknown) {
  const subs = gListeners.get(channel)
  if (subs) for (const fn of subs) fn(data)
}

function subscribe(channel: string, fn: (data: unknown) => void) {
  if (!gListeners.has(channel)) gListeners.set(channel, new Set())
  gListeners.get(channel)!.add(fn)
  return () => gListeners.get(channel)?.delete(fn)
}

function getToken(): string | null {
  try { return localStorage.getItem("auth_token") } catch { return null }
}

function sendAllChannels(ws: WebSocket) {
  const all = Array.from(gRegisteredChannels)
  if (all.length > 0) ws.send(JSON.stringify({ action: "subscribe", channels: all }))
}

function openGateway(channels: string[]) {
  if (!RAILWAY_WS_URL) return
  const token = getToken()
  if (!token) return

  // 요청 채널을 전역 집합에 등록
  channels.forEach(ch => gRegisteredChannels.add(ch))

  // 이미 연결된 상태면 새 채널만 추가 구독
  if (gWs && gWs.readyState === WebSocket.OPEN) {
    gWs.send(JSON.stringify({ action: "subscribe", channels }))
    return
  }

  // 연결 중이면 채널만 등록하고 대기 (onopen에서 일괄 구독)
  if (gWs && gWs.readyState === WebSocket.CONNECTING) return

  gToken = token
  const url = `${RAILWAY_WS_URL}?mode=gateway&token=${encodeURIComponent(token)}`
  const ws  = new WebSocket(url)
  gWs = ws

  ws.onopen = () => {
    if (gReconnectTimer) { clearTimeout(gReconnectTimer); gReconnectTimer = null }
    // 등록된 모든 채널을 한번에 구독 (CONNECTING 중 누락된 채널 포함)
    sendAllChannels(ws)
  }

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      const { type, ...rest } = msg

      if (type === "balance")  emit("balance",  rest.balance)
      if (type === "chat")     emit("chat",     rest.messages)
      if (type === "odds")     emit(`odds:${rest.gameType}`, rest)
      if (type === "error" && rest.code === "UNAUTHORIZED") {
        ws.close()
      }
    } catch {}
  }

  ws.onclose = () => {
    gWs = null
    // 3초 후 재연결 — 등록된 전체 채널로 재구독
    gReconnectTimer = setTimeout(() => openGateway([]), 3_000)
  }

  ws.onerror = () => ws.close()
}

// ─── 공개 훅 ────────────────────────────────────────────────────────

/** balance 구독 훅 */
export function useGatewayBalance(onBalance: (balance: number) => void) {
  const cbRef = useRef(onBalance)
  cbRef.current = onBalance

  useEffect(() => {
    const token = getToken()
    if (!token || !RAILWAY_WS_URL) return

    openGateway(["balance"])
    const unsub = subscribe("balance", (v) => cbRef.current(v as number))
    return () => { unsub(); }
  }, [])
}

/** chat 구독 훅 */
export function useGatewayChat(onMessages: (messages: unknown[]) => void) {
  const cbRef = useRef(onMessages)
  cbRef.current = onMessages

  useEffect(() => {
    openGateway(["chat"])
    const unsub = subscribe("chat", (v) => cbRef.current(v as unknown[]))
    return () => { unsub(); }
  }, [])
}

/** odds 구독 훅 */
export function useGatewayOdds(
  gameType: "baccarat" | "race",
  onOdds: (data: unknown) => void,
) {
  const cbRef = useRef(onOdds)
  cbRef.current = onOdds

  useEffect(() => {
    openGateway([`odds:${gameType}`])
    const unsub = subscribe(`odds:${gameType}`, (v) => cbRef.current(v))
    return () => { unsub(); }
  }, [gameType])
}
