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
// 노즈는 로컬 -Y 방향(위쪽). s = 스케일 단위.

// A: F-22 Raptor 스타일 — 델타익 쌍발 스텔스 전투기 (missile-a)
function drawAircraftA(ctx: CanvasRenderingContext2D, s: number) {
  const EDGE = "#00ff88"; const GLOW = "#00ff88"
  const DIM  = "rgba(0,255,136,0.22)"
  ctx.shadowBlur = 0

  // 주날개 — 곡선 델타
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * s * 0.15, -s * 0.2)
    ctx.lineTo(side * s * 1.25, s * 0.55)
    ctx.lineTo(side * s * 0.85, s * 0.68)
    ctx.lineTo(side * s * 0.15, s * 0.48)
    ctx.closePath()
    ctx.fillStyle = "#0d1e10"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.75
    ctx.shadowBlur = 5; ctx.shadowColor = GLOW; ctx.stroke(); ctx.shadowBlur = 0
    // 날개 패널 라인
    ctx.beginPath()
    ctx.moveTo(side * s * 0.38, s * 0.05)
    ctx.lineTo(side * s * 1.0, s * 0.5)
    ctx.strokeStyle = DIM; ctx.lineWidth = 0.45; ctx.stroke()
  }

  // 동체 — 좁고 날카로운 베지어
  ctx.beginPath()
  ctx.moveTo(0, -s * 1.25)
  ctx.bezierCurveTo(-s*0.07, -s*0.85, -s*0.17, -s*0.35, -s*0.18, s*0.18)
  ctx.lineTo(-s*0.17, s*0.8)
  ctx.lineTo(s*0.17, s*0.8)
  ctx.lineTo(s*0.18, s*0.18)
  ctx.bezierCurveTo(s*0.17, -s*0.35, s*0.07, -s*0.85, 0, -s*1.25)
  ctx.closePath()
  ctx.fillStyle = "#0e2010"; ctx.fill()
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.85
  ctx.shadowBlur = 6; ctx.shadowColor = GLOW; ctx.stroke(); ctx.shadowBlur = 0

  // 쌍발 수직 미익 (캔티드)
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * s * 0.11, s * 0.18)
    ctx.lineTo(side * s * 0.23, -s * 0.28)
    ctx.lineTo(side * s * 0.33, -s * 0.08)
    ctx.lineTo(side * s * 0.21, s * 0.42)
    ctx.closePath()
    ctx.fillStyle = "#112018"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.65; ctx.stroke()
  }

  // DSI 흡입구
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.rect(side * s * 0.1, s * 0.02, side > 0 ? s*0.13 : -s*0.13, s*0.3)
    ctx.fillStyle = "#040c06"; ctx.fill()
    ctx.strokeStyle = "rgba(0,255,136,0.38)"; ctx.lineWidth = 0.55; ctx.stroke()
  }

  // 동체 척추선
  ctx.beginPath()
  ctx.moveTo(0, -s*1.22); ctx.lineTo(0, s*0.8)
  ctx.strokeStyle = DIM; ctx.lineWidth = 0.4; ctx.stroke()

  // 캐노피
  ctx.beginPath()
  ctx.ellipse(0, -s*0.62, s*0.095, s*0.25, 0, 0, TWO_PI)
  ctx.fillStyle = "rgba(0,200,255,0.42)"
  ctx.strokeStyle = "rgba(0,229,255,0.78)"; ctx.lineWidth = 0.65
  ctx.fill(); ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, -s*0.87); ctx.lineTo(0, -s*0.37)
  ctx.strokeStyle = "rgba(0,229,255,0.45)"; ctx.lineWidth = 0.45; ctx.stroke()

  // 쌍발 엔진 노즐
  for (const side of [-1, 1]) {
    const nx = side * s * 0.085
    ctx.beginPath()
    ctx.ellipse(nx, s*0.82, s*0.065, s*0.038, 0, 0, TWO_PI)
    ctx.fillStyle = "#000a04"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.65; ctx.stroke()
    // 애프터버너 오렌지
    ctx.beginPath()
    ctx.moveTo(nx - s*0.065, s*0.82)
    ctx.bezierCurveTo(nx - s*0.038, s*1.0, nx + s*0.038, s*1.0, nx + s*0.065, s*0.82)
    ctx.fillStyle = "rgba(255,100,0,0.9)"; ctx.fill()
    // 내부 코어 옐로우
    ctx.beginPath()
    ctx.moveTo(nx - s*0.035, s*0.84)
    ctx.bezierCurveTo(nx - s*0.018, s*0.98, nx + s*0.018, s*0.98, nx + s*0.035, s*0.84)
    ctx.fillStyle = "rgba(255,220,80,0.88)"; ctx.fill()
  }

  // 무장 하드포인트
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.rect(side * s * 0.55 - s*0.025, s*0.3, s*0.05, s*0.13)
    ctx.fillStyle = "#1a2e1a"; ctx.fill()
    ctx.strokeStyle = "rgba(0,255,136,0.28)"; ctx.lineWidth = 0.45; ctx.stroke()
  }
}

// B: Su-57 Felon 스타일 — LERX·카나드·쌍발 나셀 (missile-b)
function drawAircraftB(ctx: CanvasRenderingContext2D, s: number) {
  const EDGE = "#00d4ff"; const GLOW = "#00d4ff"
  const DIM  = "rgba(0,212,255,0.2)"
  ctx.shadowBlur = 0

  // LERX 스트레이크
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * s * 0.05, -s * 1.05)
    ctx.lineTo(side * s * 0.42, -s * 0.18)
    ctx.lineTo(side * s * 0.26, s * 0.28)
    ctx.closePath()
    ctx.fillStyle = "#0a1825"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.65; ctx.stroke()
  }

  // 동체
  ctx.beginPath()
  ctx.moveTo(0, -s * 1.25)
  ctx.bezierCurveTo(-s*0.11, -s*0.55, -s*0.26, -s*0.08, -s*0.27, s*0.38)
  ctx.lineTo(-s*0.21, s*0.88)
  ctx.lineTo(s*0.21, s*0.88)
  ctx.lineTo(s*0.27, s*0.38)
  ctx.bezierCurveTo(s*0.26, -s*0.08, s*0.11, -s*0.55, 0, -s*1.25)
  ctx.closePath()
  ctx.fillStyle = "#08101e"; ctx.fill()
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.88
  ctx.shadowBlur = 7; ctx.shadowColor = GLOW; ctx.stroke(); ctx.shadowBlur = 0

  // 주날개 — 광폭 델타
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * s * 0.27, -s * 0.02)
    ctx.lineTo(side * s * 1.38, s * 0.52)
    ctx.lineTo(side * s * 1.02, s * 0.7)
    ctx.lineTo(side * s * 0.21, s * 0.58)
    ctx.closePath()
    ctx.fillStyle = "#0a1520"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.78
    ctx.shadowBlur = 5; ctx.shadowColor = GLOW; ctx.stroke(); ctx.shadowBlur = 0
    // 에일러론 세그먼트
    ctx.beginPath()
    ctx.moveTo(side * s * 0.68, s * 0.46)
    ctx.lineTo(side * s * 1.0, s * 0.57)
    ctx.lineTo(side * s * 1.02, s * 0.7)
    ctx.lineTo(side * s * 0.7, s * 0.62)
    ctx.closePath()
    ctx.fillStyle = "#0d1c2a"; ctx.fill()
    ctx.strokeStyle = "rgba(0,212,255,0.38)"; ctx.lineWidth = 0.55; ctx.stroke()
    // 날개 패널선
    ctx.beginPath()
    ctx.moveTo(side * s * 0.52, s * 0.08)
    ctx.lineTo(side * s * 1.18, s * 0.52)
    ctx.strokeStyle = DIM; ctx.lineWidth = 0.45; ctx.stroke()
  }

  // 카나드
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * s * 0.21, -s * 0.52)
    ctx.lineTo(side * s * 0.62, -s * 0.18)
    ctx.lineTo(side * s * 0.52, -s * 0.04)
    ctx.lineTo(side * s * 0.27, -s * 0.28)
    ctx.closePath()
    ctx.fillStyle = "#0e1e30"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.68; ctx.stroke()
  }

  // 외향 수직 미익 (splayed)
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(side * s * 0.14, s * 0.22)
    ctx.rotate(side * 0.17)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(side * s * 0.21, -s * 0.52)
    ctx.lineTo(side * s * 0.27, -s * 0.32)
    ctx.lineTo(side * s * 0.04, s * 0.2)
    ctx.closePath()
    ctx.fillStyle = "#0e1e30"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.68; ctx.stroke()
    ctx.restore()
  }

  // 분리형 엔진 나셀
  for (const side of [-1, 1]) {
    const nx = side * s * 0.105
    ctx.beginPath()
    ctx.rect(nx - s*0.085, s*0.48, s*0.17, s*0.34)
    ctx.fillStyle = "#060e18"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.68; ctx.stroke()
    // 노즐
    ctx.beginPath()
    ctx.ellipse(nx, s*0.84, s*0.085, s*0.048, 0, 0, TWO_PI)
    ctx.fillStyle = "#02070f"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.75; ctx.stroke()
    // 애프터버너
    ctx.beginPath()
    ctx.moveTo(nx - s*0.085, s*0.84)
    ctx.bezierCurveTo(nx - s*0.048, s*1.05, nx + s*0.048, s*1.05, nx + s*0.085, s*0.84)
    ctx.fillStyle = "rgba(255,110,0,0.9)"; ctx.fill()
    ctx.beginPath()
    ctx.moveTo(nx - s*0.045, s*0.86)
    ctx.bezierCurveTo(nx - s*0.022, s*1.02, nx + s*0.022, s*1.02, nx + s*0.045, s*0.86)
    ctx.fillStyle = "rgba(255,230,100,0.85)"; ctx.fill()
  }

  // 흡입구
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.rect(side * s * 0.09, s * 0.04, side > 0 ? s*0.2 : -s*0.2, s*0.26)
    ctx.fillStyle = "#030b12"; ctx.fill()
    ctx.strokeStyle = "rgba(0,212,255,0.42)"; ctx.lineWidth = 0.65; ctx.stroke()
  }

  // 캐노피
  ctx.beginPath()
  ctx.ellipse(0, -s*0.65, s*0.12, s*0.27, 0, 0, TWO_PI)
  ctx.fillStyle = "rgba(0,200,255,0.38)"
  ctx.strokeStyle = "rgba(0,229,255,0.82)"; ctx.lineWidth = 0.68
  ctx.fill(); ctx.stroke()

  // 피토관
  ctx.beginPath()
  ctx.moveTo(0, -s*1.25); ctx.lineTo(0, -s*1.52)
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.75; ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, -s*1.53, s*0.018, 0, TWO_PI)
  ctx.fillStyle = EDGE; ctx.fill()
}

// C: B-2 Spirit 스텔스 플라잉윙 (missile-c)
function drawAircraftC(ctx: CanvasRenderingContext2D, s: number) {
  const EDGE = "#aaff00"; const GLOW = "#aaff00"
  const DIM  = "rgba(170,255,0,0.18)"
  ctx.shadowBlur = 0

  // 블렌디드 플라잉윙 본체
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.52)
  ctx.bezierCurveTo(-s*0.14, -s*0.48, -s*0.52, -s*0.22, -s*0.72, -s*0.04)
  ctx.lineTo(-s * 1.45, s * 0.36)
  ctx.bezierCurveTo(-s*1.45, s*0.48, -s*1.25, s*0.53, -s*1.05, s*0.5)
  ctx.lineTo(-s * 0.68, s * 0.43)
  ctx.bezierCurveTo(-s*0.48, s*0.58, -s*0.18, s*0.65, -s*0.07, s*0.65)
  ctx.lineTo(0, s * 0.6)
  ctx.lineTo(s * 0.07, s * 0.65)
  ctx.bezierCurveTo(s*0.18, s*0.65, s*0.48, s*0.58, s*0.68, s*0.43)
  ctx.lineTo(s * 1.05, s * 0.5)
  ctx.bezierCurveTo(s*1.25, s*0.53, s*1.45, s*0.48, s*1.45, s*0.36)
  ctx.lineTo(s * 0.72, -s * 0.04)
  ctx.bezierCurveTo(s*0.52, -s*0.22, s*0.14, -s*0.48, 0, -s*0.52)
  ctx.closePath()
  ctx.fillStyle = "#101008"; ctx.fill()
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.78
  ctx.shadowBlur = 5; ctx.shadowColor = GLOW; ctx.stroke(); ctx.shadowBlur = 0

  // 날개 패널선 4개
  const panels: [number, number, number, number][] = [
    [-s*0.32, s*0.08, -s*1.15, s*0.33],
    [ s*0.32, s*0.08,  s*1.15, s*0.33],
    [-s*0.52, -s*0.12, -s*0.18, s*0.58],
    [ s*0.52, -s*0.12,  s*0.18, s*0.58],
  ]
  ctx.strokeStyle = DIM; ctx.lineWidth = 0.45
  for (const [x1,y1,x2,y2] of panels) {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke()
  }

  // 크루 험프
  ctx.beginPath()
  ctx.ellipse(0, s*0.04, s*0.17, s*0.35, 0, 0, TWO_PI)
  ctx.fillStyle = "#181808"; ctx.fill()
  ctx.strokeStyle = "rgba(170,255,0,0.32)"; ctx.lineWidth = 0.55; ctx.stroke()

  // 조종석 창
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(side * s * 0.065, -s * 0.25, s * 0.052, s * 0.075, side * 0.14, 0, TWO_PI)
    ctx.fillStyle = "rgba(0,200,255,0.48)"; ctx.fill()
    ctx.strokeStyle = "rgba(0,229,255,0.78)"; ctx.lineWidth = 0.48; ctx.stroke()
  }

  // 4발 배기구 (매립형)
  for (const ex of [-s*0.36, -s*0.13, s*0.13, s*0.36]) {
    ctx.beginPath()
    ctx.ellipse(ex, s*0.52, s*0.065, s*0.028, 0, 0, TWO_PI)
    ctx.fillStyle = "#050502"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.58; ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(ex, s*0.55, s*0.045, s*0.022, 0, 0, TWO_PI)
    ctx.fillStyle = "rgba(255,100,0,0.68)"; ctx.fill()
  }

  // W형 후연 톱니
  ctx.beginPath()
  ctx.moveTo(-s*0.07, s*0.65)
  ctx.lineTo(-s*0.035, s*0.7); ctx.lineTo(0, s*0.6)
  ctx.lineTo(s*0.035, s*0.7); ctx.lineTo(s*0.07, s*0.65)
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.65; ctx.stroke()
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

// E: F-16/MiG-29 단발 경전투기 — patrol
function drawAircraftE(ctx: CanvasRenderingContext2D, s: number) {
  const EDGE = "#ff88ff"; const GLOW = "#ff88ff"
  const DIM  = "rgba(255,136,255,0.2)"
  ctx.shadowBlur = 0

  // 동체 — 날카로운 베지어
  ctx.beginPath()
  ctx.moveTo(0, -s * 1.15)
  ctx.bezierCurveTo(-s*0.06, -s*0.65, -s*0.14, -s*0.18, -s*0.15, s*0.28)
  ctx.lineTo(-s*0.13, s*0.78)
  ctx.lineTo(s*0.13, s*0.78)
  ctx.lineTo(s*0.15, s*0.28)
  ctx.bezierCurveTo(s*0.14, -s*0.18, s*0.06, -s*0.65, 0, -s*1.15)
  ctx.closePath()
  ctx.fillStyle = "#1a0a2e"; ctx.fill()
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.82
  ctx.shadowBlur = 6; ctx.shadowColor = GLOW; ctx.stroke(); ctx.shadowBlur = 0

  // 델타 주날개
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * s * 0.14, -s * 0.08)
    ctx.lineTo(side * s * 1.05, s * 0.48)
    ctx.lineTo(side * s * 0.72, s * 0.58)
    ctx.lineTo(side * s * 0.14, s * 0.4)
    ctx.closePath()
    ctx.fillStyle = "#180828"; ctx.fill()
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.72
    ctx.shadowBlur = 5; ctx.shadowColor = GLOW; ctx.stroke(); ctx.shadowBlur = 0
    ctx.beginPath()
    ctx.moveTo(side * s * 0.35, s * 0.08)
    ctx.lineTo(side * s * 0.85, s * 0.43)
    ctx.strokeStyle = DIM; ctx.lineWidth = 0.42; ctx.stroke()
  }

  // 단발 수직 미익
  ctx.beginPath()
  ctx.moveTo(0, s * 0.08)
  ctx.lineTo(-s * 0.075, -s * 0.42)
  ctx.lineTo(s * 0.075, -s * 0.42)
  ctx.lineTo(s * 0.038, s * 0.28)
  ctx.closePath()
  ctx.fillStyle = "#1e0e38"; ctx.fill()
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.65; ctx.stroke()

  // 턱 흡입구 (chin intake)
  ctx.beginPath()
  ctx.ellipse(0, s * 0.1, s * 0.11, s * 0.065, 0, 0, TWO_PI)
  ctx.fillStyle = "#0a0212"; ctx.fill()
  ctx.strokeStyle = "rgba(255,136,255,0.42)"; ctx.lineWidth = 0.65; ctx.stroke()

  // 캐노피
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.57, s * 0.085, s * 0.19, 0, 0, TWO_PI)
  ctx.fillStyle = "rgba(160,100,255,0.42)"
  ctx.strokeStyle = "rgba(255,136,255,0.82)"; ctx.lineWidth = 0.65
  ctx.fill(); ctx.stroke()

  // 단발 노즐
  ctx.beginPath()
  ctx.ellipse(0, s * 0.8, s * 0.095, s * 0.052, 0, 0, TWO_PI)
  ctx.fillStyle = "#07020e"; ctx.fill()
  ctx.strokeStyle = EDGE; ctx.lineWidth = 0.75; ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-s*0.095, s*0.8)
  ctx.bezierCurveTo(-s*0.055, s*0.98, s*0.055, s*0.98, s*0.095, s*0.8)
  ctx.fillStyle = "rgba(255,100,0,0.9)"; ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-s*0.052, s*0.82)
  ctx.bezierCurveTo(-s*0.028, s*0.96, s*0.028, s*0.96, s*0.052, s*0.82)
  ctx.fillStyle = "rgba(255,230,120,0.85)"; ctx.fill()

  // 윙팁 미사일
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.rect(side * s * 0.93 - s*0.018, s * 0.36, s * 0.036, s * 0.14)
    ctx.fillStyle = "#3a1050"; ctx.fill()
    ctx.strokeStyle = "rgba(255,136,255,0.38)"; ctx.lineWidth = 0.45; ctx.stroke()
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

// ─── Main Component ───────────────────────────────────────────────────────────
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

      // ── Update & draw explosions ──────────────────────��──────────────
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
