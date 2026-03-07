"use client"

import { useEffect, useRef } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────
interface RadarObj {
  id: number
  cx: number; cy: number        // center in canvas px
  radius: number                // may exceed canvas bounds
  angle: number                 // sweep angle in radians (0 → 2π)
  duration: number              // ms per full rotation
  spawnTime: number
  dotAngle: number              // angle of target dot (radians)
  dotR: number                  // radius fraction (0.55 ~ 0.85)
  dotColor: "red" | "yellow"
  phase: "spinning" | "fading"
  fadeStart: number
  waveR: number                 // expanding wave ring
  waveAlpha: number
}

interface Aircraft {
  id: number
  x: number; y: number
  vx: number; vy: number
  heading: number               // radians — nose direction
  size: number                  // base size px
  type: 0 | 1 | 2              // fighter / jet / stealth
  state: "cruising" | "attacking" | "done"
  targetId: number
  missilesFired: number
  lastMissile: number
}

interface Missile {
  id: number
  x: number; y: number
  vx: number; vy: number
  tx: number; ty: number        // destination (with jitter)
  radarId: number
}

interface Explosion {
  id: number
  x: number; y: number
  t: number                     // 0 → 1 progress
  duration: number
  spawnTime: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rnd(a: number, b: number) { return a + Math.random() * (b - a) }
const TWO_PI = Math.PI * 2

// Draw a small aircraft silhouette on canvas ctx
// ── Radar blip — small top-view F-22 silhouette shown on radar ────────────────
function drawRadarBlip(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  opacity: number,
  isLocked = false,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.globalAlpha = opacity

  const s = 0.25
  ctx.scale(s, s)

  ctx.beginPath()
  ctx.moveTo(0, -40)
  ctx.lineTo(-30, -15)
  ctx.lineTo(-50, 0)
  ctx.lineTo(-30, 15)
  ctx.lineTo(0, 30)
  ctx.lineTo(30, 15)
  ctx.lineTo(50, 0)
  ctx.lineTo(30, -15)
  ctx.closePath()
  ctx.fillStyle   = isLocked ? "#ffcc00" : "#00ff00"
  ctx.fill()
  ctx.strokeStyle = "#003300"
  ctx.lineWidth   = 2
  ctx.stroke()

  // Center blip dot
  ctx.beginPath()
  ctx.arc(0, 0, 8, 0, Math.PI * 2)
  ctx.fillStyle = "white"
  ctx.fill()

  ctx.restore()
}

// F-22 top-view — nose at (0, -140) in local space before scale
// `size` is a scale factor (0.12 – 0.32). heading = radians, nose points in direction of travel.
// The original drawF22TopView has nose at y=-140, tail at y=+100.
// We rotate so that nose (local -y) aligns with the heading direction.
function drawAircraft(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  heading: number,
  size: number,   // used as scale, e.g. 0.15 ~ 0.32
  _type: 0 | 1 | 2
) {
  ctx.save()
  ctx.translate(x, y)
  // heading = atan2(vy,vx) - PI/2  →  at heading=0 ctx points "up" which matches nose at -y
  ctx.rotate(heading)
  ctx.scale(size, size)
  ctx.globalAlpha = ctx.globalAlpha  // preserve parent alpha

  // ── F-22 Raptor top-view ───────────────────────────────────────────────
  // Body gradient
  const grad = ctx.createLinearGradient(-100, -150, 100, 150)
  grad.addColorStop(0, "#1a2a1a")
  grad.addColorStop(0.5, "#2a3d2a")
  grad.addColorStop(1, "#111a11")

  // Main diamond body / wing
  ctx.beginPath()
  ctx.moveTo(0, -140)       // Nose tip
  ctx.lineTo(-80, -60)
  ctx.lineTo(-140, 0)       // Left wing tip
  ctx.lineTo(-100, 60)
  ctx.lineTo(0, 100)        // Tail center
  ctx.lineTo(100, 60)
  ctx.lineTo(140, 0)        // Right wing tip
  ctx.lineTo(80, -60)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = "rgba(0,255,180,0.7)"
  ctx.lineWidth = 3
  ctx.shadowBlur = 10
  ctx.shadowColor = "rgba(0,255,180,0.5)"
  ctx.stroke()

  // Cockpit canopy
  ctx.beginPath()
  ctx.ellipse(0, -80, 18, 36, 0, 0, Math.PI * 2)
  ctx.fillStyle = "rgba(0,220,180,0.22)"
  ctx.fill()
  ctx.strokeStyle = "rgba(0,255,200,0.6)"
  ctx.lineWidth = 1.5
  ctx.shadowBlur = 6
  ctx.stroke()

  // Panel / seam lines
  ctx.beginPath()
  ctx.moveTo(-50, -100); ctx.lineTo(50, -100)
  ctx.moveTo(-90, -20);  ctx.lineTo(90, -20)
  ctx.moveTo(-110, 40);  ctx.lineTo(110, 40)
  ctx.moveTo(0, -140);   ctx.lineTo(0, 100)
  ctx.strokeStyle = "rgba(0,180,140,0.3)"
  ctx.lineWidth = 1
  ctx.shadowBlur = 0
  ctx.stroke()

  // Engine intakes
  ctx.beginPath()
  ctx.ellipse(-45, 20, 20, 12, 0, 0, Math.PI * 2)
  ctx.ellipse(45, 20, 20, 12, 0, 0, Math.PI * 2)
  ctx.fillStyle = "rgba(0,0,0,0.7)"
  ctx.fill()
  ctx.strokeStyle = "rgba(0,200,160,0.4)"
  ctx.lineWidth = 1
  ctx.stroke()

  // Engine nozzles (afterburner glow)
  ctx.beginPath()
  ctx.arc(-35, 82, 10, 0, Math.PI * 2)
  ctx.arc(35, 82, 10, 0, Math.PI * 2)
  ctx.fillStyle = "rgba(255,120,0,0.75)"
  ctx.fill()
  ctx.strokeStyle = "rgba(255,200,50,0.5)"
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.restore()
}

// Returns world-space nose position for missile spawn.
// Local nose = (0, -140). After ctx.rotate(heading): local (lx, ly) → world (lx*cos−ly*sin, lx*sin+ly*cos).
// So (0, -140*size) → world offset = (140*size*sin(heading), -140*size*cos(heading)) ... wait:
// rotate(θ): x' = x*cosθ - y*sinθ,  y' = x*sinθ + y*cosθ
// nose local = (0, -140*size) → x' = 0 - (-140s)*sinθ = 140s*sinθ,  y' = 0 + (-140s)*cosθ = -140s*cosθ
function getNosePosition(x: number, y: number, heading: number, size: number) {
  const noseLen = 140 * size
  return {
    nx: x + noseLen * Math.sin(heading),
    ny: y - noseLen * Math.cos(heading),
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RadarOverlay({
  priceData: _p,
}: {
  priceData?: { volume: number; deltaVolume: number }
}) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const rafRef      = useRef<number>(0)

  // Simulation state — all in refs, never causes re-render
  const radarsRef     = useRef<RadarObj[]>([])
  const aircraftRef   = useRef<Aircraft[]>([])
  const missilesRef   = useRef<Missile[]>([])
  const explosionsRef = useRef<Explosion[]>([])

  const idRef       = useRef(0)
  const lastSpawnRef = useRef(0)
  const prevTsRef   = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // ── Resize handler ──────────────────────────────────────────────────
    const resize = () => {
      const p = canvas.parentElement
      if (!p) return
      canvas.width  = p.clientWidth
      canvas.height = p.clientHeight
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    // ── Helpers inside RAF ───────────────────────────────────────────────
    function getDotPos(r: RadarObj) {
      return {
        dx: r.cx + Math.cos(r.dotAngle) * r.dotR * r.radius,
        dy: r.cy + Math.sin(r.dotAngle) * r.dotR * r.radius,
      }
    }

    function spawnRadar(W: number, H: number, now: number) {
      const radius  = rnd(80, Math.min(W, H) * 0.65)
      const cx      = rnd(W * 0.2, W * 0.8)
      const cy      = rnd(H * 0.2, H * 0.8)
      radarsRef.current.push({
        id: idRef.current++,
        cx, cy, radius,
        angle: 0,
        duration: rnd(3000, 6000),
        spawnTime: now,
        dotAngle: rnd(0, TWO_PI),
        dotR: rnd(0.5, 0.82),
        dotColor: Math.random() > 0.45 ? "red" : "yellow",
        phase: "spinning",
        fadeStart: 0,
        waveR: 0,
        waveAlpha: 0.7,
      })
    }

    function spawnAircraft(W: number, H: number, r: RadarObj) {
      const edge = Math.floor(rnd(0, 4))
      let sx = 0, sy = 0
      if (edge === 0)      { sx = rnd(0, W);  sy = -50 }
      else if (edge === 1) { sx = W + 50;     sy = rnd(0, H) }
      else if (edge === 2) { sx = rnd(0, W);  sy = H + 50 }
      else                 { sx = -50;         sy = rnd(0, H) }

      const { dx, dy } = getDotPos(r)
      const dist = Math.hypot(dx - sx, dy - sy)
      const spd  = rnd(80, 160)

      aircraftRef.current.push({
        id: idRef.current++,
        x: sx, y: sy,
        vx: (dx - sx) / dist * spd,
        vy: (dy - sy) / dist * spd,
            heading: Math.atan2(dy - sy, dx - sx) + Math.PI / 2,
        size: rnd(0.12, 0.30),  // F-22 scale factor (local coords ±140px → ~34–84px on screen)
        type: Math.floor(Math.random() * 3) as 0 | 1 | 2,
        state: "cruising",
        targetId: r.id,
        missilesFired: 0,
        lastMissile: 0,
      })
    }

    // ── Main draw loop ───────────────────────────────────────────────────
    const draw = (ts: number) => {
      const dt  = Math.min((ts - (prevTsRef.current || ts)) / 1000, 0.05)
      prevTsRef.current = ts
      const now = ts

      const W = canvas.width
      const H = canvas.height

      ctx.clearRect(0, 0, W, H)

      // ── Spawn radar (max 1) ─────────────────────────────────────────
      if (radarsRef.current.length === 0 && now - lastSpawnRef.current > 1200) {
        spawnRadar(W, H, now)
        lastSpawnRef.current = now
      }

      // ── Update & draw radars ─────────────────────��──────────────────
      radarsRef.current = radarsRef.current.filter((r) => {
        const elapsed = now - r.spawnTime
        const progress = elapsed / r.duration

        if (r.phase === "spinning") {
          r.angle = (progress % 1) * TWO_PI

          // Completed one full rotation → start fading
          if (progress >= 1) {
            r.phase = "fading"
            r.fadeStart = now
          }
        }

        const opacity =
          r.phase === "spinning"
            ? Math.min(1, elapsed / 400)            // fade in
            : Math.max(0, 1 - (now - r.fadeStart) / 800) // fade out

        if (r.phase === "fading" && opacity <= 0) return false

        // ── Draw radar ────────────────────────────────────────────────
        const { cx, cy, radius: rr } = r

        ctx.save()
        ctx.globalAlpha = opacity

        // Concentric rings (4)
        for (let i = 1; i <= 4; i++) {
          const ringR = (rr / 4) * i
          ctx.beginPath()
          ctx.arc(cx, cy, ringR, 0, TWO_PI)
          ctx.strokeStyle = `rgba(0,255,140,${0.07 + i * 0.03})`
          ctx.lineWidth = 0.7
          ctx.stroke()
        }

        // Crosshair
        ctx.strokeStyle = "rgba(0,255,140,0.1)"
        ctx.lineWidth = 0.7
        ctx.beginPath(); ctx.moveTo(cx - rr, cy); ctx.lineTo(cx + rr, cy); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(cx, cy - rr); ctx.lineTo(cx, cy + rr); ctx.stroke()
        const d45 = rr * 0.707
        ctx.strokeStyle = "rgba(0,255,140,0.05)"
        ctx.beginPath(); ctx.moveTo(cx - d45, cy - d45); ctx.lineTo(cx + d45, cy + d45); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(cx + d45, cy - d45); ctx.lineTo(cx - d45, cy + d45); ctx.stroke()

        // Sweep trail (arc segments, ref style)
        if (r.phase === "spinning") {
          const sweepArc = Math.PI * 0.55
          const steps = 36
          for (let s = 0; s < steps; s++) {
            const frac = s / steps
            const a0   = r.angle - sweepArc * (1 - frac)
            const a1   = r.angle - sweepArc * (1 - (s + 1) / steps)
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            ctx.arc(cx, cy, rr, a0, a1)
            ctx.closePath()
            ctx.fillStyle = `rgba(0,255,140,${frac * 0.10})`
            ctx.fill()
          }

          // Leading edge line
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(cx + Math.cos(r.angle) * rr, cy + Math.sin(r.angle) * rr)
          ctx.strokeStyle = "rgba(0,255,140,0.6)"
          ctx.lineWidth = 1.2
          ctx.stroke()
        }

        // Wave ring (expands once after spawn)
        if (r.waveAlpha > 0) {
          r.waveR += dt * rr * 1.1
          r.waveAlpha = Math.max(0, r.waveAlpha - dt * 0.55)
          if (r.waveR < rr * 1.5) {
            ctx.beginPath()
            ctx.arc(cx, cy, r.waveR, 0, TWO_PI)
            ctx.strokeStyle = `rgba(0,255,140,${r.waveAlpha * 0.5})`
            ctx.lineWidth = 1.5
            ctx.stroke()
          }
        }

        // Center dot
        ctx.beginPath()
        ctx.arc(cx, cy, 2.5, 0, TWO_PI)
        ctx.fillStyle = "rgba(0,255,140,0.7)"
        ctx.fill()

        // Target dot — red or yellow, with sweep-based fade (ref style)
        const { dx, dy } = getDotPos(r)
        let dotDelta = r.angle - r.dotAngle
        while (dotDelta < 0) dotDelta += TWO_PI
        dotDelta = dotDelta % TWO_PI
        const fadeWindow = Math.PI * 1.7
        const dotAlpha = dotDelta < fadeWindow ? Math.max(0, 1 - dotDelta / fadeWindow) : 0

        if (dotAlpha > 0) {
          const isLocked = r.dotColor === "yellow"
          drawRadarBlip(ctx, dx, dy, dotAlpha, isLocked)
        }

        ctx.restore()
        return true
      })

      // ── Spawn aircraft (max 3 active) ───────────────────────────────
      const activeAC = aircraftRef.current.filter(a => a.state !== "done")
      if (activeAC.length < 3) {
        for (const r of radarsRef.current) {
          if (r.phase !== "spinning") continue
          const alreadyOn = aircraftRef.current.filter(
            a => a.targetId === r.id && a.state !== "done"
          ).length
          if (alreadyOn < 3 && activeAC.length < 3) {
            spawnAircraft(W, H, r)
            break
          }
        }
      }

      // ── Update & draw aircraft ──────────────────────────────────────
      aircraftRef.current = aircraftRef.current.filter((ac) => {
        const radar = radarsRef.current.find(r => r.id === ac.targetId)

        if (ac.state === "done") {
          // Keep moving until off-screen
          ac.x += ac.vx * dt
          ac.y += ac.vy * dt
          if (Math.abs(ac.vx) > 0.01 || Math.abs(ac.vy) > 0.01) {
            ac.heading = Math.atan2(ac.vy, ac.vx) + Math.PI / 2
          }
          const offscreen = ac.x < -100 || ac.x > W + 100 || ac.y < -100 || ac.y > H + 100
          if (!offscreen) drawAircraft(ctx, ac.x, ac.y, ac.heading, ac.size, ac.type)
          return !offscreen
        }

        // No radar → peel away
        if (!radar) {
          ac.state = "done"
          // Reverse direction and fly away
          const spd = Math.hypot(ac.vx, ac.vy)
          ac.vx = -ac.vx / Math.max(0.1, spd) * 80
          ac.vy = -ac.vy / Math.max(0.1, spd) * 80
          return true
        }

        ac.x += ac.vx * dt
        ac.y += ac.vy * dt
        // Keep heading aligned to velocity so nose always points in direction of travel
        if (Math.abs(ac.vx) > 0.01 || Math.abs(ac.vy) > 0.01) {
          ac.heading = Math.atan2(ac.vy, ac.vx) + Math.PI / 2
        }

        const { dx, dy } = getDotPos(radar)
        const distToDot  = Math.hypot(dx - ac.x, dy - ac.y)

        // Switch to attacking when close enough
        if (ac.state === "cruising" && distToDot < radar.radius * 1.2) {
          ac.state = "attacking"
        }

        // Fire missiles from the nose tip
        if (ac.state === "attacking" && ac.missilesFired < 5 && now - ac.lastMissile > 700) {
          const spd  = rnd(220, 380)
          const jx   = rnd(-18, 18)
          const jy   = rnd(-18, 18)
          const tx   = dx + jx
          const ty   = dy + jy
          // Compute nose world position
          const { nx, ny } = getNosePosition(ac.x, ac.y, ac.heading, ac.size)
          const dist2 = Math.hypot(tx - nx, ty - ny)
          missilesRef.current.push({
            id: idRef.current++,
            x: nx, y: ny,
            vx: (tx - nx) / dist2 * spd,
            vy: (ty - ny) / dist2 * spd,
            tx, ty,
            radarId: radar.id,
          })
          ac.lastMissile   = now
          ac.missilesFired++
        }

        if (ac.missilesFired >= 5) {
          ac.state = "done"
          // Fly past and away
          const spd = Math.hypot(ac.vx, ac.vy)
          const hx  = (ac.vx / Math.max(0.001, spd))
          const hy  = (ac.vy / Math.max(0.001, spd))
          ac.vx = hx * 120
          ac.vy = hy * 120
        }

        drawAircraft(ctx, ac.x, ac.y, ac.heading, ac.size, ac.type)
        return true
      })

      // ── Update & draw missiles ──────────────────────────────────────
      missilesRef.current = missilesRef.current.filter((m) => {
        m.x += m.vx * dt
        m.y += m.vy * dt

        const distToAim = Math.hypot(m.tx - m.x, m.ty - m.y)
        if (distToAim < 8) {
          // Reached destination → spawn explosion, remove missile
          explosionsRef.current.push({
            id: idRef.current++,
            x: m.x, y: m.y,
            t: 0,
            duration: 600,
            spawnTime: now,
          })
          return false
        }

        // Out of bounds
        if (m.x < -80 || m.x > W + 80 || m.y < -80 || m.y > H + 80) return false

        // Draw missile — small bright dot with trail
        ctx.save()
        ctx.shadowBlur  = 6
        ctx.shadowColor = "rgba(255,180,0,0.8)"
        ctx.beginPath()
        ctx.arc(m.x, m.y, 2, 0, TWO_PI)
        ctx.fillStyle = "rgba(255,220,80,0.95)"
        ctx.fill()
        // Short trail
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(m.x - m.vx * 0.04, m.y - m.vy * 0.04)
        ctx.strokeStyle = "rgba(255,120,0,0.45)"
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.restore()

        return true
      })

      // ── Update & draw explosions ────────────────────────────────────
      explosionsRef.current = explosionsRef.current.filter((ex) => {
        ex.t = (now - ex.spawnTime) / ex.duration
        if (ex.t >= 1) return false

        const alpha = 1 - ex.t
        const r1    = ex.t * 22

        ctx.save()
        // Outer ring
        ctx.beginPath()
        ctx.arc(ex.x, ex.y, r1, 0, TWO_PI)
        ctx.strokeStyle = `rgba(255,180,60,${alpha * 0.8})`
        ctx.lineWidth   = 2
        ctx.stroke()
        // Inner flash
        if (ex.t < 0.3) {
          const grd = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, r1 * 0.6)
          grd.addColorStop(0, `rgba(255,255,200,${(0.3 - ex.t) / 0.3})`)
          grd.addColorStop(1, "rgba(255,120,0,0)")
          ctx.beginPath()
          ctx.arc(ex.x, ex.y, r1 * 0.6, 0, TWO_PI)
          ctx.fillStyle = grd
          ctx.fill()
        }
        ctx.restore()
        return true
      })

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", width: "100%", height: "100%", position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  )
}

export { RadarOverlay as AquariumOverlay }
