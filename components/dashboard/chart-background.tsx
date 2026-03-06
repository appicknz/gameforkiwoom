"use client"

import { useEffect, useRef } from "react"

interface Dot {
  x: number
  y: number
  opacity: number
  size: number
  birth: number
}

interface Radar {
  cx: number
  cy: number
  maxR: number
  angle: number
  speed: number
}

interface Jet {
  x: number
  y: number
  vx: number
  vy: number
  scale: number
  opacity: number
}

export function ChartBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animId: number
    const dots: Dot[] = []
    const jets: Jet[] = []

    // 레이더: 1~3개, 각각 랜덤 위치/크기/속도
    let radars: Radar[] = []

    const initRadars = (w: number, h: number) => {
      const count = 1 + Math.floor(Math.random() * 3) // 1~3개
      radars = Array.from({ length: count }, () => ({
        cx: w * (0.15 + Math.random() * 0.7),
        cy: h * (0.15 + Math.random() * 0.7),
        maxR: Math.min(w, h) * (0.12 + Math.random() * 0.28),
        angle: Math.random() * Math.PI * 2,
        speed: 0.010 + Math.random() * 0.022,
      }))
    }

    const spawnJet = (w: number, h: number) => {
      const fromLeft = Math.random() > 0.35
      const speed = 0.8 + Math.random() * 2.5        // 0.8 ~ 3.3 (매우 다양)
      const scale = 0.35 + Math.random() * 0.55       // 0.35 ~ 0.9 (크기 다양)
      const j: Jet = fromLeft
        ? {
            x: -60,
            y: h * (0.1 + Math.random() * 0.8),
            vx: speed,
            vy: (Math.random() - 0.5) * speed * 0.25,
            scale,
            opacity: 0,
          }
        : {
            x: w * (0.1 + Math.random() * 0.8),
            y: -40,
            vx: (Math.random() - 0.5) * speed * 0.25,
            vy: speed,
            scale,
            opacity: 0,
          }
      jets.push(j)
    }

    const drawJet = (ctx: CanvasRenderingContext2D, j: Jet) => {
      ctx.save()
      ctx.translate(j.x, j.y)
      const angle = Math.atan2(j.vy, j.vx)
      ctx.rotate(angle)
      ctx.scale(j.scale, j.scale)
      ctx.globalAlpha = j.opacity

      // 엔진 trail
      const g = ctx.createLinearGradient(-48, 0, -20, 0)
      g.addColorStop(0, "rgba(34,197,94,0)")
      g.addColorStop(1, "rgba(34,197,94,0.6)")
      ctx.strokeStyle = g
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-48, 0)
      ctx.lineTo(-28, 0)
      ctx.stroke()

      ctx.strokeStyle = "rgba(34,197,94,0.9)"
      ctx.fillStyle = "rgba(34,197,94,0.15)"
      ctx.lineWidth = 1

      // 동체
      ctx.beginPath()
      ctx.moveTo(28, 0)
      ctx.lineTo(10, -3)
      ctx.lineTo(-18, -2)
      ctx.lineTo(-28, 0)
      ctx.lineTo(-18, 2)
      ctx.lineTo(10, 3)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // 주날개
      ctx.beginPath()
      ctx.moveTo(2, -3)
      ctx.lineTo(-8, -18)
      ctx.lineTo(-20, -18)
      ctx.lineTo(-18, -2)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(2, 3)
      ctx.lineTo(-8, 18)
      ctx.lineTo(-20, 18)
      ctx.lineTo(-18, 2)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // 꼬리날개
      ctx.beginPath()
      ctx.moveTo(-16, -2)
      ctx.lineTo(-22, -10)
      ctx.lineTo(-26, -10)
      ctx.lineTo(-28, 0)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      ctx.restore()
    }

    // jet 생성 타이머: 각 jet마다 독립적인 interval
    const scheduleNextJet = (w: number, h: number) => {
      const delay = 1500 + Math.random() * 3000 // 1.5~4.5초 간격
      setTimeout(() => {
        const maxJets = 2 + Math.floor(Math.random() * 4) // 동시 최대 2~5개
        if (jets.length < maxJets) spawnJet(w, h)
        scheduleNextJet(w, h)
      }, delay)
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      canvas.width = rect.width * window.devicePixelRatio
      canvas.height = rect.height * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
      initRadars(rect.width, rect.height)
    }
    resize()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // 초기 jet 2~3개 바로 띄우기
    const rect = canvas.getBoundingClientRect()
    const initW = rect.width || 600
    const initH = rect.height || 180
    spawnJet(initW, initH)
    if (Math.random() > 0.4) spawnJet(initW, initH)
    scheduleNextJet(initW, initH)

    let stopped = false

    const draw = (ts: number) => {
      if (stopped) return
      const w = canvas.width / window.devicePixelRatio
      const h = canvas.height / window.devicePixelRatio
      if (w === 0 || h === 0) { animId = requestAnimationFrame(draw); return }

      ctx.clearRect(0, 0, w, h)

      // ── 레이더들 ──────────────────────────────────────────
      for (const radar of radars) {
        const { cx, cy, maxR } = radar
        radar.angle = (radar.angle + radar.speed) % (Math.PI * 2)
        const ra = radar.angle

        // 동심원
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath()
          ctx.arc(cx, cy, (maxR / 3) * i, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(34,197,94,${0.05 + i * 0.02})`
          ctx.lineWidth = 0.7
          ctx.stroke()
        }

        // 십자선
        ctx.strokeStyle = "rgba(34,197,94,0.07)"
        ctx.lineWidth = 0.5
        ctx.beginPath()
        ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy)
        ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR)
        ctx.stroke()

        // 스위프 부채꼴
        const sweepLength = Math.PI * 0.55
        const steps = 28
        for (let s = 0; s < steps; s++) {
          const a0 = ra - sweepLength * (s / steps)
          const a1 = ra - sweepLength * ((s + 1) / steps)
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.arc(cx, cy, maxR, a0, a1, true)
          ctx.closePath()
          ctx.fillStyle = `rgba(34,197,94,${(1 - s / steps) * 0.16})`
          ctx.fill()
        }

        // 스위프 선
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(ra) * maxR, cy + Math.sin(ra) * maxR)
        ctx.strokeStyle = "rgba(34,197,94,0.45)"
        ctx.lineWidth = 1
        ctx.stroke()

        // 점 생성
        if (Math.random() < 0.10) {
          const dist = maxR * (0.25 + Math.random() * 0.7)
          const angle = ra + (Math.random() - 0.5) * 0.18
          dots.push({
            x: cx + Math.cos(angle) * dist,
            y: cy + Math.sin(angle) * dist,
            opacity: 1,
            size: 1.2 + Math.random() * 2.5,
            birth: ts,
          })
        }
      }

      // ── 점 그리기 & 페이드 ──────────────────────────────
      for (let i = dots.length - 1; i >= 0; i--) {
        const d = dots[i]
        const age = (ts - d.birth) / 1000
        d.opacity = Math.max(0, 1 - age / 2.5)
        if (d.opacity <= 0) { dots.splice(i, 1); continue }

        ctx.beginPath()
        ctx.arc(d.x, d.y, d.size * 2, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(34,197,94,${d.opacity * 0.35})`
        ctx.lineWidth = 0.7
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(34,197,94,${d.opacity})`
        ctx.fill()
      }

      // ── 전투기들 ─────────────────────────────────────────
      for (let i = jets.length - 1; i >= 0; i--) {
        const j = jets[i]
        j.x += j.vx
        j.y += j.vy
        j.opacity = Math.min(1, j.opacity + 0.05)

        const offscreen = j.x > w + 100 || j.y > h + 100 || j.x < -100 || j.y < -100
        if (offscreen) {
          jets.splice(i, 1)
        } else {
          drawJet(ctx, j)
        }
      }

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)

    return () => {
      stopped = true
      cancelAnimationFrame(animId)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}
