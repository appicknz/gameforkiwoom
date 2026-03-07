"use client"

import { useEffect, useRef, useState } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────
interface RadarObj {
  id: number
  x: number              // center x in px
  y: number              // center y in px
  radius: number         // px — random 80~280, may exceed canvas
  angle: number          // current sweep angle in degrees (0→360)
  duration: number       // ms for one full rotation
  spawnTime: number
  targetAngle: number    // angle where the target dot is placed
  targetColor: "red" | "yellow"
  waveR: number          // expanding wave ring radius
  opacity: number
  phase: "spinning" | "fading"
  fadeStart: number
}

interface Aircraft {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  size: number
  type: 0 | 1 | 2
  angle: number          // visual rotation degrees
  state: "cruising" | "attacking" | "done"
  targetId: number       // radar id to attack
  missilesFired: number
  lastMissile: number
}

interface Missile {
  id: number
  x: number
  y: number
  tx: number             // aimed x (may have jitter)
  ty: number             // aimed y (may have jitter)
  dotX: number           // exact dot x for hit detection
  dotY: number           // exact dot y for hit detection
  vx: number
  vy: number
  startTime: number
  radarId: number
  hit: boolean
}

interface Explosion {
  id: number
  x: number
  y: number
  startTime: number
  duration: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rnd(a: number, b: number) { return a + Math.random() * (b - a) }
function deg2rad(d: number) { return (d * Math.PI) / 180 }

// ─── Aircraft SVGs — neon glow, pointing upward (nose at top) ─────────────────
function AircraftSVG({ type, size }: { type: 0 | 1 | 2; size: number }) {
  if (type === 0) {
    // Fighter — delta wing
    return (
      <svg width={size} height={size} viewBox="0 0 32 36"
        style={{ filter: "drop-shadow(0 0 6px #22d3ee)", overflow: "visible" }}>
        <polygon points="16,1 25,26 16,20 7,26" fill="#22d3ee" />
        <polygon points="16,20 22,30 16,27 10,30" fill="#075985" />
        <ellipse cx="16" cy="11" rx="2.5" ry="4" fill="#a5f3fc" opacity="0.9" />
        <circle cx="16" cy="29" r="3" fill="#f97316" opacity="0.7" />
        <circle cx="16" cy="29" r="1.5" fill="#fef3c7" />
      </svg>
    )
  }
  if (type === 1) {
    // Swept-wing jet
    return (
      <svg width={size} height={size} viewBox="0 0 34 38"
        style={{ filter: "drop-shadow(0 0 6px #a78bfa)", overflow: "visible" }}>
        <polygon points="17,2 21,15 32,21 21,19 19,34 15,34 13,19 2,21 13,15" fill="#a78bfa" />
        <ellipse cx="17" cy="11" rx="2" ry="5" fill="#ede9fe" opacity="0.8" />
        <circle cx="17" cy="28" r="3.5" fill="#f97316" opacity="0.6" />
        <circle cx="17" cy="28" r="1.5" fill="#fef3c7" />
      </svg>
    )
  }
  // Stealth — B-2 style flying wing
  return (
    <svg width={size} height={size} viewBox="0 0 40 30"
      style={{ filter: "drop-shadow(0 0 6px #4ade80)", overflow: "visible" }}>
      <polygon points="20,4 38,26 28,22 20,28 12,22 2,26" fill="#4ade80" />
      <polygon points="20,10 30,22 20,20 10,22" fill="#14532d" opacity="0.7" />
      <circle cx="20" cy="24" r="2.5" fill="#f97316" opacity="0.6" />
    </svg>
  )
}

// ─── Missile SVG ───────────────────────────────────────────────────────────────
function MissileSVG() {
  return (
    <svg width="20" height="7" viewBox="0 0 20 7"
      style={{ filter: "drop-shadow(0 0 5px #f97316)", overflow: "visible" }}>
      <rect x="3" y="2" width="12" height="3" rx="1.5" fill="#fb923c" />
      <polygon points="15,2 20,3.5 15,5" fill="#fbbf24" />
      <rect x="0" y="2.5" width="5" height="2" rx="1" fill="#60a5fa" opacity="0.85" />
    </svg>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function RadarOverlay({ priceData: _priceData }: { priceData?: { volume: number; deltaVolume: number } }) {
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  // All mutable sim state in refs — never stale inside RAF
  const radarsRef     = useRef<RadarObj[]>([])
  const aircraftRef   = useRef<Aircraft[]>([])
  const missilesRef   = useRef<Missile[]>([])
  const explosionsRef = useRef<Explosion[]>([])
  const radarIdRef    = useRef(0)
  const acIdRef       = useRef(0)
  const msIdRef       = useRef(0)
  const exIdRef       = useRef(0)
  const lastSpawnRef  = useRef(0)
  const prevFrameRef  = useRef(0)

  const [tick, setTick] = useState(0) // triggers re-render

  useEffect(() => { setMounted(true) }, [])

  // ── Simulation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mounted) return

    const simulate = (now: number) => {
      const dt = prevFrameRef.current ? Math.min((now - prevFrameRef.current) / 1000, 0.05) : 0.016
      prevFrameRef.current = now

      const W = containerRef.current?.clientWidth  ?? 600
      const H = containerRef.current?.clientHeight ?? 300

      // ── Spawn radar — max 1 on screen at a time ────────────────────────
      if (radarsRef.current.length === 0 && now - lastSpawnRef.current > 1500) {
        lastSpawnRef.current = now
        const targetAngle = rnd(0, 360)
        // Random radius — some large enough to exceed canvas edge (50~320)
        const radius = rnd(50, 320)
        const r: RadarObj = {
          id: radarIdRef.current++,
          x: rnd(W * 0.15, W * 0.85),
          y: rnd(H * 0.15, H * 0.85),
          radius,
          angle: 0,
          duration: rnd(3000, 6000),
          spawnTime: now,
          targetAngle,
          targetColor: Math.random() > 0.4 ? "red" : "yellow",
          waveR: 0,
          opacity: 0,
          phase: "spinning",
          fadeStart: 0,
        }
        radarsRef.current.push(r)
      }

      // ── Spawn aircraft — max 3 total, from outside canvas edge ─────────
      if (aircraftRef.current.filter(a => a.state !== "done").length < 3) {
        for (const r of radarsRef.current) {
          if (r.phase !== "spinning") continue
          const activeForRadar = aircraftRef.current.filter(
            (a) => a.targetId === r.id && a.state !== "done"
          ).length
          // Allow up to 3 aircraft total targeting the same radar
          if (activeForRadar < 3 && aircraftRef.current.filter(a => a.state !== "done").length < 3) {
            const edge = Math.floor(rnd(0, 4))
            let sx = 0, sy = 0
            if (edge === 0)      { sx = rnd(0, W);  sy = -60 }
            else if (edge === 1) { sx = W + 60;     sy = rnd(0, H) }
            else if (edge === 2) { sx = rnd(0, W);  sy = H + 60 }
            else                 { sx = -60;         sy = rnd(0, H) }

            // Target dot world position
            const tdx = r.x + Math.cos(deg2rad(r.targetAngle)) * r.radius * 0.72
            const tdy = r.y + Math.sin(deg2rad(r.targetAngle)) * r.radius * 0.72
            const dist = Math.hypot(tdx - sx, tdy - sy)
            const speed = rnd(100, 180)
            const ac: Aircraft = {
              id: acIdRef.current++,
              x: sx,
              y: sy,
              vx: (tdx - sx) / dist * speed,
              vy: (tdy - sy) / dist * speed,
              size: rnd(28, 52),
              type: Math.floor(Math.random() * 3) as 0 | 1 | 2,
              angle: Math.atan2(tdy - sy, tdx - sx) * (180 / Math.PI) + 90,
              state: "cruising",
              targetId: r.id,
              missilesFired: 0,
              lastMissile: 0,
            }
            aircraftRef.current.push(ac)
            break
          }
        }
      }

      // ── Update radars ────────────────────────────────────────────────────
      radarsRef.current = radarsRef.current.filter((r) => {
        if (r.phase === "spinning") {
          const elapsed = now - r.spawnTime
          const progress = Math.min(elapsed / r.duration, 1)
          r.angle = progress * 360
          r.waveR = progress * r.radius
          // opacity: fade in 0→0.2, hold 0.2→0.75, fade out 0.75→1
          if (progress < 0.2) r.opacity = progress / 0.2
          else if (progress < 0.75) r.opacity = 1
          else r.opacity = 1 - (progress - 0.75) / 0.25

          if (progress >= 1) {
            r.phase = "fading"
            r.fadeStart = now
          }
        } else {
          const fadeElapsed = now - r.fadeStart
          if (fadeElapsed > 600) return false
          r.opacity = Math.max(0, 1 - fadeElapsed / 600)
        }
        return true
      })

      // ── Update aircraft ──────────────────────────────────────────────────
      aircraftRef.current = aircraftRef.current.filter((ac) => {
        if (ac.state === "done") return false
        const radar = radarsRef.current.find((r) => r.id === ac.targetId)
        if (!radar && ac.state === "attacking") return false

        // Target dot world position
        const tdx = radar
          ? radar.x + Math.cos(deg2rad(radar.targetAngle)) * radar.radius * 0.72
          : ac.x + ac.vx * 100
        const tdy = radar
          ? radar.y + Math.sin(deg2rad(radar.targetAngle)) * radar.radius * 0.72
          : ac.y + ac.vy * 100

        const dTx = tdx - ac.x
        const dTy = tdy - ac.y
        const distToTarget = Math.hypot(dTx, dTy)

        if (ac.state === "cruising") {
          // Gradually steer toward target
          const targetAngle = Math.atan2(dTy, dTx)
          const speed = Math.hypot(ac.vx, ac.vy)
          const curAngle = Math.atan2(ac.vy, ac.vx)
          const turnRate = 2.0 * dt // rad/s
          let diff = targetAngle - curAngle
          while (diff > Math.PI) diff -= 2 * Math.PI
          while (diff < -Math.PI) diff += 2 * Math.PI
          const newAngle = curAngle + Math.sign(diff) * Math.min(Math.abs(diff), turnRate)
          ac.vx = Math.cos(newAngle) * speed
          ac.vy = Math.sin(newAngle) * speed
          ac.angle = newAngle * (180 / Math.PI) + 90
          ac.x += ac.vx * dt
          ac.y += ac.vy * dt

          // Within firing range → start attacking
          if (distToTarget < 120 && radar) ac.state = "attacking"
        } else if (ac.state === "attacking") {
          // Orbit around target loosely
          ac.x += ac.vx * dt * 0.4
          ac.y += ac.vy * dt * 0.4

          // Fire missile — add inaccuracy so some miss
          if (ac.missilesFired < 5 && now - ac.lastMissile > 600 && radar) {
            const spd = rnd(200, 320)
            const dist2 = Math.hypot(dTx, dTy)
            // Random accuracy jitter: ±20px offset on the target
            const jitterX = rnd(-20, 20)
            const jitterY = rnd(-20, 20)
            const aimX = tdx + jitterX
            const aimY = tdy + jitterY
            const dAX = aimX - ac.x
            const dAY = aimY - ac.y
            const distAim = Math.hypot(dAX, dAY)
            const m: Missile = {
              id: msIdRef.current++,
              x: ac.x,
              y: ac.y,
              tx: aimX,  // where the missile is aimed (with jitter)
              ty: aimY,
              vx: (dAX / distAim) * spd,
              vy: (dAY / distAim) * spd,
              startTime: now,
              radarId: radar.id,
              hit: false,
              // Store exact dot position for hit detection
              dotX: tdx,
              dotY: tdy,
            }
            missilesRef.current.push(m)
            ac.lastMissile = now
            ac.missilesFired++
          }
          if (ac.missilesFired >= 5) ac.state = "done"
        }

        // Remove aircraft that flew way off screen (> 200px outside)
        if (ac.x < -200 || ac.x > W + 200 || ac.y < -200 || ac.y > H + 200) return false
        return true
      })

      // ── Update missiles ──────────────────────────────────────────────────
      missilesRef.current = missilesRef.current.filter((m) => {
        m.x += m.vx * dt
        m.y += m.vy * dt

        // Check proximity to aimed target (missile expired at destination)
        const distToAim = Math.hypot(m.tx - m.x, m.ty - m.y)
        if (distToAim < 10) {
          // Missile reached its aimed point — check if it actually hit the dot
          const distToDot = Math.hypot(m.dotX - m.x, m.dotY - m.y)
          if (distToDot < 18) {
            // DIRECT HIT on the dot — destroy radar immediately
            m.hit = true
            explosionsRef.current.push({
              id: exIdRef.current++,
              x: m.dotX,
              y: m.dotY,
              startTime: now,
              duration: 700,
            })
            radarsRef.current   = radarsRef.current.filter((r) => r.id !== m.radarId)
            aircraftRef.current = aircraftRef.current.filter((a) => a.targetId !== m.radarId)
            missilesRef.current = missilesRef.current.filter(
              (ms) => ms === m || ms.radarId !== m.radarId
            )
          }
          // Whether hit or miss, this missile is done
          return false
        }
        // Missile still in flight — radar untouched

        // Out of bounds
        if (m.x < -100 || m.x > W + 100 || m.y < -100 || m.y > H + 100) return false
        return true
      })

      // ── Update explosions ────────────────────────────────────────────────
      explosionsRef.current = explosionsRef.current.filter(
        (e) => now - e.startTime < e.duration
      )

      setTick((n) => n + 1)
      rafRef.current = requestAnimationFrame(simulate)
    }

    rafRef.current = requestAnimationFrame(simulate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [mounted])

  if (!mounted) return <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl" />

  const radars     = radarsRef.current
  const aircraft   = aircraftRef.current
  const missiles   = missilesRef.current
  const explosions = explosionsRef.current

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl"
      style={{ background: "transparent" }}
    >
      {/* ── Radars ── */}
      {radars.map((r) => {
        const d = r.radius * 2
        // Sweep line end point in SVG coords (viewBox 0 0 200 200, center 100,100)
        const sweepRad = deg2rad(r.angle - 90)
        const sx = 100 + Math.cos(sweepRad) * 92
        const sy = 100 + Math.sin(sweepRad) * 92

        // Target dot in SVG coords
        const dotRad = deg2rad(r.targetAngle - 90)
        const dx = 100 + Math.cos(dotRad) * 76
        const dy = 100 + Math.sin(dotRad) * 76

        // Wave ring in SVG coords (proportional)
        const waveRsvg = (r.waveR / r.radius) * 92

        const dotColor = r.targetColor === "red" ? "#ef4444" : "#eab308"
        const dotShadow = r.targetColor === "red" ? "#ef4444" : "#eab308"

        return (
          <div
            key={r.id}
            className="absolute"
            style={{
              left: r.x,
              top: r.y,
              width: d,
              height: d,
              transform: "translate(-50%,-50%)",
              opacity: r.opacity,
              pointerEvents: "none",
            }}
          >
            <svg viewBox="0 0 200 200" width={d} height={d} overflow="visible">
              <defs>
                <filter id={`glow-r${r.id}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id={`glow-d${r.id}`} x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="4" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <clipPath id={`clip-${r.id}`}>
                  <circle cx="100" cy="100" r="92" />
                </clipPath>
              </defs>

              {/* ── Radar interior — fully transparent (no fill) ── */}
              <g clipPath={`url(#clip-${r.id})`}>
                {/* Concentric range rings */}
                {[24, 46, 68, 90].map((rr) => (
                  <circle key={rr} cx="100" cy="100" r={rr}
                    fill="none" stroke="rgba(34,211,238,0.18)" strokeWidth="0.8"
                    strokeDasharray={rr < 50 ? "3 6" : "4 8"} />
                ))}

                {/* Cross hairs */}
                <line x1="100" y1="8"   x2="100" y2="192" stroke="rgba(34,211,238,0.12)" strokeWidth="0.6" />
                <line x1="8"   y1="100" x2="192" y2="100" stroke="rgba(34,211,238,0.12)" strokeWidth="0.6" />
                <line x1="36"  y1="36"  x2="164" y2="164" stroke="rgba(34,211,238,0.06)" strokeWidth="0.5" />
                <line x1="164" y1="36"  x2="36"  y2="164" stroke="rgba(34,211,238,0.06)" strokeWidth="0.5" />

                {/* Sweep trail — single fan arc (40° wide), fading gradient */}
                {(() => {
                  const trailDeg = 40
                  const sweepA = deg2rad(r.angle - 90)
                  const trailA = deg2rad(r.angle - 90 - trailDeg)
                  const ex1 = 100 + Math.cos(sweepA) * 92
                  const ey1 = 100 + Math.sin(sweepA) * 92
                  const ex2 = 100 + Math.cos(trailA) * 92
                  const ey2 = 100 + Math.sin(trailA) * 92
                  const midA = deg2rad(r.angle - 90 - trailDeg / 2)
                  const mx = 100 + Math.cos(midA) * 92
                  const my = 100 + Math.sin(midA) * 92
                  const gradId = `sweep-grad-${r.id}`
                  return (
                    <>
                      <defs>
                        <linearGradient id={gradId} x1="100" y1="100" x2={mx} y2={my} gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
                          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.18" />
                        </linearGradient>
                      </defs>
                      {/* Fan fill */}
                      <path
                        d={`M 100 100 L ${ex2} ${ey2} A 92 92 0 0 1 ${ex1} ${ey1} Z`}
                        fill={`url(#${gradId})`}
                      />
                      {/* Single bright sweep line */}
                      <line x1="100" y1="100" x2={sx} y2={sy}
                        stroke="#22d3ee" strokeWidth="1.8"
                        filter={`url(#glow-r${r.id})`} />
                    </>
                  )
                })()}

                {/* Expanding wave ring */}
                {waveRsvg > 2 && waveRsvg < 93 && (
                  <circle cx="100" cy="100" r={waveRsvg}
                    fill="none" stroke="#22d3ee" strokeWidth="1.5"
                    opacity={Math.max(0, (1 - waveRsvg / 93) * 0.65)} />
                )}

                {/* Target dot */}
                <circle cx={dx} cy={dy} r="5" fill={dotColor}
                  filter={`url(#glow-d${r.id})`} />
                {/* Pulsing outer ring on dot */}
                <circle cx={dx} cy={dy} r={5 + (r.waveR / r.radius) * 10}
                  fill="none" stroke={dotColor} strokeWidth="1"
                  opacity={Math.max(0, 0.7 - r.waveR / r.radius)} />
              </g>

              {/* Outer border ring — neon glow */}
              <circle cx="100" cy="100" r="92"
                fill="none"
                stroke="rgba(34,211,238,0.6)"
                strokeWidth="1.5"
                filter={`url(#glow-r${r.id})`} />
            </svg>
          </div>
        )
      })}

      {/* ── Aircraft ── */}
      {aircraft.map((ac) => (
        <div
          key={ac.id}
          className="absolute"
          style={{
            left: ac.x,
            top: ac.y,
            transform: `translate(-50%,-50%) rotate(${ac.angle}deg)`,
            pointerEvents: "none",
            willChange: "transform",
          }}
        >
          <AircraftSVG type={ac.type} size={ac.size} />
        </div>
      ))}

      {/* ── Missiles ── */}
      {missiles.map((m) => {
        const angle = Math.atan2(m.vy, m.vx) * (180 / Math.PI)
        return (
          <div
            key={m.id}
            className="absolute"
            style={{
              left: m.x,
              top: m.y,
              transform: `translate(-50%,-50%) rotate(${angle}deg)`,
              pointerEvents: "none",
              willChange: "transform",
            }}
          >
            <MissileSVG />
          </div>
        )
      })}

      {/* ── Explosions ── */}
      {explosions.map((e) => {
        const prog = (Date.now() - e.startTime) / e.duration
        const r1 = prog * 28
        const r2 = prog * 18
        return (
          <div
            key={e.id}
            className="absolute"
            style={{ left: e.x, top: e.y, pointerEvents: "none" }}
          >
            <svg width={60} height={60} viewBox="0 0 60 60"
              style={{ transform: "translate(-50%,-50%)", overflow: "visible" }}>
              <circle cx="30" cy="30" r={r1}
                fill="none" stroke="#f97316"
                strokeWidth="2"
                opacity={Math.max(0, 1 - prog)} />
              <circle cx="30" cy="30" r={r2}
                fill="none" stroke="#fbbf24"
                strokeWidth="1.5"
                opacity={Math.max(0, 0.8 - prog)} />
              <circle cx="30" cy="30" r={r2 * 0.5}
                fill="#fef3c7"
                opacity={Math.max(0, 0.9 - prog * 1.5)} />
            </svg>
          </div>
        )
      })}
    </div>
  )
}

export { RadarOverlay as AquariumOverlay }
