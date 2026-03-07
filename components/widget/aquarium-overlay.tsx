"use client"

import { useEffect, useRef } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────
interface RadarObj {
  id: number
  cx: number; cy: number
  radius: number
  angle: number
  duration: number
  spawnTime: number
  dotAngle: number
  dotR: number
  dotColor: "red" | "yellow"
  phase: "spinning" | "fading"
  fadeStart: number
  waveR: number
  waveAlpha: number
  hitCount: number     // destroyed after 11 hits
}

type AircraftRole = "missile-a" | "missile-b" | "missile-c" | "laser" | "patrol"

interface Aircraft {
  id: number
  x: number; y: number
  vx: number; vy: number
  heading: number
  size: number
  role: AircraftRole
  state: "cruising" | "attacking" | "done"
  targetId: number
  shotsFired: number
  lastShot: number
  // patrol-specific
  orbitAngle: number
  orbitSpeed: number
  orbitRadius: number
  // laser state
  laserActive: boolean
  laserTimer: number
}

type MissileKind = "standard" | "heat" | "cluster" | "laser-beam"

interface Missile {
  id: number
  x: number; y: number
  vx: number; vy: number
  tx: number; ty: number
  radarId: number
  kind: MissileKind
  // cluster sub-shots
  clustered: boolean
  // laser beam endpoint
  lx?: number; ly?: number
  lAlpha?: number
}

interface Explosion {
  id: number
  x: number; y: number
  t: number
  duration: number
  spawnTime: number
  kind: "bang" | "laser-hit"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rnd(a: number, b: number) { return a + Math.random() * (b - a) }
const TWO_PI = Math.PI * 2

// ─── Aircraft Drawings ────────────────────────────────────────────────────────

// A: Swept-delta attack jet (compact)
function drawAircraftA(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath()
  ctx.moveTo(0, -s * 1.0)           // nose
  ctx.lineTo(-s * 1.1, s * 0.5)    // left wing tip
  ctx.lineTo(-s * 0.35, s * 0.25)
  ctx.lineTo(-s * 0.25, s * 0.75)  // left tail
  ctx.lineTo(0, s * 0.5)
  ctx.lineTo(s * 0.25, s * 0.75)
  ctx.lineTo(s * 0.35, s * 0.25)
  ctx.lineTo(s * 1.1, s * 0.5)     // right wing tip
  ctx.closePath()
  ctx.fillStyle = "#1a2e1a"
  ctx.fill()
  ctx.strokeStyle = "#00ff88"
  ctx.lineWidth = 0.8
  ctx.shadowBlur = 6; ctx.shadowColor = "#00ff88"
  ctx.stroke()
  // cockpit
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.45, s * 0.12, s * 0.22, 0, 0, TWO_PI)
  ctx.fillStyle = "rgba(0,200,255,0.35)"
  ctx.fill()
  // afterburner
  ctx.beginPath()
  ctx.arc(0, s * 0.58, s * 0.1, 0, TWO_PI)
  ctx.fillStyle = "rgba(255,100,0,0.85)"
  ctx.fill()
}

// B: Twin-engine interceptor (wide fuselage)
function drawAircraftB(ctx: CanvasRenderingContext2D, s: number) {
  // fuselage
  ctx.beginPath()
  ctx.moveTo(0, -s * 1.1)
  ctx.lineTo(-s * 0.2, -s * 0.3)
  ctx.lineTo(-s * 0.2, s * 0.7)
  ctx.lineTo(s * 0.2, s * 0.7)
  ctx.lineTo(s * 0.2, -s * 0.3)
  ctx.closePath()
  ctx.fillStyle = "#0e1e2e"
  ctx.fill()
  ctx.strokeStyle = "#00d4ff"
  ctx.lineWidth = 0.8
  ctx.shadowBlur = 6; ctx.shadowColor = "#00d4ff"
  ctx.stroke()
  // swept wings
  ctx.beginPath()
  ctx.moveTo(-s * 0.2, 0)
  ctx.lineTo(-s * 1.2, s * 0.55)
  ctx.lineTo(-s * 0.35, s * 0.4)
  ctx.moveTo(s * 0.2, 0)
  ctx.lineTo(s * 1.2, s * 0.55)
  ctx.lineTo(s * 0.35, s * 0.4)
  ctx.strokeStyle = "#00d4ff"
  ctx.lineWidth = 1
  ctx.stroke()
  // twin nozzles
  ctx.beginPath()
  ctx.arc(-s * 0.1, s * 0.72, s * 0.07, 0, TWO_PI)
  ctx.arc(s * 0.1, s * 0.72, s * 0.07, 0, TWO_PI)
  ctx.fillStyle = "rgba(255,140,0,0.8)"
  ctx.fill()
}

// C: Stealth flying-wing bomber
function drawAircraftC(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.4)
  ctx.lineTo(-s * 1.4, s * 0.5)
  ctx.lineTo(-s * 0.6, s * 0.35)
  ctx.lineTo(-s * 0.15, s * 0.6)
  ctx.lineTo(0, s * 0.45)
  ctx.lineTo(s * 0.15, s * 0.6)
  ctx.lineTo(s * 0.6, s * 0.35)
  ctx.lineTo(s * 1.4, s * 0.5)
  ctx.closePath()
  ctx.fillStyle = "#151510"
  ctx.fill()
  ctx.strokeStyle = "#aaff00"
  ctx.lineWidth = 0.7
  ctx.shadowBlur = 5; ctx.shadowColor = "#aaff00"
  ctx.stroke()
}

// D: Laser fighter — angular, bright cyan
function drawAircraftD(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath()
  ctx.moveTo(0, -s * 1.2)
  ctx.lineTo(-s * 0.25, s * 0.1)
  ctx.lineTo(-s * 0.8, s * 0.6)
  ctx.lineTo(-s * 0.15, s * 0.35)
  ctx.lineTo(0, s * 0.8)
  ctx.lineTo(s * 0.15, s * 0.35)
  ctx.lineTo(s * 0.8, s * 0.6)
  ctx.lineTo(s * 0.25, s * 0.1)
  ctx.closePath()
  ctx.fillStyle = "#051a25"
  ctx.fill()
  ctx.strokeStyle = "#00ffff"
  ctx.lineWidth = 0.9
  ctx.shadowBlur = 10; ctx.shadowColor = "#00ffff"
  ctx.stroke()
  // laser emitter tip
  ctx.beginPath()
  ctx.arc(0, -s * 1.22, s * 0.08, 0, TWO_PI)
  ctx.fillStyle = "#00ffff"
  ctx.fill()
}

// E: Small patrol scout — tiny diamond
function drawAircraftE(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.7)
  ctx.lineTo(-s * 0.5, 0)
  ctx.lineTo(0, s * 0.7)
  ctx.lineTo(s * 0.5, 0)
  ctx.closePath()
  ctx.fillStyle = "#1a1a2e"
  ctx.fill()
  ctx.strokeStyle = "#ff88ff"
  ctx.lineWidth = 0.8
  ctx.shadowBlur = 5; ctx.shadowColor = "#ff88ff"
  ctx.stroke()
  // pulsing center
  ctx.beginPath()
  ctx.arc(0, 0, s * 0.12, 0, TWO_PI)
  ctx.fillStyle = "#ff88ff"
  ctx.fill()
}

function drawAircraft(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  heading: number,
  size: number,
  role: AircraftRole,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(heading)
  ctx.shadowBlur = 0
  switch (role) {
    case "missile-a": drawAircraftA(ctx, size); break
    case "missile-b": drawAircraftB(ctx, size); break
    case "missile-c": drawAircraftC(ctx, size); break
    case "laser":     drawAircraftD(ctx, size); break
    case "patrol":    drawAircraftE(ctx, size); break
  }
  ctx.restore()
}

// Nose offset: local (0, -noseOffset) rotated by heading
function getNose(x: number, y: number, heading: number, noseOffset: number) {
  return {
    nx: x + Math.sin(heading) * noseOffset,
    ny: y - Math.cos(heading) * noseOffset,
  }
}

// Radar blip — small silhouette for target dot
function drawRadarBlip(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  opacity: number,
  isLocked: boolean,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.globalAlpha = opacity
  const s = 5
  ctx.beginPath()
  ctx.moveTo(0, -s * 1.6)
  ctx.lineTo(-s * 1.1, s * 0.5)
  ctx.lineTo(-s * 0.4, s * 0.1)
  ctx.lineTo(0, s * 0.8)
  ctx.lineTo(s * 0.4, s * 0.1)
  ctx.lineTo(s * 1.1, s * 0.5)
  ctx.closePath()
  ctx.fillStyle = isLocked ? "#ffcc00" : "#00ff44"
  ctx.fill()
  ctx.strokeStyle = isLocked ? "#aa8800" : "#008822"
  ctx.lineWidth = 0.6
  ctx.stroke()
  ctx.restore()
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RadarOverlay({
  priceData: _p,
}: {
  priceData?: { volume: number; deltaVolume: number }
}) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const rafRef       = useRef<number>(0)

  const radarsRef    = useRef<RadarObj[]>([])
  const aircraftRef  = useRef<Aircraft[]>([])
  const missilesRef  = useRef<Missile[]>([])
  const explosionsRef = useRef<Explosion[]>([])

  const idRef        = useRef(0)
  const lastSpawnRef = useRef(0)
  const prevTsRef    = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      const p = canvas.parentElement
      if (!p) return
      canvas.width  = p.clientWidth
      canvas.height = p.clientHeight
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    function getDotPos(r: RadarObj) {
      return {
        dx: r.cx + Math.cos(r.dotAngle) * r.dotR * r.radius,
        dy: r.cy + Math.sin(r.dotAngle) * r.dotR * r.radius,
      }
    }

    function spawnRadar(W: number, H: number, now: number) {
      const radius = rnd(80, Math.min(W, H) * 0.65)
      radarsRef.current.push({
        id: idRef.current++,
        cx: rnd(W * 0.2, W * 0.8),
        cy: rnd(H * 0.2, H * 0.8),
        radius,
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
        hitCount: 0,
      })
    }

    function spawnAircraftForRadar(W: number, H: number, r: RadarObj, role: AircraftRole) {
      const edge = Math.floor(rnd(0, 4))
      let sx = 0, sy = 0
      if (edge === 0)      { sx = rnd(0, W);  sy = -60 }
      else if (edge === 1) { sx = W + 60;     sy = rnd(0, H) }
      else if (edge === 2) { sx = rnd(0, W);  sy = H + 60 }
      else                 { sx = -60;         sy = rnd(0, H) }

      const { dx, dy } = getDotPos(r)
      const dist = Math.hypot(dx - sx, dy - sy)

      // Missile jets slower (50–110), laser faster (90–150), patrol orbits
      const spd = role === "patrol" ? rnd(40, 70)
        : role === "laser" ? rnd(80, 130)
        : rnd(45, 95)  // missile jets: slow

      // Small aircraft for patrol (4-9px), others 10-22px
      const size = role === "patrol" ? rnd(4, 9) : rnd(10, 22)

      aircraftRef.current.push({
        id: idRef.current++,
        x: sx, y: sy,
        vx: (dx - sx) / dist * spd,
        vy: (dy - sy) / dist * spd,
        heading: Math.atan2(dy - sy, dx - sx) + Math.PI / 2,
        size,
        role,
        state: role === "patrol" ? "attacking" : "cruising",
        targetId: r.id,
        shotsFired: 0,
        lastShot: 0,
        orbitAngle: Math.atan2(sy - r.cy, sx - r.cx),
        orbitSpeed: rnd(0.4, 0.9) * (Math.random() > 0.5 ? 1 : -1),
        orbitRadius: rnd(r.radius * 0.9, r.radius * 1.4),
        laserActive: false,
        laserTimer: 0,
      })
    }

    // ─── Draw missile types ────────────────────────────────────────────────
    function drawMissile(ctx: CanvasRenderingContext2D, m: Missile) {
      ctx.save()
      if (m.kind === "laser-beam") {
        // draw laser beam from x,y to lx,ly
        if (m.lx !== undefined && m.ly !== undefined && (m.lAlpha ?? 0) > 0) {
          ctx.beginPath()
          ctx.moveTo(m.x, m.y)
          ctx.lineTo(m.lx, m.ly)
          ctx.strokeStyle = `rgba(0,255,255,${m.lAlpha})`
          ctx.lineWidth = 1.5
          ctx.shadowBlur = 12; ctx.shadowColor = "#00ffff"
          ctx.stroke()
          // tip flash
          ctx.beginPath()
          ctx.arc(m.lx, m.ly, 3, 0, TWO_PI)
          ctx.fillStyle = `rgba(0,255,255,${m.lAlpha})`
          ctx.fill()
        }
        ctx.restore()
        return
      }
      if (m.kind === "heat") {
        // orange-red seeker
        ctx.shadowBlur = 8; ctx.shadowColor = "#ff4400"
        ctx.beginPath(); ctx.arc(m.x, m.y, 2.5, 0, TWO_PI)
        ctx.fillStyle = "#ff6600"; ctx.fill()
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(m.x - m.vx * 0.06, m.y - m.vy * 0.06)
        ctx.strokeStyle = "rgba(255,100,0,0.5)"; ctx.lineWidth = 1.2; ctx.stroke()
      } else if (m.kind === "cluster") {
        // blue-white cluster round
        ctx.shadowBlur = 6; ctx.shadowColor = "#aaaaff"
        ctx.beginPath(); ctx.arc(m.x, m.y, 3, 0, TWO_PI)
        ctx.fillStyle = "#8888ff"; ctx.fill()
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(m.x - m.vx * 0.05, m.y - m.vy * 0.05)
        ctx.strokeStyle = "rgba(100,100,255,0.4)"; ctx.lineWidth = 1; ctx.stroke()
      } else {
        // standard — yellow
        ctx.shadowBlur = 6; ctx.shadowColor = "rgba(255,180,0,0.8)"
        ctx.beginPath(); ctx.arc(m.x, m.y, 2, 0, TWO_PI)
        ctx.fillStyle = "rgba(255,220,80,0.95)"; ctx.fill()
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(m.x - m.vx * 0.04, m.y - m.vy * 0.04)
        ctx.strokeStyle = "rgba(255,120,0,0.45)"; ctx.lineWidth = 1; ctx.stroke()
      }
      ctx.restore()
    }

    // ─── Main loop ─────────────────────────────────────────────────────────
    const draw = (ts: number) => {
      const dt  = Math.min((ts - (prevTsRef.current || ts)) / 1000, 0.05)
      prevTsRef.current = ts
      const now = ts
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      // ── Spawn radar (max 1) ──────────────────────────────────────────
      if (radarsRef.current.length === 0 && now - lastSpawnRef.current > 1200) {
        spawnRadar(W, H, now)
        lastSpawnRef.current = now
      }

      // ── Update & draw radars ─────────────────────────────────────────
      radarsRef.current = radarsRef.current.filter((r) => {
        const elapsed  = now - r.spawnTime
        const progress = elapsed / r.duration

        if (r.phase === "spinning") {
          r.angle = (progress % 1) * TWO_PI
          if (progress >= 1) { r.phase = "fading"; r.fadeStart = now }
        }

        const opacity =
          r.phase === "spinning"
            ? Math.min(1, elapsed / 400)
            : Math.max(0, 1 - (now - r.fadeStart) / 800)

        if (r.phase === "fading" && opacity <= 0) return false

        const { cx, cy, radius: rr } = r
        ctx.save()
        ctx.globalAlpha = opacity

        // Rings
        for (let i = 1; i <= 4; i++) {
          ctx.beginPath()
          ctx.arc(cx, cy, (rr / 4) * i, 0, TWO_PI)
          ctx.strokeStyle = `rgba(0,255,140,${0.06 + i * 0.025})`
          ctx.lineWidth = 0.7; ctx.stroke()
        }
        // Crosshair
        ctx.strokeStyle = "rgba(0,255,140,0.09)"; ctx.lineWidth = 0.7
        ctx.beginPath(); ctx.moveTo(cx - rr, cy); ctx.lineTo(cx + rr, cy); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(cx, cy - rr); ctx.lineTo(cx, cy + rr); ctx.stroke()

        // Sweep trail
        if (r.phase === "spinning") {
          const sweepArc = Math.PI * 0.55
          const steps = 36
          for (let s = 0; s < steps; s++) {
            const frac = s / steps
            const a0 = r.angle - sweepArc * (1 - frac)
            const a1 = r.angle - sweepArc * (1 - (s + 1) / steps)
            ctx.beginPath(); ctx.moveTo(cx, cy)
            ctx.arc(cx, cy, rr, a0, a1); ctx.closePath()
            ctx.fillStyle = `rgba(0,255,140,${frac * 0.09})`; ctx.fill()
          }
          ctx.beginPath(); ctx.moveTo(cx, cy)
          ctx.lineTo(cx + Math.cos(r.angle) * rr, cy + Math.sin(r.angle) * rr)
          ctx.strokeStyle = "rgba(0,255,140,0.55)"; ctx.lineWidth = 1.2; ctx.stroke()
        }

        // Wave ring
        if (r.waveAlpha > 0) {
          r.waveR += dt * rr * 1.1
          r.waveAlpha = Math.max(0, r.waveAlpha - dt * 0.55)
          if (r.waveR < rr * 1.5) {
            ctx.beginPath(); ctx.arc(cx, cy, r.waveR, 0, TWO_PI)
            ctx.strokeStyle = `rgba(0,255,140,${r.waveAlpha * 0.45})`
            ctx.lineWidth = 1.5; ctx.stroke()
          }
        }

        // Hit count indicator (ring segments showing damage)
        if (r.hitCount > 0) {
          const hitFrac = Math.min(r.hitCount / 11, 1)
          ctx.beginPath()
          ctx.arc(cx, cy, rr * 0.12, -Math.PI / 2, -Math.PI / 2 + hitFrac * TWO_PI)
          ctx.strokeStyle = `rgba(255,80,80,${0.6 + hitFrac * 0.4})`
          ctx.lineWidth = 3; ctx.stroke()
        }

        // Center dot
        ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, TWO_PI)
        ctx.fillStyle = "rgba(0,255,140,0.7)"; ctx.fill()

        // Target blip
        const { dx, dy } = getDotPos(r)
        let dotDelta = r.angle - r.dotAngle
        while (dotDelta < 0) dotDelta += TWO_PI
        dotDelta = dotDelta % TWO_PI
        const fadeWindow = Math.PI * 1.7
        const dotAlpha = dotDelta < fadeWindow ? Math.max(0, 1 - dotDelta / fadeWindow) : 0
        if (dotAlpha > 0) drawRadarBlip(ctx, dx, dy, dotAlpha, r.dotColor === "yellow")

        ctx.restore()
        return true
      })

      // ── Spawn aircraft ───────────────────────────────────────────────
      // max 3 missile jets + 2 patrol + 1 laser simultaneously
      const activeMissile = aircraftRef.current.filter(
        a => (a.role === "missile-a" || a.role === "missile-b" || a.role === "missile-c") && a.state !== "done"
      ).length
      const activePatrol = aircraftRef.current.filter(
        a => a.role === "patrol" && a.state !== "done"
      ).length
      const activeLaser = aircraftRef.current.filter(
        a => a.role === "laser" && a.state !== "done"
      ).length

      for (const r of radarsRef.current) {
        if (r.phase !== "spinning") continue
        if (activeMissile < 3) {
          const roles: AircraftRole[] = ["missile-a", "missile-b", "missile-c"]
          spawnAircraftForRadar(W, H, r, roles[Math.floor(Math.random() * 3)])
          break
        }
        if (activePatrol < 2) {
          spawnAircraftForRadar(W, H, r, "patrol")
          break
        }
        if (activeLaser < 1) {
          spawnAircraftForRadar(W, H, r, "laser")
          break
        }
      }

      // ── Update & draw aircraft ───────────────────────────────────────
      aircraftRef.current = aircraftRef.current.filter((ac) => {
        const radar = radarsRef.current.find(r => r.id === ac.targetId)

        // Done — fly off screen
        if (ac.state === "done") {
          ac.x += ac.vx * dt; ac.y += ac.vy * dt
          if (Math.abs(ac.vx) > 0.01 || Math.abs(ac.vy) > 0.01)
            ac.heading = Math.atan2(ac.vy, ac.vx) + Math.PI / 2
          const off = ac.x < -120 || ac.x > W + 120 || ac.y < -120 || ac.y > H + 120
          if (!off) drawAircraft(ctx, ac.x, ac.y, ac.heading, ac.size, ac.role)
          return !off
        }

        // No radar
        if (!radar) {
          ac.state = "done"
          const spd = Math.hypot(ac.vx, ac.vy) || 80
          ac.vx = -ac.vx / spd * 80; ac.vy = -ac.vy / spd * 80
          return true
        }

        const { dx, dy } = getDotPos(radar)

        // ── Patrol: orbit around radar perimeter ──────────────────────
        if (ac.role === "patrol") {
          ac.orbitAngle += ac.orbitSpeed * dt
          const tx = radar.cx + Math.cos(ac.orbitAngle) * ac.orbitRadius
          const ty = radar.cy + Math.sin(ac.orbitAngle) * ac.orbitRadius
          const dist = Math.hypot(tx - ac.x, ty - ac.y)
          if (dist > 1) {
            const orbitSpd = ac.orbitSpeed > 0 ? 55 : -55
            ac.vx += ((tx - ac.x) / dist * Math.abs(orbitSpd) - ac.vx) * dt * 3
            ac.vy += ((ty - ac.y) / dist * Math.abs(orbitSpd) - ac.vy) * dt * 3
          }
          ac.x += ac.vx * dt; ac.y += ac.vy * dt
          if (Math.abs(ac.vx) > 0.01 || Math.abs(ac.vy) > 0.01)
            ac.heading = Math.atan2(ac.vy, ac.vx) + Math.PI / 2
          drawAircraft(ctx, ac.x, ac.y, ac.heading, ac.size, ac.role)
          return true
        }

        // ── Laser: fast approach, beam attack ────────────────────────
        if (ac.role === "laser") {
          ac.x += ac.vx * dt; ac.y += ac.vy * dt
          if (Math.abs(ac.vx) > 0.01 || Math.abs(ac.vy) > 0.01)
            ac.heading = Math.atan2(ac.vy, ac.vx) + Math.PI / 2

          const distToDot = Math.hypot(dx - ac.x, dy - ac.y)
          if (distToDot < radar.radius * 1.5 && ac.state === "cruising") ac.state = "attacking"

          if (ac.state === "attacking") {
            // Orbit while firing laser
            ac.orbitAngle += 0.8 * dt
            const orbitX = radar.cx + Math.cos(ac.orbitAngle) * (radar.radius * 0.7)
            const orbitY = radar.cy + Math.sin(ac.orbitAngle) * (radar.radius * 0.7)
            ac.vx += ((orbitX - ac.x) / Math.max(1, Math.hypot(orbitX - ac.x, orbitY - ac.y)) * 100 - ac.vx) * dt * 2
            ac.vy += ((orbitY - ac.y) / Math.max(1, Math.hypot(orbitX - ac.x, orbitY - ac.y)) * 100 - ac.vy) * dt * 2
            ac.x += ac.vx * dt; ac.y += ac.vy * dt
            if (Math.abs(ac.vx) > 0.01 || Math.abs(ac.vy) > 0.01)
              ac.heading = Math.atan2(ac.vy, ac.vx) + Math.PI / 2

            // Fire laser every 1.8s
            if (now - ac.lastShot > 1800 && ac.shotsFired < 6) {
              const { nx, ny } = getNose(ac.x, ac.y, ac.heading, ac.size * 1.2)
              missilesRef.current.push({
                id: idRef.current++,
                x: nx, y: ny,
                vx: 0, vy: 0,
                tx: dx, ty: dy,
                radarId: radar.id,
                kind: "laser-beam",
                clustered: false,
                lx: dx, ly: dy,
                lAlpha: 1.0,
              })
              ac.lastShot = now
              ac.shotsFired++
            }
            if (ac.shotsFired >= 6) {
              ac.state = "done"
              const spd = Math.hypot(ac.vx, ac.vy) || 80
              ac.vx = ac.vx / spd * 130; ac.vy = ac.vy / spd * 130
            }
          }
          drawAircraft(ctx, ac.x, ac.y, ac.heading, ac.size, ac.role)
          return true
        }

        // ── Missile jets (a / b / c) ──────────────────────────────────
        ac.x += ac.vx * dt; ac.y += ac.vy * dt
        if (Math.abs(ac.vx) > 0.01 || Math.abs(ac.vy) > 0.01)
          ac.heading = Math.atan2(ac.vy, ac.vx) + Math.PI / 2

        const distToDot = Math.hypot(dx - ac.x, dy - ac.y)
        if (ac.state === "cruising" && distToDot < radar.radius * 1.2) ac.state = "attacking"

        if (ac.state === "attacking" && ac.shotsFired < 4 && now - ac.lastShot > rnd(600, 1200)) {
          const kind: MissileKind =
            ac.role === "missile-a" ? "standard" :
            ac.role === "missile-b" ? "heat" : "cluster"
          const spd = rnd(150, 380) // random missile speed
          const jx = rnd(-15, 15); const jy = rnd(-15, 15)
          const tx = dx + jx; const ty = dy + jy
          const { nx, ny } = getNose(ac.x, ac.y, ac.heading, ac.size * 1.0)
          const d = Math.hypot(tx - nx, ty - ny)
          missilesRef.current.push({
            id: idRef.current++,
            x: nx, y: ny,
            vx: (tx - nx) / d * spd,
            vy: (ty - ny) / d * spd,
            tx, ty,
            radarId: radar.id,
            kind,
            clustered: false,
          })
          ac.lastShot = now; ac.shotsFired++
        }

        if (ac.shotsFired >= 4) {
          ac.state = "done"
          const spd = Math.hypot(ac.vx, ac.vy) || 80
          ac.vx = ac.vx / spd * 100; ac.vy = ac.vy / spd * 100
        }

        drawAircraft(ctx, ac.x, ac.y, ac.heading, ac.size, ac.role)
        return true
      })

      // ── Update & draw missiles ───────────────────────────────────────
      missilesRef.current = missilesRef.current.filter((m) => {
        if (m.kind === "laser-beam") {
          // Laser beam: instant hit, fade out over 0.3s
          m.lAlpha = (m.lAlpha ?? 1) - dt * 3.3
          if ((m.lAlpha ?? 0) <= 0) {
            // Register hit
            const radar = radarsRef.current.find(r => r.id === m.radarId)
            if (radar) {
              radar.hitCount++
              explosionsRef.current.push({
                id: idRef.current++, x: m.tx, y: m.ty,
                t: 0, duration: 400, spawnTime: now, kind: "laser-hit",
              })
              if (radar.hitCount >= 11) {
                // Remove radar and all associated aircraft
                radarsRef.current = radarsRef.current.filter(r => r.id !== radar.id)
                aircraftRef.current.forEach(a => { if (a.targetId === radar.id) a.state = "done" })
              }
            }
            return false
          }
          drawMissile(ctx, m)
          return true
        }

        m.x += m.vx * dt; m.y += m.vy * dt
        const distToAim = Math.hypot(m.tx - m.x, m.ty - m.y)

        if (distToAim < 10) {
          // Hit — register and spawn explosion
          const radar = radarsRef.current.find(r => r.id === m.radarId)
          if (radar) {
            radar.hitCount++
            if (m.kind === "cluster" && !m.clustered) {
              // Spawn 3 sub-shots
              for (let i = 0; i < 3; i++) {
                const ang = rnd(0, TWO_PI)
                const spd = rnd(80, 160)
                missilesRef.current.push({
                  id: idRef.current++,
                  x: m.x, y: m.y,
                  vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                  tx: m.x + Math.cos(ang) * 30,
                  ty: m.y + Math.sin(ang) * 30,
                  radarId: m.radarId, kind: "cluster", clustered: true,
                })
              }
            }
            explosionsRef.current.push({
              id: idRef.current++, x: m.x, y: m.y,
              t: 0, duration: 500, spawnTime: now, kind: "bang",
            })
            if (radar.hitCount >= 11) {
              radarsRef.current = radarsRef.current.filter(r => r.id !== radar.id)
              aircraftRef.current.forEach(a => { if (a.targetId === radar.id) a.state = "done" })
            }
          }
          return false
        }

        if (m.x < -80 || m.x > W + 80 || m.y < -80 || m.y > H + 80) return false

        drawMissile(ctx, m)
        return true
      })

      // ── Update & draw explosions ─────────────────────────────────────
      explosionsRef.current = explosionsRef.current.filter((ex) => {
        ex.t = (now - ex.spawnTime) / ex.duration
        if (ex.t >= 1) return false
        const alpha = 1 - ex.t

        ctx.save()
        if (ex.kind === "laser-hit") {
          // Cyan laser impact
          const r1 = ex.t * 16
          ctx.beginPath(); ctx.arc(ex.x, ex.y, r1, 0, TWO_PI)
          ctx.strokeStyle = `rgba(0,255,255,${alpha * 0.9})`
          ctx.lineWidth = 2; ctx.shadowBlur = 12; ctx.shadowColor = "#00ffff"
          ctx.stroke()
          if (ex.t < 0.4) {
            ctx.beginPath(); ctx.arc(ex.x, ex.y, r1 * 0.4, 0, TWO_PI)
            ctx.fillStyle = `rgba(200,255,255,${(0.4 - ex.t) / 0.4})`
            ctx.fill()
          }
        } else {
          const r1 = ex.t * 20
          ctx.beginPath(); ctx.arc(ex.x, ex.y, r1, 0, TWO_PI)
          ctx.strokeStyle = `rgba(255,180,60,${alpha * 0.8})`
          ctx.lineWidth = 2; ctx.stroke()
          if (ex.t < 0.3) {
            const grd = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, r1 * 0.6)
            grd.addColorStop(0, `rgba(255,255,200,${(0.3 - ex.t) / 0.3})`)
            grd.addColorStop(1, "rgba(255,120,0,0)")
            ctx.beginPath(); ctx.arc(ex.x, ex.y, r1 * 0.6, 0, TWO_PI)
            ctx.fillStyle = grd; ctx.fill()
          }
        }
        ctx.restore()
        return true
      })

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect() }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block", width: "100%", height: "100%",
        position: "absolute", inset: 0, pointerEvents: "none",
      }}
    />
  )
}

export { RadarOverlay as AquariumOverlay }
