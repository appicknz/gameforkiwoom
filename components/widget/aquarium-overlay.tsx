"use client"

import { useEffect, useRef } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────
interface RadarBlip {
  angle: number       // 각도 (레이더 원 안)
  r: number           // 반지름 비율 0~1
  hitAt: number | null  // sweep이 통과한 타임스탬프 (null=아직 미통과)
  size: number        // 점 크기 (px)
}

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
  blips: RadarBlip[]   // 여러 개의 점들 (순차 페이드아웃)
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
// All jets: nose points UP (local -Y). Size s is a scale unit.
// Each design is clearly more detailed than a toy — fuselage, delta wings,
// canopy, engine intakes, twin nozzles, vertical stabilizers.

// ── Type A: F-22 Raptor style (twin-engine, twin-tail, delta wing) ────────────
function drawAircraftA(ctx: CanvasRenderingContext2D, s: number) {
  const HULL  = "#0e2010"
  const EDGE  = "#00ff88"
  const GLOW  = "#00ff88"
  const DIM   = "rgba(0,255,136,0.25)"

  ctx.shadowBlur = 0

  // === Main fuselage (narrow tapered body) ===
  ctx.beginPath()
  ctx.moveTo(0, -s * 1.3)             // sharp nose tip
  ctx.bezierCurveTo(-s*0.08, -s*0.9, -s*0.18, -s*0.4, -s*0.2, s*0.2)
  ctx.lineTo(-s*0.18, s*0.85)
  ctx.lineTo(s*0.18, s*0.85)
  ctx.lineTo(s*0.2, s*0.2)
  ctx.bezierCurveTo(s*0.18, -s*0.4, s*0.08, -s*0.9, 0, -s*1.3)
  ctx.closePath()
  ctx.fillStyle = HULL; ctx.fill()
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.9
  ctx.shadowBlur = 6; ctx.shadowColor = GLOW; ctx.stroke(); ctx.shadowBlur = 0

  // === Delta main wings (large, swept back sharply) ===
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * s * 0.18, -s * 0.1)   // wing root leading edge
    ctx.lineTo(side * s * 1.35, s * 0.65)   // outer wing tip
    ctx.lineTo(side * s * 0.9,  s * 0.75)   // trailing edge outer
    ctx.lineTo(side * s * 0.18, s * 0.55)   // wing root trailing edge
    ctx.closePath()
    ctx.fillStyle = "#0d1e10"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.8
    ctx.shadowBlur = 5; ctx.shadowColor = GLOW; ctx.stroke(); ctx.shadowBlur = 0
    // Wing panel line
    ctx.beginPath()
    ctx.moveTo(side * s * 0.4, s * 0.1)
    ctx.lineTo(side * s * 1.1, s * 0.6)
    ctx.strokeStyle = DIM; ctx.lineWidth = 0.5; ctx.stroke()
  }

  // === Twin canted vertical stabilizers ===
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * s * 0.12, s * 0.2)
    ctx.lineTo(side * s * 0.25, -s * 0.3)
    ctx.lineTo(side * s * 0.35, -s * 0.1)
    ctx.lineTo(side * s * 0.22, s * 0.45)
    ctx.closePath()
    ctx.fillStyle = "#112018"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.7; ctx.stroke()
  }

  // === Engine air intakes (DSI-style, under fuselage sides) ===
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.rect(side * s * 0.12, s * 0.0, side > 0 ? s * 0.15 : -s * 0.15, s * 0.35)
    ctx.fillStyle = "#051008"; ctx.fill()
    ctx.strokeStyle = "rgba(0,255,136,0.4)"; ctx.lineWidth = 0.6; ctx.stroke()
    // intake highlight
    ctx.beginPath()
    ctx.moveTo(side * s * 0.12, s * 0.02)
    ctx.lineTo(side * s * (0.12 + (side > 0 ? 0.15 : -0.15)), s * 0.02)
    ctx.strokeStyle = "rgba(0,229,255,0.5)"; ctx.lineWidth = 0.8; ctx.stroke()
  }

  // === Spine dorsal line ===
  ctx.beginPath()
  ctx.moveTo(0, -s * 1.3); ctx.lineTo(0, s * 0.85)
  ctx.strokeStyle = DIM; ctx.lineWidth = 0.5; ctx.stroke()

  // === Canopy (bubble, sits on mid fuselage) ===
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.65, s * 0.1, s * 0.26, 0, 0, TWO_PI)
  ctx.fillStyle = "rgba(0,200,255,0.45)"
  ctx.strokeStyle = "rgba(0,229,255,0.8)"; ctx.lineWidth = 0.7
  ctx.fill(); ctx.stroke()
  // Canopy frame
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.91); ctx.lineTo(0, -s * 0.39)
  ctx.strokeStyle = "rgba(0,229,255,0.5)"; ctx.lineWidth = 0.5; ctx.stroke()

  // === Twin engine nozzles ===
  for (const side of [-1, 1]) {
    const nx = side * s * 0.09
    // nozzle ring
    ctx.beginPath()
    ctx.ellipse(nx, s * 0.86, s * 0.07, s * 0.04, 0, 0, TWO_PI)
    ctx.fillStyle = "#000a04"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.7; ctx.stroke()
    // afterburner flame
    ctx.beginPath()
    ctx.moveTo(nx - s*0.07, s * 0.86)
    ctx.bezierCurveTo(nx - s*0.04, s*1.05, nx + s*0.04, s*1.05, nx + s*0.07, s*0.86)
    ctx.fillStyle = "rgba(255,100,0,0.9)"; ctx.fill()
    // inner glow
    ctx.beginPath()
    ctx.moveTo(nx - s*0.04, s * 0.88)
    ctx.bezierCurveTo(nx - s*0.02, s*1.02, nx + s*0.02, s*1.02, nx + s*0.04, s*0.88)
    ctx.fillStyle = "rgba(255,220,80,0.9)"; ctx.fill()
  }

  // === Weapon hardpoints on wing ===
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.rect(side * s * 0.6 - s*0.03, s * 0.35, s * 0.06, s * 0.15)
    ctx.fillStyle = "#203020"; ctx.fill()
    ctx.strokeStyle = "rgba(0,255,136,0.3)"; ctx.lineWidth = 0.5; ctx.stroke()
  }
}

// ── Type B: Su-57 Felon style (twin-engine, forward-swept, canards) ───────────
function drawAircraftB(ctx: CanvasRenderingContext2D, s: number) {
  const HULL  = "#08101e"
  const EDGE  = "#00d4ff"
  const GLOW  = "#00d4ff"
  const DIM   = "rgba(0,212,255,0.2)"

  ctx.shadowBlur = 0

  // === Main fuselage (wide, flattened) ===
  ctx.beginPath()
  ctx.moveTo(0, -s * 1.3)               // sharp nose
  ctx.bezierCurveTo(-s*0.12, -s*0.6, -s*0.28, -s*0.1, -s*0.28, s*0.4)
  ctx.lineTo(-s*0.22, s*0.9)
  ctx.lineTo(s*0.22, s*0.9)
  ctx.lineTo(s*0.28, s*0.4)
  ctx.bezierCurveTo(s*0.28, -s*0.1, s*0.12, -s*0.6, 0, -s*1.3)
  ctx.closePath()
  ctx.fillStyle = HULL; ctx.fill()
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.9
  ctx.shadowBlur = 7; ctx.shadowColor = GLOW; ctx.stroke(); ctx.shadowBlur = 0

  // === LERX (Leading Edge Root Extensions) — wide chine strakes ===
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * s * 0.05, -s * 1.1)
    ctx.lineTo(side * s * 0.45, -s * 0.2)
    ctx.lineTo(side * s * 0.28, s * 0.3)
    ctx.closePath()
    ctx.fillStyle = "#0a1825"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.7; ctx.stroke()
  }

  // === Main delta wings (very wide) ===
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * s * 0.28, -s * 0.0)
    ctx.lineTo(side * s * 1.4, s * 0.55)
    ctx.lineTo(side * s * 1.05, s * 0.72)
    ctx.lineTo(side * s * 0.22, s * 0.6)
    ctx.closePath()
    ctx.fillStyle = "#0a1520"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.8
    ctx.shadowBlur = 5; ctx.shadowColor = GLOW; ctx.stroke(); ctx.shadowBlur = 0
    // Panel line
    ctx.beginPath()
    ctx.moveTo(side * s * 0.55, s * 0.1)
    ctx.lineTo(side * s * 1.2, s * 0.55)
    ctx.strokeStyle = DIM; ctx.lineWidth = 0.5; ctx.stroke()
    // Aileron segment
    ctx.beginPath()
    ctx.moveTo(side * s * 0.7, s * 0.48)
    ctx.lineTo(side * s * 1.0, s * 0.58)
    ctx.lineTo(side * s * 1.05, s * 0.72)
    ctx.lineTo(side * s * 0.72, s * 0.65)
    ctx.closePath()
    ctx.fillStyle = "#0d1c2a"; ctx.fill()
    ctx.strokeStyle = "rgba(0,212,255,0.4)"; ctx.lineWidth = 0.6; ctx.stroke()
  }

  // === Canards (small forward fins) ===
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * s * 0.22, -s * 0.55)
    ctx.lineTo(side * s * 0.65, -s * 0.2)
    ctx.lineTo(side * s * 0.55, -s * 0.05)
    ctx.lineTo(side * s * 0.28, -s * 0.3)
    ctx.closePath()
    ctx.fillStyle = "#0e1e30"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.7; ctx.stroke()
  }

  // === Twin vertical tails (splayed outward) ===
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(side * s * 0.15, s * 0.25)
    ctx.rotate(side * 0.18)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(side * s * 0.22, -s * 0.55)
    ctx.lineTo(side * s * 0.28, -s * 0.35)
    ctx.lineTo(side * s * 0.04, s * 0.22)
    ctx.closePath()
    ctx.fillStyle = "#0e1e30"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.7; ctx.stroke()
    ctx.restore()
  }

  // === Twin engine nacelles (prominent on rear) ===
  for (const side of [-1, 1]) {
    const nx = side * s * 0.11
    // nacelle body
    ctx.beginPath()
    ctx.rect(nx - s*0.09, s*0.5, s*0.18, s*0.35)
    ctx.fillStyle = "#060e18"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.7; ctx.stroke()
    // nozzle ring
    ctx.beginPath()
    ctx.ellipse(nx, s * 0.87, s * 0.09, s * 0.05, 0, 0, TWO_PI)
    ctx.fillStyle = "#02070f"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.8; ctx.stroke()
    // afterburner
    ctx.beginPath()
    ctx.moveTo(nx - s*0.09, s*0.87)
    ctx.bezierCurveTo(nx - s*0.05, s*1.08, nx + s*0.05, s*1.08, nx + s*0.09, s*0.87)
    ctx.fillStyle = "rgba(255,110,0,0.9)"; ctx.fill()
    ctx.beginPath()
    ctx.moveTo(nx - s*0.05, s*0.89)
    ctx.bezierCurveTo(nx - s*0.025, s*1.05, nx + s*0.025, s*1.05, nx + s*0.05, s*0.89)
    ctx.fillStyle = "rgba(255,230,100,0.85)"; ctx.fill()
  }

  // === Intakes (rectangular, LERX-mounted) ===
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.rect(side * s * 0.1, s * 0.05, side > 0 ? s*0.22 : -s*0.22, s*0.28)
    ctx.fillStyle = "#030b12"; ctx.fill()
    ctx.strokeStyle = "rgba(0,212,255,0.45)"; ctx.lineWidth = 0.7; ctx.stroke()
  }

  // === Canopy ===
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.68, s * 0.13, s * 0.28, 0, 0, TWO_PI)
  ctx.fillStyle = "rgba(0,200,255,0.4)"
  ctx.strokeStyle = "rgba(0,229,255,0.85)"; ctx.lineWidth = 0.7
  ctx.fill(); ctx.stroke()

  // === Nose pitot ===
  ctx.beginPath()
  ctx.moveTo(0, -s * 1.3); ctx.lineTo(0, -s * 1.55)
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.8; ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, -s * 1.56, s * 0.02, 0, TWO_PI)
  ctx.fillStyle = EDGE; ctx.fill()
}

// ── Type C: B-2 Spirit style stealth flying wing (no tail, blended body) ─────
function drawAircraftC(ctx: CanvasRenderingContext2D, s: number) {
  const HULL = "#101008"
  const EDGE = "#aaff00"
  const GLOW = "#aaff00"
  const DIM  = "rgba(170,255,0,0.2)"

  ctx.shadowBlur = 0

  // === Blended flying wing (complex 12-point outline) ===
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.55)              // nose center
  ctx.bezierCurveTo(-s*0.15, -s*0.5, -s*0.55, -s*0.25, -s*0.75, -s*0.05)
  ctx.lineTo(-s * 1.5, s * 0.38)        // far left tip
  ctx.bezierCurveTo(-s*1.5, s*0.5, -s*1.3, s*0.55, -s*1.1, s*0.52)
  ctx.lineTo(-s * 0.7, s * 0.45)
  ctx.bezierCurveTo(-s*0.5, s*0.6, -s*0.2, s*0.68, -s*0.08, s*0.68)
  ctx.lineTo(0, s * 0.62)               // center trailing notch
  ctx.lineTo(s * 0.08, s * 0.68)
  ctx.bezierCurveTo(s*0.2, s*0.68, s*0.5, s*0.6, s*0.7, s*0.45)
  ctx.lineTo(s * 1.1, s * 0.52)
  ctx.bezierCurveTo(s*1.3, s*0.55, s*1.5, s*0.5, s*1.5, s*0.38)
  ctx.lineTo(s * 0.75, -s * 0.05)
  ctx.bezierCurveTo(s*0.55, -s*0.25, s*0.15, -s*0.5, 0, -s*0.55)
  ctx.closePath()
  ctx.fillStyle = HULL; ctx.fill()
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.8
  ctx.shadowBlur = 5; ctx.shadowColor = GLOW; ctx.stroke(); ctx.shadowBlur = 0

  // === Wing panel lines (sawtooth-edge stealth) ===
  const panels = [
    [[-s*0.35, s*0.1], [-s*1.2, s*0.35]],
    [[s*0.35, s*0.1], [s*1.2, s*0.35]],
    [[-s*0.55, -s*0.15], [-s*0.2, s*0.6]],
    [[s*0.55, -s*0.15], [s*0.2, s*0.6]],
  ]
  ctx.strokeStyle = DIM; ctx.lineWidth = 0.5
  for (const [[x1, y1], [x2, y2]] of panels) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }

  // === Crew hump (blended fuselage spine) ===
  ctx.beginPath()
  ctx.ellipse(0, s*0.05, s*0.18, s*0.38, 0, 0, TWO_PI)
  ctx.fillStyle = "#181808"; ctx.fill()
  ctx.strokeStyle = "rgba(170,255,0,0.35)"; ctx.lineWidth = 0.6; ctx.stroke()

  // === Cockpit windows (two side-by-side) ===
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(side * s * 0.07, -s * 0.28, s * 0.055, s * 0.08, side * 0.15, 0, TWO_PI)
    ctx.fillStyle = "rgba(0,200,255,0.5)"; ctx.fill()
    ctx.strokeStyle = "rgba(0,229,255,0.8)"; ctx.lineWidth = 0.5; ctx.stroke()
  }

  // === 4 engine exhausts (embedded in trailing edge) ===
  const exhaustX = [-s*0.38, -s*0.14, s*0.14, s*0.38]
  for (const ex of exhaustX) {
    ctx.beginPath()
    ctx.ellipse(ex, s * 0.55, s * 0.07, s * 0.03, 0, 0, TWO_PI)
    ctx.fillStyle = "#050502"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.6; ctx.stroke()
    // glow
    ctx.beginPath()
    ctx.ellipse(ex, s * 0.58, s * 0.05, s * 0.025, 0, 0, TWO_PI)
    ctx.fillStyle = "rgba(255,100,0,0.7)"; ctx.fill()
  }

  // === Sawtooth trailing edge markings ===
  ctx.beginPath()
  ctx.moveTo(-s*0.08, s*0.68)
  ctx.lineTo(-s*0.04, s*0.72); ctx.lineTo(0, s*0.62)
  ctx.lineTo(s*0.04, s*0.72); ctx.lineTo(s*0.08, s*0.68)
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.7; ctx.stroke()
}

// D: Battlecruiser — massive wedge-hull capital ship (Starcraft BC style)
// Nose at local (0, -s*1.1), tail at (0, s*1.1). Very wide, heavily armored.
function drawAircraftD(ctx: CanvasRenderingContext2D, s: number) {
  const HULL   = "#1a2030"
  const HULL2  = "#252d40"
  const CYAN   = "#00e5ff"
  const EDGE   = "rgba(0,229,255,0.55)"
  const DIM    = "rgba(0,229,255,0.18)"
  ctx.shadowBlur = 0

  // === Outer sponson pods (port/starboard) ===
  for (const side of [-1, 1]) {
    // Sponson hull
    ctx.beginPath()
    ctx.moveTo(side * s * 0.55, -s * 0.65)
    ctx.lineTo(side * s * 1.0,  -s * 0.2)
    ctx.lineTo(side * s * 1.05,  s * 0.4)
    ctx.lineTo(side * s * 0.7,   s * 0.7)
    ctx.lineTo(side * s * 0.45,  s * 0.5)
    ctx.lineTo(side * s * 0.42, -s * 0.4)
    ctx.closePath()
    ctx.fillStyle = HULL; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.7; ctx.stroke()
    // Sponson gun barrel
    ctx.beginPath()
    ctx.moveTo(side * s * 0.78, -s * 0.45)
    ctx.lineTo(side * s * 1.1,  -s * 0.6)
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1.0; ctx.stroke()
    // Engine vent
    ctx.beginPath()
    ctx.ellipse(side * s * 0.72, s * 0.55, s * 0.12, s * 0.07, 0, 0, TWO_PI)
    ctx.fillStyle = "rgba(255,120,0,0.8)"; ctx.fill()
  }

  // === Main hull (wide trapezoid) ===
  ctx.beginPath()
  ctx.moveTo(0,          -s * 1.1)   // prow
  ctx.lineTo(-s * 0.42,  -s * 0.55)
  ctx.lineTo(-s * 0.45,   s * 0.6)
  ctx.lineTo(-s * 0.28,   s * 1.0)
  ctx.lineTo(0,           s * 1.1)
  ctx.lineTo(s * 0.28,    s * 1.0)
  ctx.lineTo(s * 0.45,    s * 0.6)
  ctx.lineTo(s * 0.42,   -s * 0.55)
  ctx.closePath()
  ctx.fillStyle = HULL2; ctx.fill()
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.9; ctx.stroke()

  // === Deck plating lines ===
  const deckLines = [-0.3, 0.05, 0.4, 0.75]
  for (const yf of deckLines) {
    const hw = yf < 0 ? s * 0.35 : s * 0.42
    ctx.beginPath()
    ctx.moveTo(-hw, s * yf); ctx.lineTo(hw, s * yf)
    ctx.strokeStyle = DIM; ctx.lineWidth = 0.5; ctx.stroke()
  }
  // Spine
  ctx.beginPath()
  ctx.moveTo(0, -s * 1.1); ctx.lineTo(0, s * 1.1)
  ctx.strokeStyle = DIM; ctx.lineWidth = 0.5; ctx.stroke()

  // === Command tower (superstructure) ===
  ctx.beginPath()
  ctx.moveTo(-s * 0.14, -s * 0.55)
  ctx.lineTo(-s * 0.18,  s * 0.1)
  ctx.lineTo(-s * 0.12,  s * 0.3)
  ctx.lineTo(s * 0.12,   s * 0.3)
  ctx.lineTo(s * 0.18,   s * 0.1)
  ctx.lineTo(s * 0.14,  -s * 0.55)
  ctx.closePath()
  ctx.fillStyle = "#2a3550"; ctx.fill()
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.7; ctx.stroke()
  // Bridge window strip
  ctx.beginPath()
  ctx.rect(-s * 0.1, -s * 0.4, s * 0.2, s * 0.1)
  ctx.fillStyle = "rgba(0,229,255,0.25)"; ctx.fill()
  ctx.strokeStyle = CYAN; ctx.lineWidth = 0.5; ctx.stroke()

  // === Yamato Cannon (primary weapon — centered prow) ===
  // Barrel housing
  ctx.beginPath()
  ctx.moveTo(-s * 0.07, -s * 0.7)
  ctx.lineTo(s * 0.07,  -s * 0.7)
  ctx.lineTo(s * 0.05,  -s * 1.35)
  ctx.lineTo(-s * 0.05, -s * 1.35)
  ctx.closePath()
  ctx.fillStyle = "#0d1520"; ctx.fill()
  ctx.strokeStyle = CYAN; ctx.lineWidth = 0.8; ctx.stroke()
  // Muzzle rings
  for (const yOff of [-1.2, -1.28, -1.35]) {
    ctx.beginPath()
    ctx.ellipse(0, s * yOff, s * 0.06, s * 0.02, 0, 0, TWO_PI)
    ctx.strokeStyle = CYAN; ctx.lineWidth = 0.6; ctx.stroke()
  }
  // Muzzle glow
  ctx.beginPath()
  ctx.arc(0, -s * 1.38, s * 0.045, 0, TWO_PI)
  ctx.fillStyle = "rgba(0,229,255,0.7)"; ctx.shadowBlur = 6; ctx.shadowColor = CYAN
  ctx.fill()
  ctx.shadowBlur = 0

  // === Secondary gun turrets ===
  const turretPos = [
    { x: -s*0.28, y: -s*0.2 },
    { x:  s*0.28, y: -s*0.2 },
    { x: -s*0.3,  y:  s*0.35 },
    { x:  s*0.3,  y:  s*0.35 },
  ]
  for (const tp of turretPos) {
    ctx.beginPath()
    ctx.arc(tp.x, tp.y, s * 0.07, 0, TWO_PI)
    ctx.fillStyle = "#2a3550"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.6; ctx.stroke()
    // Barrel
    ctx.beginPath()
    ctx.moveTo(tp.x, tp.y)
    ctx.lineTo(tp.x + (tp.x < 0 ? -s*0.14 : s*0.14), tp.y - s * 0.14)
    ctx.strokeStyle = CYAN; ctx.lineWidth = 0.8; ctx.stroke()
  }
}

// ── Type E: MiG-29 / F-16 style lightweight patrol fighter ───────────────────
function drawAircraftE(ctx: CanvasRenderingContext2D, s: number) {
  const HULL = "#1a0a2e"
  const EDGE = "#ff88ff"
  const GLOW = "#ff88ff"
  const DIM  = "rgba(255,136,255,0.2)"

  ctx.shadowBlur = 0

  // === Fuselage (narrow, pointed) ===
  ctx.beginPath()
  ctx.moveTo(0, -s * 1.2)           // sharp nose
  ctx.bezierCurveTo(-s*0.07, -s*0.7, -s*0.15, -s*0.2, -s*0.16, s*0.3)
  ctx.lineTo(-s * 0.14, s * 0.8)
  ctx.lineTo(s * 0.14, s * 0.8)
  ctx.lineTo(s * 0.16, s * 0.3)
  ctx.bezierCurveTo(s*0.15, -s*0.2, s*0.07, -s*0.7, 0, -s*1.2)
  ctx.closePath()
  ctx.fillStyle = HULL; ctx.fill()
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.85
  ctx.shadowBlur = 6; ctx.shadowColor = GLOW; ctx.stroke(); ctx.shadowBlur = 0

  // === Delta wings (moderately swept) ===
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * s * 0.15, -s * 0.1)
    ctx.lineTo(side * s * 1.1, s * 0.5)
    ctx.lineTo(side * s * 0.75, s * 0.6)
    ctx.lineTo(side * s * 0.15, s * 0.42)
    ctx.closePath()
    ctx.fillStyle = "#180828"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.75
    ctx.shadowBlur = 5; ctx.shadowColor = GLOW; ctx.stroke(); ctx.shadowBlur = 0
    // wing panel
    ctx.beginPath()
    ctx.moveTo(side * s * 0.38, s * 0.1)
    ctx.lineTo(side * s * 0.9, s * 0.45)
    ctx.strokeStyle = DIM; ctx.lineWidth = 0.5; ctx.stroke()
  }

  // === Single vertical stabilizer ===
  ctx.beginPath()
  ctx.moveTo(0, s * 0.1)
  ctx.lineTo(-s * 0.08, -s * 0.45)
  ctx.lineTo(s * 0.08, -s * 0.45)
  ctx.lineTo(s * 0.04, s * 0.3)
  ctx.closePath()
  ctx.fillStyle = "#1e0e38"; ctx.fill()
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.7; ctx.stroke()

  // === Intake (chin intake under nose) ===
  ctx.beginPath()
  ctx.ellipse(0, s * 0.12, s * 0.12, s * 0.07, 0, 0, TWO_PI)
  ctx.fillStyle = "#0a0212"; ctx.fill()
  ctx.strokeStyle = "rgba(255,136,255,0.45)"; ctx.lineWidth = 0.7; ctx.stroke()

  // === Canopy ===
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.6, s * 0.09, s * 0.2, 0, 0, TWO_PI)
  ctx.fillStyle = "rgba(160,100,255,0.45)"
  ctx.strokeStyle = "rgba(255,136,255,0.85)"; ctx.lineWidth = 0.7
  ctx.fill(); ctx.stroke()

  // === Single engine nozzle ===
  ctx.beginPath()
  ctx.ellipse(0, s * 0.82, s * 0.1, s * 0.055, 0, 0, TWO_PI)
  ctx.fillStyle = "#07020e"; ctx.fill()
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.8; ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-s*0.1, s*0.82)
  ctx.bezierCurveTo(-s*0.06, s*1.0, s*0.06, s*1.0, s*0.1, s*0.82)
  ctx.fillStyle = "rgba(255,100,0,0.9)"; ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-s*0.055, s*0.84)
  ctx.bezierCurveTo(-s*0.03, s*0.98, s*0.03, s*0.98, s*0.055, s*0.84)
  ctx.fillStyle = "rgba(255,230,120,0.85)"; ctx.fill()

  // === Wingtip missiles ===
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.rect(side * s * 0.98 - s*0.02, s * 0.38, s * 0.04, s * 0.16)
    ctx.fillStyle = "#3a1050"; ctx.fill()
    ctx.strokeStyle = "rgba(255,136,255,0.4)"; ctx.lineWidth = 0.5; ctx.stroke()
  }
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

// ─── Main Component ────────────────────���─���────────────────────────────────────
export default function RadarOverlay({
  priceData: _p,
  basePriceCoord,
}: {
  priceData?: { volume: number; deltaVolume: number }
  basePriceCoord?: { x: number; y: number } | null
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
  const basePriceCoordRef = useRef<{ x: number; y: number } | null>(null)

  // basePriceCoord를 ref에 동기화 (RAF 루프에서 직접 접근)
  useEffect(() => {
    basePriceCoordRef.current = basePriceCoord ?? null
  }, [basePriceCoord])

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
      // basePriceCoord가 있으면 실제 차트 좌표 사용, 없으면 랜덤 위치
      const bpc = basePriceCoordRef.current
      if (bpc) {
        return { dx: bpc.x, dy: bpc.y }
      }
      return {
        dx: r.cx + Math.cos(r.dotAngle) * r.dotR * r.radius,
        dy: r.cy + Math.sin(r.dotAngle) * r.dotR * r.radius,
      }
    }

    function spawnRadar(W: number, H: number, now: number) {
      const bpc = basePriceCoordRef.current
      // 중심: 화면 어디서든 OK (화면 밖까지도)
      const cx = rnd(W * -0.1, W * 1.1)
      const cy = rnd(H * -0.1, H * 1.1)
      // 크기: 화면 대각선의 0.2~1.5배로 아주 다양하게 (화면 밖으로 삐져나올 수 있음)
      const diag = Math.hypot(W, H)
      const radius = rnd(diag * 0.2, diag * 1.5)

      const dotAngle = bpc
        ? Math.atan2(bpc.y - cy, bpc.x - cx)
        : rnd(0, TWO_PI)
      const dotR = bpc
        ? Math.hypot(bpc.x - cx, bpc.y - cy) / radius
        : rnd(0.4, 0.88)

      // blips: 3~6개의 점을 랜덤 위치에 배치
      const blipCount = Math.floor(rnd(3, 7))
      const blips: RadarBlip[] = Array.from({ length: blipCount }, () => ({
        angle: rnd(0, TWO_PI),
        r: rnd(0.25, 0.9),
        hitAt: null,
        size: rnd(2.5, 6),
      }))

      radarsRef.current.push({
        id: idRef.current++,
        cx, cy,
        radius,
        angle: 0,
        duration: rnd(4000, 7000),
        spawnTime: now,
        dotAngle,
        dotR,
        dotColor: Math.random() > 0.45 ? "red" : "yellow",
        phase: "spinning",
        fadeStart: 0,
        waveR: 0,
        waveAlpha: 0.8,
        hitCount: 0,
        blips,
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

      // Jets slightly larger than buoy (D ~ 10-22). Patrol smallest, others a bit bigger.
      const size = role === "patrol" ? rnd(7, 10)
        : role === "laser" ? rnd(9, 13)
        : rnd(9, 13)  // missile jets

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

      // ── Spawn radar — 한 번에 하나씩, 완전히 사라진 후 0.8s 딜레이 뒤 새로 스폰 ──
      if (radarsRef.current.length === 0 && now - lastSpawnRef.current > 800) {
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
        ctx.shadowBlur = 0

        const NEON = "#00ff55"
        const NEON_DIM = "rgba(0,255,85,"

        // ── 동심원 4개 (스파이더 링) ───────────────────────────
        for (let i = 1; i <= 4; i++) {
          const ringR = (rr / 4) * i
          ctx.beginPath()
          ctx.arc(cx, cy, ringR, 0, TWO_PI)
          ctx.strokeStyle = `${NEON_DIM}${0.05 + i * 0.035})`
          ctx.lineWidth = i === 4 ? 1.0 : 0.6
          ctx.stroke()
        }

        // ── 스파이더 웹 선 (8방향 spoke) ─────────────────────
        const spokeCount = 8
        ctx.strokeStyle = `${NEON_DIM}0.08)`
        ctx.lineWidth = 0.5
        for (let i = 0; i < spokeCount; i++) {
          const a = (i / spokeCount) * TWO_PI
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
          ctx.stroke()
        }

        // ── Sweep 트레일 ──────────────────────────────────────
        if (r.phase === "spinning") {
          // sweep 통과 시 blip에 hitAt 기록
          for (const blip of r.blips) {
            if (blip.hitAt !== null) continue
            const blipAngle = blip.angle
            let delta = r.angle - blipAngle
            while (delta < 0) delta += TWO_PI
            delta = delta % TWO_PI
            // sweep 선이 blip 각도를 막 지나쳤을 때 (0~0.15 라디안 이내)
            if (delta < 0.15) {
              blip.hitAt = now
            }
          }

          // sweep 부채꼴 그라데이션
          const sweepArc = Math.PI * 0.5
          const steps = 40
          for (let s = 0; s < steps; s++) {
            const frac = s / steps
            const a0 = r.angle - sweepArc * (1 - frac)
            const a1 = r.angle - sweepArc * (1 - (s + 1) / steps)
            ctx.beginPath(); ctx.moveTo(cx, cy)
            ctx.arc(cx, cy, rr, a0, a1); ctx.closePath()
            ctx.fillStyle = `${NEON_DIM}${frac * 0.11})`
            ctx.fill()
          }
          // sweep 선 (선명한 앞날)
          ctx.beginPath(); ctx.moveTo(cx, cy)
          ctx.lineTo(cx + Math.cos(r.angle) * rr, cy + Math.sin(r.angle) * rr)
          ctx.strokeStyle = `${NEON_DIM}0.7)`
          ctx.lineWidth = 1.3
          ctx.shadowBlur = 8; ctx.shadowColor = NEON
          ctx.stroke()
          ctx.shadowBlur = 0
        }

        // ── Wave ring ─────────────────────────────────────────
        if (r.waveAlpha > 0) {
          r.waveR += dt * rr * 1.2
          r.waveAlpha = Math.max(0, r.waveAlpha - dt * 0.5)
          if (r.waveR < rr * 1.8) {
            ctx.beginPath(); ctx.arc(cx, cy, r.waveR, 0, TWO_PI)
            ctx.strokeStyle = `${NEON_DIM}${r.waveAlpha * 0.5})`
            ctx.lineWidth = 1.2; ctx.stroke()
          }
        }

        // ── 중심점 ────────────────────────────────────────────
        ctx.beginPath(); ctx.arc(cx, cy, 2, 0, TWO_PI)
        ctx.fillStyle = NEON
        ctx.shadowBlur = 8; ctx.shadowColor = NEON
        ctx.fill(); ctx.shadowBlur = 0

        // ── Blips (여러 점, sweep 통과 후 순차 페이드) ─────────
        const FADE_DURATION = 2000 // ms 동안 페이드아웃
        for (const blip of r.blips) {
          const bx = cx + Math.cos(blip.angle) * blip.r * rr
          const by = cy + Math.sin(blip.angle) * blip.r * rr

          let blipAlpha = 0
          if (blip.hitAt !== null) {
            // sweep이 지나간 후 fadeout
            const elapsed = now - blip.hitAt
            blipAlpha = Math.max(0, 1 - elapsed / FADE_DURATION)
          } else if (r.phase === "spinning") {
            // sweep 아직 안 지나감 — sweep 반대쪽은 희미하게 유지
            let delta = r.angle - blip.angle
            while (delta < 0) delta += TWO_PI
            delta = delta % TWO_PI
            blipAlpha = 0.15
          }

          if (blipAlpha <= 0) continue

          ctx.save()
          ctx.globalAlpha = opacity * blipAlpha
          // 외부 글로우
          ctx.beginPath(); ctx.arc(bx, by, blip.size * 2, 0, TWO_PI)
          ctx.fillStyle = `rgba(0,255,85,0.12)`; ctx.fill()
          // 핵심 점
          ctx.beginPath(); ctx.arc(bx, by, blip.size, 0, TWO_PI)
          ctx.fillStyle = NEON
          ctx.shadowBlur = 12; ctx.shadowColor = NEON
          ctx.fill()
          ctx.shadowBlur = 0
          ctx.restore()
        }

        // ── 기존 단일 target blip (항공기 타겟용 유지) ───────
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
      // Hard cap: total active (non-done) aircraft <= 3, balanced across roles.
      // Composition: 1 missile-type + 1 laser + 1 patrol (tiny scout)
      const totalActive = aircraftRef.current.filter(a => a.state !== "done").length
      const activeMissile = aircraftRef.current.filter(
        a => (a.role === "missile-a" || a.role === "missile-b" || a.role === "missile-c") && a.state !== "done"
      ).length
      const activePatrol = aircraftRef.current.filter(
        a => a.role === "patrol" && a.state !== "done"
      ).length
      const activeLaser = aircraftRef.current.filter(
        a => a.role === "laser" && a.state !== "done"
      ).length

      if (totalActive < 3) {
        for (const r of radarsRef.current) {
          if (r.phase !== "spinning") continue
          // Priority: one of each type, total ≤ 3
          if (activeMissile === 0) {
            const roles: AircraftRole[] = ["missile-a", "missile-b", "missile-c"]
            spawnAircraftForRadar(W, H, r, roles[Math.floor(Math.random() * 3)])
          } else if (activeLaser === 0) {
            spawnAircraftForRadar(W, H, r, "laser")
          } else if (activePatrol === 0) {
            spawnAircraftForRadar(W, H, r, "patrol")
          }
          break
        }
      }

      // ── Update & draw aircraft ───────────────────────────────────────
      aircraftRef.current = aircraftRef.current.filter((ac) => {
        const radar = radarsRef.current.find(r => r.id === ac.targetId)

        // ── Candle / basePriceLine collision: 전투기가 배팅가 라인을 교차하면 폭파 ──
        // basePriceCoord.y 기준으로 전투기 중심이 ±size*0.6 이내에 진입하면 폭파
        const bpc = basePriceCoordRef.current
        if (bpc && ac.state !== "done") {
          const distToLine = Math.abs(ac.y - bpc.y)
          const hitRadius = ac.size * 1.5
          if (distToLine < hitRadius) {
            // 폭파 스폰 (큰 bang)
            explosionsRef.current.push({
              id: idRef.current++, x: ac.x, y: ac.y,
              t: 0, duration: 700, spawnTime: now, kind: "bang",
            })
            // 추가 파편 폭발 2개
            for (let fi = 0; fi < 2; fi++) {
              explosionsRef.current.push({
                id: idRef.current++,
                x: ac.x + rnd(-ac.size, ac.size),
                y: ac.y + rnd(-ac.size * 0.5, ac.size * 0.5),
                t: 0, duration: 500, spawnTime: now + fi * 80, kind: "bang",
              })
            }
            return false
          }
        }

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

        // ── Laser: straight approach → hover → beam attack → straight exit
        if (ac.role === "laser") {
          const distToDot = Math.hypot(dx - ac.x, dy - ac.y)

          if (ac.state === "cruising") {
            // Fly straight toward target area; heading fixed at spawn
            ac.x += ac.vx * dt; ac.y += ac.vy * dt
            if (distToDot < radar.radius * 1.2) ac.state = "attacking"
          }

          if (ac.state === "attacking") {
            // Hold position — no movement, heading stays fixed
            // Fire laser every 1.6s
            if (now - ac.lastShot > 1600 && ac.shotsFired < 6) {
              const { nx, ny } = getNose(ac.x, ac.y, ac.heading, ac.size * 1.2)
              // 레이저는 포(노즈)가 향한 방향으로 일직선 — heading 방향 단위벡터 연장
              // heading은 위(-Y)가 0이고 시계방향이므로: dx = sin(h), dy = -cos(h)
              const beamLen = Math.max(W, H) * 2
              const bDx = Math.sin(ac.heading)
              const bDy = -Math.cos(ac.heading)
              const beamEndX = nx + bDx * beamLen
              const beamEndY = ny + bDy * beamLen
              missilesRef.current.push({
                id: idRef.current++,
                x: nx, y: ny,
                vx: 0, vy: 0,
                tx: radar.cx, ty: radar.cy,
                radarId: radar.id,
                kind: "laser-beam",
                clustered: false,
                lx: beamEndX, ly: beamEndY,
                lAlpha: 1.0,
              })
              ac.lastShot = now
              ac.shotsFired++
            }
            if (ac.shotsFired >= 6) {
              ac.state = "done"
              // Exit in the same direction it came from (reverse)
              const spd = 120
              ac.vx = -ac.vx / Math.max(0.01, Math.hypot(ac.vx, ac.vy)) * spd
              ac.vy = -ac.vy / Math.max(0.01, Math.hypot(ac.vx, ac.vy)) * spd
            }
          }

          if (ac.state === "done") {
            ac.x += ac.vx * dt; ac.y += ac.vy * dt
            // heading stays fixed — no update
          }

          drawAircraft(ctx, ac.x, ac.y, ac.heading, ac.size, ac.role)
          const offscreen = ac.x < -150 || ac.x > W + 150 || ac.y < -150 || ac.y > H + 150
          return !offscreen
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
          const spd = rnd(150, 380)
          // 미사일은 레이더 중심(cx, cy)으로 발사
          const jx = rnd(-8, 8); const jy = rnd(-8, 8)
          const tx = radar.cx + jx; const ty = radar.cy + jy
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
            // 히트 판정: 빔 선분(x,y -> lx,ly)과 레이더 중심(tx,ty) 사이 최단 거리
            const radar = radarsRef.current.find(r => r.id === m.radarId)
            if (radar && m.lx !== undefined && m.ly !== undefined) {
              const bDx = m.lx - m.x; const bDy = m.ly - m.y
              const bLen2 = bDx * bDx + bDy * bDy
              const t = bLen2 > 0
                ? Math.max(0, Math.min(1, ((radar.cx - m.x) * bDx + (radar.cy - m.y) * bDy) / bLen2))
                : 0
              const closestX = m.x + t * bDx
              const closestY = m.y + t * bDy
              const dist = Math.hypot(closestX - radar.cx, closestY - radar.cy)
              if (dist < radar.radius * 1.5) {
                radar.hitCount++
                explosionsRef.current.push({
                  id: idRef.current++, x: closestX, y: closestY,
                  t: 0, duration: 400, spawnTime: now, kind: "laser-hit",
                })
                if (radar.hitCount >= 11) {
                  radarsRef.current = radarsRef.current.filter(r => r.id !== radar.id)
                  aircraftRef.current.forEach(a => { if (a.targetId === radar.id) a.state = "done" })
                }
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
          // Enhanced explosion: outer ring + inner fireball + debris rays
          const r1 = ex.t * 32
          // Outer shockwave ring
          ctx.beginPath(); ctx.arc(ex.x, ex.y, r1, 0, TWO_PI)
          ctx.strokeStyle = `rgba(255,200,60,${alpha * 0.7})`
          ctx.lineWidth = 2.5
          ctx.shadowBlur = 14; ctx.shadowColor = "#ff8800"
          ctx.stroke(); ctx.shadowBlur = 0

          // Second inner ring
          if (ex.t < 0.7) {
            const r2 = ex.t * 20
            ctx.beginPath(); ctx.arc(ex.x, ex.y, r2, 0, TWO_PI)
            ctx.strokeStyle = `rgba(255,100,0,${alpha * 0.55})`
            ctx.lineWidth = 1.5; ctx.stroke()
          }

          // Fireball core gradient
          if (ex.t < 0.45) {
            const rf = (0.45 - ex.t) / 0.45
            const grd = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, r1 * 0.55)
            grd.addColorStop(0, `rgba(255,255,200,${rf * 0.95})`)
            grd.addColorStop(0.35, `rgba(255,180,40,${rf * 0.75})`)
            grd.addColorStop(0.7, `rgba(255,60,0,${rf * 0.5})`)
            grd.addColorStop(1, "rgba(255,20,0,0)")
            ctx.beginPath(); ctx.arc(ex.x, ex.y, r1 * 0.55, 0, TWO_PI)
            ctx.fillStyle = grd; ctx.fill()
          }

          // Debris sparks (8 rays)
          if (ex.t < 0.6) {
            const sparkLen = r1 * 0.9
            for (let i = 0; i < 8; i++) {
              const ang = (i / 8) * TWO_PI + ex.t * 2
              const sx1 = ex.x + Math.cos(ang) * r1 * 0.3
              const sy1 = ex.y + Math.sin(ang) * r1 * 0.3
              const sx2 = ex.x + Math.cos(ang) * (r1 * 0.3 + sparkLen * (0.6 - ex.t) / 0.6)
              const sy2 = ex.y + Math.sin(ang) * (r1 * 0.3 + sparkLen * (0.6 - ex.t) / 0.6)
              ctx.beginPath()
              ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2)
              ctx.strokeStyle = `rgba(255,200,80,${alpha * 0.6})`
              ctx.lineWidth = 1; ctx.stroke()
            }
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
export default RadarOverlay
