"use client"

import { useEffect, useRef, useState, useCallback } from "react"

/* ─── 타입 ────────────────────────────────────────────────────── */
interface RadarDot {
  id: number
  angle: number       // 현재 레이더 스윕 각도에서 탐지된 각도
  distance: number    // 레이더 중심에서 거리 (0~1)
  opacity: number
  size: number
}

interface RadarRing {
  id: number
  scale: number       // 현재 확대 배율 (1 → 4)
  opacity: number
  x: number           // 화면 내 위치 (%)
  y: number
  size: number        // 기본 크기 px
  color: string
}

interface Aircraft {
  id: number
  type: "mothership" | "carrier" | "jet" | "fighter"
  x: number           // 현재 x 위치 (px)
  y: number           // y (%)
  speed: number       // px/frame
  direction: 1 | -1  // 1=왼→오, -1=오→왼
  opacity: number
  scale: number
}

/* ─── 레이더 SVG ─────────────────────────────────────────────── */
function RadarSVG({
  sweepAngle, dots, size,
}: {
  sweepAngle: number
  dots: RadarDot[]
  size: number
}) {
  const cx = size / 2
  const cy = size / 2
  const r  = size / 2 - 2

  // 스윕 그라디언트: 현재 각도에서 뒤로 120도 페이드
  const sweepRad = (sweepAngle * Math.PI) / 180
  const ex = cx + r * Math.cos(sweepRad)
  const ey = cy + r * Math.sin(sweepRad)

  return (
    <svg width={size} height={size} style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={`rg${size}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#00ff41" stopOpacity="0.08" />
          <stop offset="70%"  stopColor="#00ff41" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#00ff41" stopOpacity="0" />
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* 배경 원 */}
      <circle cx={cx} cy={cy} r={r} fill={`url(#rg${size})`} stroke="#00ff41" strokeWidth="0.5" strokeOpacity="0.3" />

      {/* 격자 원 3개 */}
      {[0.33, 0.66, 1].map((t) => (
        <circle key={t} cx={cx} cy={cy} r={r * t}
          fill="none" stroke="#00ff41" strokeWidth="0.4" strokeOpacity="0.15" />
      ))}

      {/* 십자선 */}
      <line x1={cx} y1={2} x2={cx} y2={size - 2} stroke="#00ff41" strokeWidth="0.4" strokeOpacity="0.15" />
      <line x1={2} y1={cy} x2={size - 2} y2={cy} stroke="#00ff41" strokeWidth="0.4" strokeOpacity="0.15" />

      {/* 스윕 扇形 */}
      <path
        d={[
          `M ${cx} ${cy}`,
          `L ${cx + r * Math.cos((sweepAngle - 90) * Math.PI / 180)} ${cy + r * Math.sin((sweepAngle - 90) * Math.PI / 180)}`,
          `A ${r} ${r} 0 0 1 ${ex} ${ey}`,
          "Z",
        ].join(" ")}
        fill="#00ff41"
        fillOpacity="0.06"
      />
      {/* 스윕 라인 */}
      <line x1={cx} y1={cy} x2={ex} y2={ey}
        stroke="#00ff41" strokeWidth="1.5" strokeOpacity="0.8" filter="url(#glow)" />

      {/* 탐지 점들 */}
      {dots.map((dot) => {
        const rad = (dot.angle * Math.PI) / 180
        const dx = cx + r * dot.distance * Math.cos(rad)
        const dy = cy + r * dot.distance * Math.sin(rad)
        return (
          <circle key={dot.id} cx={dx} cy={dy} r={dot.size}
            fill="#00ff41" opacity={dot.opacity} filter="url(#glow)" />
        )
      })}
    </svg>
  )
}

/* ─── 항공기 SVG들 ───────────────────────────────────────────── */
function MothershipSVG({ flip }: { flip: boolean }) {
  return (
    <svg width="220" height="70" viewBox="0 0 220 70"
      style={{ transform: flip ? "scaleX(-1)" : "none" }}>
      <defs>
        <radialGradient id="mGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8844ff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#4400aa" stopOpacity="0" />
        </radialGradient>
        <filter id="mf"><feGaussianBlur stdDeviation="2" /></filter>
      </defs>
      {/* 글로우 */}
      <ellipse cx="110" cy="35" rx="105" ry="30" fill="url(#mGlow)" />
      {/* 본체 */}
      <ellipse cx="110" cy="38" rx="90" ry="18" fill="#1a0a3a" stroke="#6633cc" strokeWidth="1.5" />
      <ellipse cx="110" cy="32" rx="60" ry="14" fill="#220d4a" stroke="#8844ff" strokeWidth="1" />
      {/* 돔 */}
      <ellipse cx="110" cy="26" rx="30" ry="12" fill="#2a1060" stroke="#aa66ff" strokeWidth="1" />
      {/* 엔진 빛 */}
      {[-60, -30, 0, 30, 60].map((ox, i) => (
        <ellipse key={i} cx={110 + ox} cy="52" rx="6" ry="4"
          fill="#ff6600" opacity="0.8" filter="url(#mf)" />
      ))}
      {/* 창문 */}
      {[-40, -20, 0, 20, 40].map((ox, i) => (
        <circle key={i} cx={110 + ox} cy="30" r="3" fill="#88ccff" opacity="0.9" />
      ))}
    </svg>
  )
}

function CarrierSVG({ flip }: { flip: boolean }) {
  return (
    <svg width="140" height="50" viewBox="0 0 140 50"
      style={{ transform: flip ? "scaleX(-1)" : "none" }}>
      <defs>
        <filter id="cf"><feGaussianBlur stdDeviation="1.5" /></filter>
      </defs>
      {/* 본체 */}
      <polygon points="10,30 130,25 130,38 10,42" fill="#0d2240" stroke="#2255aa" strokeWidth="1" />
      <polygon points="30,18 120,15 130,25 10,30" fill="#0a1830" stroke="#3366cc" strokeWidth="1" />
      {/* 상부구조 */}
      <rect x="80" y="10" width="35" height="18" rx="2" fill="#081525" stroke="#2244aa" strokeWidth="0.8" />
      {/* 엔진 */}
      {[28, 38].map((y, i) => (
        <ellipse key={i} cx="12" cy={y} rx="5" ry="3" fill="#ff8800" opacity="0.85" filter="url(#cf)" />
      ))}
      {/* 창 */}
      {[85, 95, 105, 115].map((x, i) => (
        <rect key={i} x={x} y="14" width="6" height="4" rx="1" fill="#44aaff" opacity="0.8" />
      ))}
    </svg>
  )
}

function JetSVG({ flip }: { flip: boolean }) {
  return (
    <svg width="80" height="30" viewBox="0 0 80 30"
      style={{ transform: flip ? "scaleX(-1)" : "none" }}>
      <defs>
        <filter id="jf"><feGaussianBlur stdDeviation="1" /></filter>
      </defs>
      <polygon points="70,14 5,8 2,14 5,20 70,16" fill="#1a3a6a" stroke="#4488cc" strokeWidth="0.8" />
      <polygon points="70,14 55,5 50,8" fill="#122a50" stroke="#3366aa" strokeWidth="0.6" />
      <polygon points="70,16 55,25 50,22" fill="#122a50" stroke="#3366aa" strokeWidth="0.6" />
      <polygon points="20,14 5,6 3,10" fill="#0d2040" />
      <polygon points="20,14 5,22 3,18" fill="#0d2040" />
      <ellipse cx="8" cy="14" rx="5" ry="3" fill="#ff9900" opacity="0.9" filter="url(#jf)" />
      <circle cx="65" cy="14" r="2.5" fill="#88ccff" opacity="0.9" />
    </svg>
  )
}

function FighterSVG({ flip }: { flip: boolean }) {
  return (
    <svg width="52" height="22" viewBox="0 0 52 22"
      style={{ transform: flip ? "scaleX(-1)" : "none" }}>
      <defs>
        <filter id="ff"><feGaussianBlur stdDeviation="0.8" /></filter>
      </defs>
      <polygon points="48,10 3,5 1,10 3,15 48,12" fill="#0f2a50" stroke="#336699" strokeWidth="0.7" />
      <polygon points="48,10 38,3 33,5" fill="#0a1e3a" stroke="#2255aa" strokeWidth="0.5" />
      <polygon points="48,12 38,19 33,17" fill="#0a1e3a" stroke="#2255aa" strokeWidth="0.5" />
      <polygon points="18,11 5,4 3,8" fill="#081828" />
      <polygon points="18,11 5,18 3,14" fill="#081828" />
      <ellipse cx="5" cy="11" rx="4" ry="2.5" fill="#ffaa00" opacity="0.85" filter="url(#ff)" />
    </svg>
  )
}

/* ─── 메인 오버레이 ───────────────────────────────────────────── */
export function SpaceOverlay() {
  const [sweepAngle, setSweepAngle]   = useState(0)
  const [radarDots, setRadarDots]     = useState<RadarDot[]>([])
  const [radarRings, setRadarRings]   = useState<RadarRing[]>([])
  const [aircrafts, setAircrafts]     = useState<Aircraft[]>([])
  const [volumeDelta, setVolumeDelta] = useState(0)   // 1초당 거래대금 변화
  const [volumeLabel, setVolumeLabel] = useState("")

  const idRef          = useRef(0)
  const prevVolumeRef  = useRef<number | null>(null)
  const prevTimeRef    = useRef<number>(Date.now())
  const containerRef   = useRef<HTMLDivElement>(null)
  const frameRef       = useRef<number>()
  const lastDotSweep   = useRef<number>(0)

  const nextId = () => ++idRef.current

  /* ─── 거래대금 폴링 ──────────────────────────────────── */
  useEffect(() => {
    const interval = setInterval(() => {
      const data = (window as any).__tickerData
      if (!data) return
      const now = Date.now()
      const qv: number = data.quoteAssetVolume ?? 0

      if (prevVolumeRef.current !== null) {
        const elapsed = (now - prevTimeRef.current) / 1000
        const delta   = (qv - prevVolumeRef.current) / elapsed  // /초
        setVolumeDelta(delta)

        // 레이블
        const abs = Math.abs(delta)
        if      (abs >= 1_000_000_000) setVolumeLabel(`▲ ${(abs / 1_000_000_000).toFixed(1)}B/s`)
        else if (abs >= 100_000_000)   setVolumeLabel(`▲ ${(abs / 100_000_000).toFixed(0)}억/s`)
        else                           setVolumeLabel("")

        // 항공기 스폰
        spawnAircraft(delta)
      }
      prevVolumeRef.current = qv
      prevTimeRef.current   = now
    }, 1200)
    return () => clearInterval(interval)
  }, [])

  /* ─── 항공기 스폰 ────────────────────────────────────── */
  const spawnAircraft = useCallback((delta: number) => {
    const abs = Math.abs(delta)
    const dir: 1 | -1 = Math.random() > 0.5 ? 1 : -1

    // 매번 전투기는 기본
    const base: Omit<Aircraft, "id" | "type" | "scale" | "speed"> = {
      x:         dir === 1 ? -200 : (containerRef.current?.offsetWidth ?? 800) + 200,
      y:         15 + Math.random() * 70,
      direction: dir,
      opacity:   1,
    }

    const newAircrafts: Aircraft[] = []

    if (abs >= 1_000_000_000) {
      // 모선
      newAircrafts.push({ ...base, id: nextId(), type: "mothership", scale: 1.1, speed: 0.6 })
    } else if (abs >= 300_000_000) {
      // 항공모함
      newAircrafts.push({ ...base, id: nextId(), type: "carrier", scale: 0.9, speed: 0.9 })
    } else if (abs >= 80_000_000) {
      // 제트기
      newAircrafts.push({ ...base, id: nextId(), type: "jet", scale: 0.85, speed: 1.5 })
    }

    // 항상 전투기 1~2대
    const count = abs >= 50_000_000 ? 2 : 1
    for (let i = 0; i < count; i++) {
      newAircrafts.push({
        ...base,
        id:    nextId(),
        type:  "fighter",
        scale: 0.75 + Math.random() * 0.25,
        speed: 1.8 + Math.random() * 1.2,
        y:     10 + Math.random() * 80,
        x:     dir === 1
          ? -80 - i * 60
          : (containerRef.current?.offsetWidth ?? 800) + 80 + i * 60,
      })
    }

    setAircrafts(prev => [...prev, ...newAircrafts].slice(-12))
  }, [])

  /* ─── 새 레이더 링 스폰 ──────────────────────────────── */
  const spawnRing = useCallback(() => {
    const colors = ["#00ff41", "#00cc33", "#33ff66", "#aaff44", "#00ffcc"]
    setRadarRings(prev => [
      ...prev,
      {
        id:      nextId(),
        scale:   1,
        opacity: 0.7,
        x:       10 + Math.random() * 80,
        y:       10 + Math.random() * 80,
        size:    60 + Math.random() * 80,
        color:   colors[Math.floor(Math.random() * colors.length)],
      },
    ].slice(-6))
  }, [])

  /* ─── RAF 루프 ───────────────────────────────────────── */
  useEffect(() => {
    let lastTime = performance.now()
    let ringTimer = 0

    const tick = (now: number) => {
      const dt = now - lastTime
      lastTime = now

      // 레이더 스윕 (4초 회전)
      setSweepAngle(prev => {
        const next = (prev + dt * 0.09) % 360

        // 스윕이 지나갈 때마다 새 점 추가
        if (Math.floor(next / 30) !== Math.floor(prev / 30)) {
          setRadarDots(dots => {
            const newDots = dots
              .map(d => ({ ...d, opacity: d.opacity - 0.015 * (dt / 16) }))
              .filter(d => d.opacity > 0)

            // 점 1~2개 추가
            const count = Math.random() > 0.4 ? 1 : 2
            for (let i = 0; i < count; i++) {
              newDots.push({
                id:       nextId(),
                angle:    next + (Math.random() - 0.5) * 20,
                distance: 0.2 + Math.random() * 0.75,
                opacity:  0.9,
                size:     1.5 + Math.random() * 2,
              })
            }
            return newDots.slice(-20)
          })
        }
        return next
      })

      // 레이더 링 페이드/확대
      setRadarRings(prev =>
        prev
          .map(r => ({
            ...r,
            scale:   r.scale + dt * 0.0015,
            opacity: r.opacity - dt * 0.00025,
          }))
          .filter(r => r.opacity > 0 && r.scale < 5)
      )

      // 새 링 스폰 (2.5초마다)
      ringTimer += dt
      if (ringTimer > 2500) {
        ringTimer = 0
        spawnRing()
      }

      // 항공기 이동
      setAircrafts(prev => {
        const w = containerRef.current?.offsetWidth ?? 800
        return prev
          .map(a => ({
            ...a,
            x:       a.x + a.speed * a.direction * (dt / 16),
            opacity: a.x < -300 || a.x > w + 300 ? 0 : a.opacity,
          }))
          .filter(a => a.opacity > 0 && a.x > -400 && a.x < w + 400)
      })

      frameRef.current = requestAnimationFrame(tick)
    }

    spawnRing()
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [spawnRing])

  /* ─── 렌더 ───────────────────────────────────────────── */
  const w = containerRef.current?.offsetWidth ?? 600
  const h = containerRef.current?.offsetHeight ?? 280

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden">

      {/* 확대되며 페이드아웃하는 레이더 링들 */}
      {radarRings.map(ring => (
        <div
          key={ring.id}
          className="absolute"
          style={{
            left:      `${ring.x}%`,
            top:       `${ring.y}%`,
            width:     ring.size,
            height:    ring.size,
            transform: `translate(-50%, -50%) scale(${ring.scale})`,
            opacity:   ring.opacity,
            border:    `1.5px solid ${ring.color}`,
            borderRadius: "50%",
            boxShadow: `0 0 8px 1px ${ring.color}40`,
          }}
        />
      ))}

      {/* 레이더 3개 (크기/위치 다양) */}
      {[
        { size: 100, x: "6%",  y: "12%",  speed: 1 },
        { size: 70,  x: "88%", y: "22%",  speed: 0.7 },
        { size: 55,  x: "50%", y: "80%",  speed: 1.4 },
      ].map((cfg, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left:      cfg.x,
            top:       cfg.y,
            transform: "translate(-50%, -50%)",
            opacity:   0.55,
          }}
        >
          <RadarSVG
            sweepAngle={(sweepAngle * cfg.speed) % 360}
            dots={radarDots}
            size={cfg.size}
          />
        </div>
      ))}

      {/* 항공기들 */}
      {aircrafts.map(a => (
        <div
          key={a.id}
          className="absolute"
          style={{
            left:      a.x,
            top:       `${a.y}%`,
            opacity:   a.opacity,
            transform: `scale(${a.scale})`,
            transformOrigin: "center center",
            filter:    "drop-shadow(0 0 6px rgba(100,200,255,0.5))",
          }}
        >
          {a.type === "mothership" && <MothershipSVG flip={a.direction === -1} />}
          {a.type === "carrier"    && <CarrierSVG    flip={a.direction === -1} />}
          {a.type === "jet"        && <JetSVG        flip={a.direction === -1} />}
          {a.type === "fighter"    && <FighterSVG    flip={a.direction === -1} />}
        </div>
      ))}

      {/* 거래대금 HUD */}
      {volumeLabel && (
        <div
          className="absolute top-3 right-3 text-[10px] font-mono tracking-widest px-2 py-1 rounded"
          style={{
            color:      "#00ff41",
            background: "rgba(0,20,0,0.7)",
            border:     "1px solid #00ff4130",
          }}
        >
          {volumeLabel}
        </div>
      )}
    </div>
  )
}
