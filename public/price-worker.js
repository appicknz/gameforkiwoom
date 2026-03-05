/**
 * SharedWorker: Binance aggTrade WebSocket을 단 하나만 열고
 * 연결된 모든 탭/페이지에 동일한 가격 데이터를 브로드캐스트합니다.
 */

const ports = new Set()
let ws = null
let reconnectTimer = null

function broadcast(msg) {
  for (const port of ports) {
    try {
      port.postMessage(msg)
    } catch (e) {
      ports.delete(port)
    }
  }
}

function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return

  ws = new WebSocket("wss://fstream.binance.com/ws/btcusdt@aggTrade")

  ws.onopen = () => {
    broadcast({ type: "connected" })
  }

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    broadcast({
      type: "trade",
      price: parseFloat(msg.p),
      quantity: parseFloat(msg.q),
      time: Math.floor(msg.T / 1000),
    })
  }

  ws.onerror = () => {
    broadcast({ type: "disconnected" })
  }

  ws.onclose = () => {
    broadcast({ type: "disconnected" })
    // 3초 후 재연결
    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, 3000)
  }
}

// 새 탭이 연결될 때
self.onconnect = (e) => {
  const port = e.ports[0]
  ports.add(port)

  port.onmessage = (ev) => {
    if (ev.data?.type === "ping") {
      port.postMessage({ type: "pong" })
    }
  }

  port.onmessageerror = () => ports.delete(port)

  // 최초 연결 시 WebSocket 시작
  connect()

  port.start()
}
