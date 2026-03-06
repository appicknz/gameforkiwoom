"use client"

import { useEffect, useRef } from "react"

interface Dot {
  x: number
  y: number
  angle: number
  dist: number
  opacity: number
  size: number
  birth: number
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
    let radarAngle = 0
    const dots: Dot[] = []
    let jet: Jet | null = null
    let jetTimer = 0

    const spawnJet = (w: number, h: number) => {
      // 랜덤으로 왼→오른 또는 위→아래 방향
      const fromLeft = Math.random() > 0.3
      jet = fromLeft
        ? { x: -60, y: h * (0.2 + Math.random() * 0.5), vx: 1.4 + Math.random() * 0.8, vy: (Math.random() - 0.5) * 0.3, scale: 0.55, opacity: 0 }
        : { x: w * (0.2 + Math.random() * 0.6), y: -40, vx: (Math.random() - 0.5) * 0.3, vy: 1.2 + Math.random() * 0.6, scale: 0.5, opacity: 0 }
    }

    const drawJet = (ctx: CanvasRenderingContext2D, j: Jet) => {
      ctx.save()
      ctx.translate(j.x, j.y)
      // vx/vy 방향으로 회전
      const angle = Math.atan2(j.vy, j.vx)
      ctx.rotate(angle)
      ctx.scale(j.scale, j.scale)
      ctx.globalAlpha = j.opacity

      const g = ctx.createLinearGradient(-30, 0, 30, 0)
      g.addColorStop(0, "rgba(34,197,94,0)")
      g.addColorStop(0.5, "rgba(34,197,94,0.7)")
      g.addColorStop(1, "rgba(34,197,94,0)")
      ctx.strokeStyle = g
      ctx.lineWidth = 1.5

      // 엔진 불꽃 trail
      ctx.beginPath()
      ctx.moveTo(-40, 0)
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

      // 수직 꼬리날개
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

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * window.devicePixelRatio
      canvas.height = rect.height * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    resize()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const draw = (ts: number) => {
      const w = canvas.width / window.devicePixelRatio
      const h = canvas.height / window.devicePixelRatio

      ctx.clearRect(0, 0, w, h)

      // ── 레이더 원 ─────────────────────────────────────────
      const cx = w * 0.82
      const cy = h * 0.42
      const maxR = Math.min(w, h) * 0.38

      // 동심원 (3개)
      for (let i = 1; i <= 3; i++) {
        const r = (maxR / 3) * i
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(34,197,94,${0.06 + i * 0.02})`
        ctx.lineWidth = 0.8
        ctx.stroke()
      }

      // 십자선
      ctx.strokeStyle = "rgba(34,197,94,0.08)"
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy)
      ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR)
      ctx.stroke()

      // 레이더 스위프 (그라디언트 부채꼴)
      radarAngle = (radarAngle + 0.018) % (Math.PI * 2)
      const sweepLength = Math.PI * 0.55
      const sweepGrad = ctx.createConicalGradient
        ? null // 브라우저 미지원 fallback 아래서 처리
        : null

      // conical gradient 미지원이므로 여러 삼각형으로 근사
      const steps = 30
      for (let s = 0; s < steps; s++) {
        const a0 = radarAngle - sweepLength * (s / steps)
        const a1 = radarAngle - sweepLength * ((s + 1) / steps)
        const alpha = (1 - s / steps) * 0.18
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, maxR, a0, a1, true)
        ctx.closePath()
        ctx.fillStyle = `rgba(34,197,94,${alpha})`
        ctx.fill()
      }

      // 스위프 선
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(radarAngle) * maxR, cy + Math.sin(radarAngle) * maxR)
      ctx.strokeStyle = "rgba(34,197,94,0.5)"
      ctx.lineWidth = 1
      ctx.stroke()

      // ── 레이더 점 생성 (스위프 선 근처) ─────────────────
      if (Math.random() < 0.12) {
        const dist = maxR * (0.25 + Math.random() * 0.7)
        const angle = radarAngle + (Math.random() - 0.5) * 0.15
        dots.push({
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          angle, dist,
          opacity: 1,
          size: 1.5 + Math.random() * 2,
          birth: ts,
        })
      }

      // ── 점 그리기 & 페이드 ──────────────────────────────
      for (let i = dots.length - 1; i >= 0; i--) {
        const d = dots[i]
        const age = (ts - d.birth) / 1000
        d.opacity = Math.max(0, 1 - age / 2.5)
        if (d.opacity <= 0) { dots.splice(i, 1); continue }

        // 링 + 코어
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.size * 2, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(34,197,94,${d.opacity * 0.4})`
        ctx.lineWidth = 0.8
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(34,197,94,${d.opacity})`
        ctx.fill()
      }

      // ── 전투기 ───────────────────────────────────────────
      jetTimer++
      // 25~50초 랜덤 간격으로 등장
      if (!jet && jetTimer > 1500 + Math.random() * 1500) {
        spawnJet(w, h)
        jetTimer = 0
      }

      if (jet) {
        jet.x += jet.vx
        jet.y += jet.vy
        jet.opacity = Math.min(1, jet.opacity + 0.04)

        const offscreen = jet.x > w + 80 || jet.y > h + 80 || jet.x < -80 || jet.y < -80
        if (offscreen) {
          jet = null
        } else {
          drawJet(ctx, jet)
        }
      }

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)

    return () => {
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
