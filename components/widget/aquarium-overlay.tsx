"use client"

import { useEffect, useRef, useState } from "react"
import type React from "react"

// ─── Types ────────────────────────────────────────────────────────────────────
interface RadarObj {
  id: number
  x: number
  y: number
  radius: number        // base radius px (80–240, may exceed canvas)
  rotation: number      // 0–360 current sweep angle
  duration: number      // ms for one full rotation
  spawnTime: number
  targetAngle: number   // angle (deg) where the dot lives
  targetColor: "red" | "yellow"
  waveRadius: number    // current expanding wave radius
  opacity: number
  phase: "spinning" | "fading"
  fadeStart: number
}

interface Aircraft {
  id: number
  radarId: number
  x: number
  y: number
  sizePx: number
  type: 0 | 1 | 2       // 0=fighter, 1=jet, 2=stealth
  angle: number         // heading degrees
  state: "approaching" | "firing" | "done"
  missileTimer: number  // last missile time
  missilesFired: number
}

interface Missile {
  id: number
  x: number
  y: number
  tx: number
  ty: number
  startTime: number
  duration: number
  radarId: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rnd(a: number, b: number) { return a + Math.random() * (b - a) }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
function deg2rad(d: number) { return (d * Math.PI) / 180 }

function durationFromDelta(delta: number): number {
  // Higher delta → faster spin
  if (delta >= 740_000) return 900
  if (delta >= 220_000) return 1600
  if (delta >= 74_000)  return 2600
  if (delta >= 15_000)  return 4000
  return 5500
}

// ─── SVG aircraft shapes ───────────────────────────────────────────────────────
function AircraftSVG({ type, size }: { type: 0 | 1 | 2; size: number }) {
  const s = size
  if (type === 0) {
    // Fighter — sharp delta wing
    return (
      <svg width={s} height={s} viewBox="0 0 40 40" style={{ filter: "drop-shadow(0 0 5px #22d3ee)" }}>
        <polygon points="20,2 30,28 20,22 10,28" fill="#22d3ee" opacity="0.95" />
        <polygon points="20,22 26,34 20,30 14,34" fill="#0e7490" />
        <rect x="19" y="22" width="2" height="8" fill="#67e8f9" />
        {/* cockpit */}
        <ellipse cx="20" cy="12" rx="2.5" ry="4" fill="#a5f3fc" opacity="0.8" />
        {/* engine glow */}
        <circle cx="20" cy="30" r="3" fill="#f97316" opacity="0.6" />
        <circle cx="20" cy="30" r="1.5" fill="#fbbf24" opacity="0.9" />
      </svg>
    )
  }
  if (type === 1) {
    // Jet — swept wings
    return (
      <svg width={s} height={s} viewBox="0 0 40 40" style={{ filter: "drop-shadow(0 0 5px #a78bfa)" }}>
        <polygon points="20,3 24,18 36,24 24,22 22,36 18,36 16,22 4,24 16,18" fill="#a78bfa" opacity="0.95" />
        <ellipse cx="20" cy="10" rx="2" ry="5" fill="#c4b5fd" opacity="0.7" />
        <circle cx="20" cy="30" r="3" fill="#f97316" opacity="0.5" />
        <circle cx="20" cy="30" r="1.5" fill="#fbbf24" opacity="0.85" />
      </svg>
    )
  }
  // Stealth — flat B-2 style
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" style={{ filter: "drop-shadow(0 0 5px #4ade80)" }}>
      <polygon points="20,8 38,30 28,26 20,32 12,26 2,30" fill="#4ade80" opacity="0.9" />
      <polygon points="20,14 30,26 20,24 10,26" fill="#166534" opacity="0.6" />
      <circle cx="20" cy="28" r="2.5" fill="#f97316" opacity="0.5" />
    </svg>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function RadarOverlay({ priceData }: { priceData?: { volume: number; deltaVolume: number } }) {
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  // All mutable state lives in refs so the RAF loop always sees fresh values
  const radarsRef    = useRef<RadarObj[]>([])
  const aircraftRef  = useRef<Aircraft[]>([])
  const missilesRef  = useRef<Missile[]>([])
  const radarId      = useRef(0)
  const aircraftId   = useRef(0)
  const missileId    = useRef(0)
  const lastSpawn    = useRef(0)
  const deltaDuration = useRef(5500)

  // React state only for triggering re-render
  const [, forceRender] = useState(0)
  const renderRef = useRef(0)

  useEffect(() => { setMounted(true) }, [])

  // Sync delta from priceData
  useEffect(() => {
    if (!priceData) return
    deltaDuration.current = durationFromDelta(priceData.deltaVolume)
  }, [priceData])

  // ── Animation loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mounted) return

    const tick = () => {
      const now = Date.now()
      const W = containerRef.current?.clientWidth  ?? 600
      const H = containerRef.current?.clientHeight ?? 300

      // 1. Spawn new radar
      const spawnInterval = deltaDuration.current < 1200 ? 1000
        : deltaDuration.current < 2000 ? 1600
        : deltaDuration.current < 3000 ? 2400 : 3500

      if (now - lastSpawn.current > spawnInterval && radarsRef.current.length < 8) {
        lastSpawn.current = now
        const targetAngle = rnd(0, 360)
        const radius = rnd(80, 240) // some radars will exceed the canvas

        const r: RadarObj = {
          id: radarId.current++,
          x: rnd(0, W),
          y: rnd(0, H),
          radius,
          rotation: 0,
          duration: deltaDuration.current,
          spawnTime: now,
          targetAngle,
          targetColor: Math.random() > 0.35 ? "red" : "yellow",
          waveRadius: 0,
          opacity: 0,
          phase: "spinning",
          fadeStart: 0,
        }
        radarsRef.current.push(r)

        // Spawn aircraft near target dot
        const tx = r.x + Math.cos(deg2rad(targetAngle)) * radius * 0.8
        const ty = r.y + Math.sin(deg2rad(targetAngle)) * radius * 0.8
        const ac: Aircraft = {
          id: aircraftId.current++,
          radarId: r.id,
          x: tx + rnd(-40, 40),
          y: ty + rnd(-40, 40),
          sizePx: rnd(28, 48),
          type: Math.floor(Math.random() * 3) as 0 | 1 | 2,
          angle: targetAngle + 180,
          state: "approaching",
          missileTimer: 0,
          missilesFired: 0,
        }
        aircraftRef.current.push(ac)
      }

      // 2. Update radars
      radarsRef.current = radarsRef.current.filter((r) => {
        const elapsed = now - r.spawnTime
        const spinProgress = Math.min(elapsed / r.duration, 1)

        if (r.phase === "spinning") {
          r.rotation = spinProgress * 360
          r.waveRadius = spinProgress * r.radius
          // Fade in during first 20%, hold, fade out last 30%
          if (spinProgress < 0.2) r.opacity = spinProgress / 0.2
          else if (spinProgress < 0.7) r.opacity = 1
          else r.opacity = 1 - (spinProgress - 0.7) / 0.3

          if (spinProgress >= 1) {
            r.phase = "fading"
            r.fadeStart = now
            r.opacity = 0
          }
        } else {
          // fading — remove after 500ms
          if (now - r.fadeStart > 500) return false
        }
        return true
      })

      // 3. Update aircraft — move toward target dot, then fire
      aircraftRef.current = aircraftRef.current.filter((ac) => {
        const radar = radarsRef.current.find((r) => r.id === ac.radarId)
        if (!radar) return false // radar gone, remove aircraft

        const tx = radar.x + Math.cos(deg2rad(radar.targetAngle)) * radar.radius * 0.8
        const ty = radar.y + Math.sin(deg2rad(radar.targetAngle)) * radar.radius * 0.8

        if (ac.state === "approaching") {
          // Move toward target at 60px/s
          const dx = tx - ac.x
          const dy = ty - ac.y
          const dist = Math.hypot(dx, dy)
          if (dist < 60) {
            ac.state = "firing"
            ac.missileTimer = now
          } else {
            const spd = 60 / 60  // px per frame @60fps
            ac.x += (dx / dist) * spd
            ac.y += (dy / dist) * spd
            ac.angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90
          }
        } else if (ac.state === "firing") {
          // Fire up to 4 missiles, 350ms apart
          if (ac.missilesFired < 4 && now - ac.missileTimer > 350) {
            const m: Missile = {
              id: missileId.current++,
              x: ac.x,
              y: ac.y,
              tx,
              ty,
              startTime: now,
              duration: 700,
              radarId: radar.id,
            }
            missilesRef.current.push(m)
            ac.missileTimer = now
            ac.missilesFired++
          }
          if (ac.missilesFired >= 4) ac.state = "done"
        }
        return true
      })

      // 4. Update missiles — on hit, remove radar → new radar spawns naturally
      missilesRef.current = missilesRef.current.filter((m) => {
        const elapsed = now - m.startTime
        if (elapsed >= m.duration) {
          // Last missile hits → destroy radar
          const isLast = missilesRef.current.filter((ms) => ms.radarId === m.radarId).length <= 1
          if (isLast) {
            radarsRef.current  = radarsRef.current.filter((r) => r.id !== m.radarId)
            aircraftRef.current = aircraftRef.current.filter((a) => a.radarId !== m.radarId)
          }
          return false
        }
        const t = elapsed / m.duration
        // Arc trajectory: slight upward curve
        m.x = lerp(m.x, m.tx, 0.08)
        m.y = lerp(m.y, m.ty, 0.08) - Math.sin(t * Math.PI) * 8
        return true
      })

      // 5. Trigger re-render (throttled to ~60fps)
      renderRef.current++
      if (renderRef.current % 1 === 0) forceRender((n) => n + 1)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [mounted])

  if (!mounted) return <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl" />

  const radars   = radarsRef.current
  const aircraft = aircraftRef.current
  const missiles = missilesRef.current

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl"
      style={{ background: "transparent" }}
    >
      {/* Subtle scan-line grid */}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.06 }} preserveAspectRatio="none">
        <defs>
          <pattern id="rdr-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M50 0L0 0 0 50" fill="none" stroke="#22d3ee" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#rdr-grid)" />
      </svg>

      {/* Radars */}
      {radars.map((r) => {
        const sweepX2 = 100 + Math.cos(deg2rad(r.rotation - 90)) * 90
        const sweepY2 = 100 + Math.sin(deg2rad(r.rotation - 90)) * 90
        const dotX = 100 + Math.cos(deg2rad(r.targetAngle - 90)) * 78
        const dotY = 100 + Math.sin(deg2rad(r.targetAngle - 90)) * 78
        const waveR = (r.waveRadius / r.radius) * 90
        const dotColor = r.targetColor === "red" ? "#ef4444" : "#eab308"
        const dotGlow  = r.targetColor === "red" ? "rgba(239,68,68,0.8)" : "rgba(234,179,8,0.8)"
        const diameter = r.radius * 2

        return (
          <div
            key={r.id}
            className="absolute"
            style={{
              left: r.x,
              top: r.y,
              width: diameter,
              height: diameter,
              transform: "translate(-50%, -50%)",
              opacity: r.opacity,
              pointerEvents: "none",
            }}
          >
            <svg viewBox="0 0 200 200" width={diameter} height={diameter}>
              <defs>
                {/* Sweep gradient: fan/trail */}
                <radialGradient id={`sg-${r.id}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                </radialGradient>
                <filter id={`glow-${r.id}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <clipPath id={`cp-${r.id}`}>
                  <circle cx="100" cy="100" r="95" />
                </clipPath>
              </defs>

              {/* Clipped group so sweep stays inside circle */}
              <g clipPath={`url(#cp-${r.id})`}>
                {/* Radar fill — very dark */}
                <circle cx="100" cy="100" r="95" fill="rgba(0,20,30,0.55)" />

                {/* Concentric rings */}
                {[30, 55, 75, 92].map((rr) => (
                  <circle key={rr} cx="100" cy="100" r={rr} fill="none"
                    stroke="rgba(34,211,238,0.22)" strokeWidth="0.8" />
                ))}

                {/* Cross hairs */}
                <line x1="100" y1="8" x2="100" y2="192" stroke="rgba(34,211,238,0.12)" strokeWidth="0.6" />
                <line x1="8" y1="100" x2="192" y2="100" stroke="rgba(34,211,238,0.12)" strokeWidth="0.6" />

                {/* Sweep fan trail (wedge 60°) */}
                {Array.from({ length: 8 }).map((_, i) => {
                  const trailAngle = r.rotation - 90 - i * 7
                  const tx2 = 100 + Math.cos(deg2rad(trailAngle)) * 90
                  const ty2 = 100 + Math.sin(deg2rad(trailAngle)) * 90
                  return (
                    <line key={i}
                      x1="100" y1="100" x2={tx2} y2={ty2}
                      stroke="rgba(34,211,238,1)"
                      strokeWidth={1.8 - i * 0.18}
                      opacity={(8 - i) / 10}
                    />
                  )
                })}

                {/* Bright sweep line */}
                <line x1="100" y1="100" x2={sweepX2} y2={sweepY2}
                  stroke="#22d3ee" strokeWidth="1.8"
                  style={{ filter: `url(#glow-${r.id})` }} />

                {/* Expanding wave ring */}
                {waveR > 0 && waveR < 95 && (
                  <circle cx="100" cy="100" r={waveR}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="1.5"
                    opacity={Math.max(0, 1 - waveR / 95) * 0.7}
                  />
                )}

                {/* Target dot */}
                <circle cx={dotX} cy={dotY} r="5" fill={dotColor}
                  style={{ filter: `drop-shadow(0 0 6px ${dotGlow})` }}
                />
                {/* Dot ping animation — second ring */}
                <circle cx={dotX} cy={dotY} r={5 + r.waveRadius / r.radius * 8}
                  fill="none" stroke={dotColor} strokeWidth="1"
                  opacity={Math.max(0, 0.8 - r.waveRadius / r.radius)}
                />
              </g>

              {/* Outer ring border */}
              <circle cx="100" cy="100" r="95" fill="none"
                stroke="rgba(34,211,238,0.55)" strokeWidth="1.2"
                style={{ filter: `drop-shadow(0 0 4px rgba(34,211,238,0.6))` }}
              />
            </svg>
          </div>
        )
      })}

      {/* Aircraft */}
      {aircraft.map((ac) => (
        <div
          key={ac.id}
          className="absolute"
          style={{
            left: ac.x,
            top: ac.y,
            transform: `translate(-50%, -50%) rotate(${ac.angle}deg)`,
            pointerEvents: "none",
          }}
        >
          <AircraftSVG type={ac.type} size={ac.sizePx} />
        </div>
      ))}

      {/* Missiles */}
      {missiles.map((m) => {
        const elapsed = Date.now() - m.startTime
        const t = Math.min(elapsed / m.duration, 1)
        const mx = m.x + (m.tx - m.x) * t
        const my = m.y + (m.ty - m.y) * t - Math.sin(t * Math.PI) * 20
        const angle = Math.atan2(m.ty - m.y, m.tx - m.x) * (180 / Math.PI)
        return (
          <div
            key={m.id}
            className="absolute"
            style={{
              left: mx,
              top: my,
              transform: `translate(-50%, -50%) rotate(${angle}deg)`,
              pointerEvents: "none",
            }}
          >
            <svg width="18" height="6" viewBox="0 0 18 6"
              style={{ filter: "drop-shadow(0 0 4px #f97316)" }}>
              {/* Missile body */}
              <rect x="2" y="1.5" width="13" height="3" rx="1.5" fill="#f97316" />
              {/* Nose */}
              <polygon points="15,1.5 18,3 15,4.5" fill="#fbbf24" />
              {/* Exhaust trail */}
              <rect x="0" y="2" width="4" height="2" rx="1" fill="#60a5fa" opacity="0.8" />
            </svg>
          </div>
        )
      })}
    </div>
  )
}

export { RadarOverlay as AquariumOverlay }
