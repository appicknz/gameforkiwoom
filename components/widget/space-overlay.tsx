"use client"

import { useEffect, useRef, useState, useCallback } from "react"

/* ─── 타입 ────────────────────────────────────────────────────── */
interface RadarDot {
  id: number
  angle: number
  distance: number
  opacity: number
  size: number
}

interface RadarState {
  x: number       // % 위치
  y: number
  size: number    // px 크기
  phase: number   // 0=등장 중, 1=활성, 2=퇴장 중
  opacity: number
  sweepAngle: number
  speed: number   // 회전 속도 배율
  lifetime: number  // ms 남은 시간
}

interface RadarRing {
  id: number
  scale: number
  opacity: number
  x: number
  y: number
  size: number
}

interface Aircraft {
  id: number
  type: "mothership" | "carrier" | "jet" | "fighter" | "fighter2"
  x: number
  y: number
  speed: number
  direction: 1 | -1
  opacity: number
  scale: number
}

/* ─── 레이더 SVG ─────────────────────────────────────────────── */
function RadarSVG({ sweepAngle, dots, size }: {
  sweepAngle: number; dots: RadarDot[]; size: number
}) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 2
  const rad = (sweepAngle * Math.PI) / 180
  const ex = cx + r * Math.cos(rad)
  const ey = cy + r * Math.sin(rad)

  return (
    <svg width={size} height={size} style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={`rg-${size}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#00ff41" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#00ff41" stopOpacity="0" />
        </radialGradient>
        <filter id="glow-r">
          <feGaussianBlur stdDeviation="1.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill={`url(#rg-${size})`} stroke="#00ff41" strokeWidth="0.6" strokeOpacity="0.4"/>
      {[0.33, 0.66, 1].map(t => (
        <circle key={t} cx={cx} cy={cy} r={r * t} fill="none" stroke="#00ff41" strokeWidth="0.3" strokeOpacity="0.2"/>
      ))}
      <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#00ff41" strokeWidth="0.3" strokeOpacity="0.2"/>
      <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="#00ff41" strokeWidth="0.3" strokeOpacity="0.2"/>

      {/* 스윕 扇形 */}
      <path
        d={`M${cx},${cy} L${cx + r * Math.cos((sweepAngle - 80) * Math.PI / 180)},${cy + r * Math.sin((sweepAngle - 80) * Math.PI / 180)} A${r},${r} 0 0,1 ${ex},${ey} Z`}
        fill="#00ff41" fillOpacity="0.08"
      />
      <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="#00ff41" strokeWidth="1.5" strokeOpacity="0.9" filter="url(#glow-r)"/>

      {dots.map(dot => {
        const dr = (dot.angle * Math.PI) / 180
        const dx = cx + r * dot.distance * Math.cos(dr)
        const dy = cy + r * dot.distance * Math.sin(dr)
        return <circle key={dot.id} cx={dx} cy={dy} r={dot.size} fill="#00ff41" opacity={dot.opacity} filter="url(#glow-r)"/>
      })}
    </svg>
  )
}

/* ─── 항공기 SVG들 (실제 실루엣) ────────────────────────────── */

// 모선: 넓고 평평한 비행접시 형태
function MothershipSVG({ flip }: { flip: boolean }) {
  return (
    <svg width="240" height="80" viewBox="0 0 240 80"
      style={{ transform: flip ? "scaleX(-1)" : undefined }}>
      <defs>
        <radialGradient id="mg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#9933ff" stopOpacity="0.5"/>
          <stop offset="100%" stopColor="#330099" stopOpacity="0"/>
        </radialGradient>
        <filter id="mgl"><feGaussianBlur stdDeviation="3"/></filter>
      </defs>
      <ellipse cx="120" cy="40" rx="115" ry="28" fill="url(#mg)"/>
      {/* 하부 접시 */}
      <ellipse cx="120" cy="46" rx="95" ry="16" fill="#1a0840" stroke="#6622cc" strokeWidth="1.5"/>
      {/* 상부 돔 */}
      <ellipse cx="120" cy="36" rx="55" ry="16" fill="#220d55" stroke="#8844ee" strokeWidth="1"/>
      {/* 조종 돔 */}
      <ellipse cx="120" cy="26" rx="25" ry="12" fill="#2a1070" stroke="#aa66ff" strokeWidth="1"/>
      {/* 하부 엔진 점들 */}
      {[-60,-38,-18,0,18,38,60].map((ox, i) => (
        <ellipse key={i} cx={120+ox} cy="58" rx="5" ry="3.5"
          fill={i%2===0?"#ff5500":"#ff9900"} opacity="0.85" filter="url(#mgl)"/>
      ))}
      {/* 창문들 */}
      {[-36,-18,0,18,36].map((ox, i) => (
        <circle key={i} cx={120+ox} cy="34" r="3.5" fill="#88eeff" opacity="0.9"/>
      ))}
      {/* 하부 장식 링 */}
      <ellipse cx="120" cy="50" rx="75" ry="8" fill="none" stroke="#6622cc" strokeWidth="0.6" strokeOpacity="0.5"/>
    </svg>
  )
}

// 항공모함: 수평으로 긴 군함 실루엣
function CarrierSVG({ flip }: { flip: boolean }) {
  return (
    <svg width="160" height="55" viewBox="0 0 160 55"
      style={{ transform: flip ? "scaleX(-1)" : undefined }}>
      <defs><filter id="cgl"><feGaussianBlur stdDeviation="1.5"/></filter></defs>
      {/* 선체 */}
      <polygon points="8,38 150,30 155,40 8,46" fill="#0d2040" stroke="#224488" strokeWidth="1"/>
      {/* 갑판 */}
      <polygon points="20,22 148,18 155,30 8,38" fill="#0a1a35" stroke="#2255aa" strokeWidth="0.8"/>
      {/* 함교 */}
      <rect x="105" y="10" width="38" height="20" rx="2" fill="#081525" stroke="#2244aa" strokeWidth="0.8"/>
      <rect x="113" y="5"  width="22" height="8"  rx="1" fill="#060f1e" stroke="#1a3370" strokeWidth="0.6"/>
      {/* 레이더 안테나 */}
      <line x1="124" y1="5" x2="124" y2="1" stroke="#3366aa" strokeWidth="1"/>
      <line x1="120" y1="3" x2="128" y2="3" stroke="#3366aa" strokeWidth="0.8"/>
      {/* 엔진 불꽃 */}
      {[34, 42].map((y, i) => (
        <ellipse key={i} cx="9" cy={y} rx="6" ry="3.5" fill="#ff8800" opacity="0.85" filter="url(#cgl)"/>
      ))}
      {/* 창 */}
      {[108,118,128,138].map((x, i) => (
        <rect key={i} x={x} y="14" width="7" height="4" rx="1" fill="#44aaff" opacity="0.8"/>
      ))}
    </svg>
  )
}

// 제트기: 날카로운 삼각 델타익 전투기
function JetSVG({ flip }: { flip: boolean }) {
  return (
    <svg width="90" height="36" viewBox="0 0 90 36"
      style={{ transform: flip ? "scaleX(-1)" : undefined }}>
      <defs><filter id="jgl"><feGaussianBlur stdDeviation="1.2"/></filter></defs>
      {/* 동체 */}
      <polygon points="86,17 4,14 2,17 4,20 86,19" fill="#0f2a55" stroke="#336699" strokeWidth="0.8"/>
      {/* 노즈콘 */}
      <polygon points="86,17 78,12 75,15 75,19 78,22" fill="#0a1e40"/>
      <polygon points="86,18 89,17 86,17" fill="#1a3a6a"/>
      {/* 델타익 (위) */}
      <polygon points="70,17 20,5 15,10 55,17" fill="#0d2245" stroke="#2a5599" strokeWidth="0.6"/>
      {/* 델타익 (아래) */}
      <polygon points="70,19 20,31 15,26 55,19" fill="#0d2245" stroke="#2a5599" strokeWidth="0.6"/>
      {/* 수직 꼬리날개 */}
      <polygon points="18,17 8,9 5,13" fill="#0a1e3a" stroke="#1e4080" strokeWidth="0.5"/>
      <polygon points="18,19 8,27 5,23" fill="#0a1e3a" stroke="#1e4080" strokeWidth="0.5"/>
      {/* 엔진 노즐 */}
      <ellipse cx="5" cy="17" rx="5" ry="3.5" fill="#ffaa00" opacity="0.9" filter="url(#jgl)"/>
      <ellipse cx="5" cy="17" rx="8" ry="5" fill="#ff6600" opacity="0.4" filter="url(#jgl)"/>
      {/* 콕핏 */}
      <ellipse cx="76" cy="16" rx="6" ry="4" fill="#88ddff" opacity="0.85"/>
    </svg>
  )
}

// 전투기1: F-22 스타일 스텔스기
function FighterSVG({ flip }: { flip: boolean }) {
  return (
    <svg width="60" height="26" viewBox="0 0 60 26"
      style={{ transform: flip ? "scaleX(-1)" : undefined }}>
      <defs><filter id="fgl"><feGaussianBlur stdDeviation="0.9"/></filter></defs>
      {/* 동체 */}
      <polygon points="57,12 4,10 2,13 4,16 57,14" fill="#0f2248" stroke="#2a5088" strokeWidth="0.7"/>
      {/* 노즈 */}
      <polygon points="57,13 60,12 57,12" fill="#1a3870"/>
      <polygon points="57,13 60,14 57,14" fill="#1a3870"/>
      {/* 후퇴익 (위) — 마름모꼴 스텔스 */}
      <polygon points="50,12 18,4 10,8 40,12" fill="#0c1e40" stroke="#224480" strokeWidth="0.5"/>
      {/* 후퇴익 (아래) */}
      <polygon points="50,14 18,22 10,18 40,14" fill="#0c1e40" stroke="#224480" strokeWidth="0.5"/>
      {/* 꼬리 수직미익 */}
      <polygon points="14,13 6,7 4,10" fill="#081830"/>
      <polygon points="14,13 6,19 4,16" fill="#081830"/>
      {/* 엔진 노즐 */}
      <ellipse cx="4" cy="13" rx="4" ry="2.5" fill="#ffbb00" opacity="0.9" filter="url(#fgl)"/>
      <ellipse cx="4" cy="13" rx="7" ry="4"   fill="#ff7700" opacity="0.4" filter="url(#fgl)"/>
      {/* 캐노피 */}
      <ellipse cx="52" cy="12" rx="5" ry="3.5" fill="#66ccff" opacity="0.8"/>
    </svg>
  )
}

// 전투기2: MiG 스타일 삼각익
function Fighter2SVG({ flip }: { flip: boolean }) {
  return (
    <svg width="54" height="22" viewBox="0 0 54 22"
      style={{ transform: flip ? "scaleX(-1)" : undefined }}>
      <defs><filter id="f2gl"><feGaussianBlur stdDeviation="0.8"/></filter></defs>
      {/* 동체 */}
      <polygon points="51,10 3,8 1,11 3,14 51,12" fill="#12274a" stroke="#2b5280" strokeWidth="0.6"/>
      {/* 노즈 */}
      <polygon points="51,11 54,10 54,12" fill="#1e3d6e"/>
      {/* 삼각익 */}
      <polygon points="44,10 12,2 6,6 36,10"  fill="#0c1e40" stroke="#1e4475" strokeWidth="0.5"/>
      <polygon points="44,12 12,20 6,16 36,12" fill="#0c1e40" stroke="#1e4475" strokeWidth="0.5"/>
      {/* 미익 */}
      <polygon points="10,11 3,5 1,9"  fill="#071525"/>
      <polygon points="10,11 3,17 1,13" fill="#071525"/>
      {/* 엔진 */}
      <ellipse cx="3" cy="11" rx="3.5" ry="2.2" fill="#ff9900" opacity="0.9" filter="url(#f2gl)"/>
      <ellipse cx="3" cy="11" rx="6" ry="3.5"   fill="#ff5500" opacity="0.35" filter="url(#f2gl)"/>
      {/* 캐노피 */}
      <ellipse cx="46" cy="11" rx="4" ry="3" fill="#55bbee" opacity="0.8"/>
    </svg>
  )
}

/* ─── 메인 오버레이 ───────────────────────────────────────────── */
export function SpaceOverlay() {
  const [radar, setRadar]           = useState<RadarState>({
    x: 15, y: 20, size: 110, phase: 1, opacity: 0.6,
    sweepAngle: 0, speed: 1, lifetime: 5000,
  })
  const [radarDots, setRadarDots]   = useState<RadarDot[]>([])
  const [radarRings, setRadarRings] = useState<RadarRing[]>([])
  const [aircrafts, setAircrafts]   = useState<Aircraft[]>([])
  const [volumeLabel, setVolumeLabel] = useState("")

  const idRef          = useRef(0)
  const prevVolumeRef  = useRef<number | null>(null)
  const prevTimeRef    = useRef<number>(Date.now())
  const containerRef   = useRef<HTMLDivElement>(null)
  const frameRef       = useRef<number>()
  const spawnRef       = useRef(spawnAircraft)

  const nextId = () => ++idRef.current

  /* ─── 레이더 다음 상태 생성 ─────────────────────────── */
  function nextRadar(): RadarState {
    const positions = [
      { x: 10, y: 15 }, { x: 85, y: 12 }, { x: 50, y: 70 },
      { x: 20, y: 72 }, { x: 80, y: 65 }, { x: 45, y: 25 },
    ]
    const pos = positions[Math.floor(Math.random() * positions.length)]
    return {
      x:          pos.x,
      y:          pos.y,
      size:       60 + Math.floor(Math.random() * 5) * 20, // 60~140px
      phase:      0,
      opacity:    0,
      sweepAngle: Math.random() * 360,
      speed:      0.7 + Math.random() * 0.8,
      lifetime:   4000 + Math.random() * 4000,
    }
  }

  /* ─── 항공기 스폰 ────────────────────────────────────── */
  function spawnAircraft(delta: number) {
    const abs = Math.abs(delta)
    const dir: 1 | -1 = Math.random() > 0.5 ? 1 : -1
    const w = containerRef.current?.offsetWidth ?? 800

    const base = {
      x:         dir === 1 ? -250 : w + 250,
      direction: dir,
      opacity:   1,
    }

    const newAircrafts: Aircraft[] = []

    // 임계값: quoteAssetVolume은 USDT 기준, 1초당
    // 10억원 ≈ $700,000 USDT/s → 500_000
    if (abs >= 2_000_000) {
      // 모선 ($2M/s 이상 = 약 30억/s)
      newAircrafts.push({ ...base, id: nextId(), type: "mothership", scale: 1.0, speed: 0.5, y: 15 + Math.random() * 60 })
    } else if (abs >= 500_000) {
      // 항공모함 ($500k/s 이상 = 약 7억/s)
      newAircrafts.push({ ...base, id: nextId(), type: "carrier", scale: 0.9, speed: 0.85, y: 20 + Math.random() * 55 })
    } else if (abs >= 150_000) {
      // 제트기 ($150k/s 이상 = 약 2억/s)
      newAircrafts.push({ ...base, id: nextId(), type: "jet", scale: 0.85, speed: 1.4, y: 15 + Math.random() * 65 })
    }

    // 기본: 전투기 1~2대 (항상 등장)
    const fCount = abs >= 80_000 ? 2 : 1
    for (let i = 0; i < fCount; i++) {
      const type = Math.random() > 0.5 ? "fighter" : "fighter2"
      newAircrafts.push({
        ...base,
        id:    nextId(),
        type,
        scale: 0.8 + Math.random() * 0.3,
        speed: 2.0 + Math.random() * 1.5,
        y:     10 + Math.random() * 78,
        x:     dir === 1
          ? -80 - i * 70
          : w + 80 + i * 70,
      })
    }

    setAircrafts(prev => [...prev, ...newAircrafts].slice(-14))
  }

  spawnRef.current = spawnAircraft

  /* ─── 거래대금 폴링 (1.2초) ─────────────────────────── */
  useEffect(() => {
    const iv = setInterval(() => {
      const data = (window as any).__tickerData
      if (!data) return
      const now = Date.now()
      const qv: number = data.quoteAssetVolume ?? 0

      if (prevVolumeRef.current !== null) {
        const elapsed = (now - prevTimeRef.current) / 1000
        const delta   = (qv - prevVolumeRef.current) / Math.max(elapsed, 0.5)

        const abs = Math.abs(delta)
        if      (abs >= 2_000_000) setVolumeLabel(`ALERT: $${(abs/1_000_000).toFixed(1)}M/s`)
        else if (abs >= 500_000)   setVolumeLabel(`HIGH: $${(abs/1_000_000).toFixed(2)}M/s`)
        else if (abs >= 150_000)   setVolumeLabel(`$${(abs/1_000).toFixed(0)}K/s`)
        else                       setVolumeLabel("")

        spawnRef.current(delta)
      }
      prevVolumeRef.current = qv
      prevTimeRef.current   = now
    }, 1200)
    return () => clearInterval(iv)
  }, [])

  /* ─── RAF 메인 루프 ──────────────────────────────────── */
  useEffect(() => {
    let lastTime  = performance.now()
    let ringTimer = 0

    const tick = (now: number) => {
      const dt = now - lastTime
      lastTime = now

      // 레이더 스윕 + 수명 관리
      setRadar(prev => {
        let { phase, opacity, lifetime, sweepAngle, size, speed } = prev
        sweepAngle = (sweepAngle + dt * 0.07 * speed) % 360

        if (phase === 0) {
          // 페이드인
          opacity = Math.min(opacity + dt * 0.001, 0.65)
          if (opacity >= 0.65) phase = 1
        } else if (phase === 1) {
          // 활성
          lifetime -= dt
          if (lifetime <= 0) phase = 2
        } else {
          // 페이드아웃
          opacity = Math.max(opacity - dt * 0.0015, 0)
          if (opacity <= 0) return nextRadar()
        }
        return { ...prev, sweepAngle, phase, opacity, lifetime }
      })

      // 레이더 점 업데이트
      setSweep: {
        setRadar(prev => {
          // 스윕 각도가 30도 단위를 넘을 때 점 추가 (side effect이므로 ref로 트래킹 필요)
          return prev
        })
      }

      // 레이더 링 페이드
      setRadarRings(prev =>
        prev
          .map(r => ({ ...r, scale: r.scale + dt * 0.0018, opacity: r.opacity - dt * 0.0003 }))
          .filter(r => r.opacity > 0 && r.scale < 5)
      )

      // 링 스폰 (2초마다)
      ringTimer += dt
      if (ringTimer > 2000) {
        ringTimer = 0
        setRadar(cur => {
          setRadarRings(rings => [
            ...rings,
            {
              id:      ++idRef.current,
              scale:   1,
              opacity: 0.65,
              x:       cur.x,
              y:       cur.y,
              size:    cur.size,
            },
          ].slice(-8))
          return cur
        })
      }

      // 항공기 이동
      setAircrafts(prev => {
        const w = containerRef.current?.offsetWidth ?? 800
        return prev
          .map(a => ({ ...a, x: a.x + a.speed * a.direction * (dt / 16) }))
          .filter(a => a.x > -400 && a.x < w + 400)
      })

      frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }
  }, [])

  // 레이더 스윕에 맞춰 점 추가
  const prevSweepRef = useRef(0)
  useEffect(() => {
    const iv = setInterval(() => {
      setRadar(cur => {
        const angle = cur.sweepAngle
        const bucket = Math.floor(angle / 25)
        const prevBucket = Math.floor(prevSweepRef.current / 25)
        if (bucket !== prevBucket && cur.phase === 1) {
          setRadarDots(dots => {
            const updated = dots
              .map(d => ({ ...d, opacity: d.opacity - 0.04 }))
              .filter(d => d.opacity > 0)
            const count = Math.random() > 0.5 ? 1 : 2
            for (let i = 0; i < count; i++) {
              updated.push({
                id:       ++idRef.current,
                angle:    angle + (Math.random() - 0.5) * 18,
                distance: 0.2 + Math.random() * 0.72,
                opacity:  0.95,
                size:     1.5 + Math.random() * 2.5,
              })
            }
            return updated.slice(-18)
          })
        }
        prevSweepRef.current = angle
        return cur
      })
    }, 80)
    return () => clearInterval(iv)
  }, [])

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden">

      {/* 스캔라인 오버레이 */}
      <div className="absolute inset-0" style={{
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.015) 2px, rgba(0,255,65,0.015) 4px)",
        pointerEvents: "none",
      }}/>

      {/* 레이더 링들 (위치에서 확대 페이드) */}
      {radarRings.map(ring => (
        <div key={ring.id} className="absolute" style={{
          left:         `${ring.x}%`,
          top:          `${ring.y}%`,
          width:        ring.size,
          height:       ring.size,
          transform:    `translate(-50%, -50%) scale(${ring.scale})`,
          opacity:      ring.opacity,
          border:       "1.5px solid #00ff41",
          borderRadius: "50%",
          boxShadow:    "0 0 10px 1px rgba(0,255,65,0.3)",
        }}/>
      ))}

      {/* 레이더 (단일, 위치/크기 변경) */}
      <div className="absolute" style={{
        left:      `${radar.x}%`,
        top:       `${radar.y}%`,
        transform: "translate(-50%, -50%)",
        opacity:   radar.opacity,
        transition: "left 0.5s ease, top 0.5s ease",
      }}>
        <RadarSVG sweepAngle={radar.sweepAngle} dots={radarDots} size={radar.size}/>
      </div>

      {/* 항공기들 */}
      {aircrafts.map(a => (
        <div key={a.id} className="absolute" style={{
          left:            a.x,
          top:             `${a.y}%`,
          opacity:         a.opacity,
          transform:       `scale(${a.scale})`,
          transformOrigin: "center center",
          filter:          "drop-shadow(0 0 5px rgba(80,180,255,0.6))",
          transition:      "opacity 0.3s",
        }}>
          {a.type === "mothership" && <MothershipSVG flip={a.direction === -1}/>}
          {a.type === "carrier"    && <CarrierSVG    flip={a.direction === -1}/>}
          {a.type === "jet"        && <JetSVG        flip={a.direction === -1}/>}
          {a.type === "fighter"    && <FighterSVG    flip={a.direction === -1}/>}
          {a.type === "fighter2"   && <Fighter2SVG   flip={a.direction === -1}/>}
        </div>
      ))}

      {/* HUD 거래대금 */}
      {volumeLabel && (
        <div className="absolute top-2 right-2 font-mono text-[10px] tracking-widest px-2 py-1 rounded" style={{
          color:      "#00ff41",
          background: "rgba(0,15,0,0.75)",
          border:     "1px solid rgba(0,255,65,0.3)",
          textShadow: "0 0 6px #00ff41",
        }}>
          {volumeLabel}
        </div>
      )}
    </div>
  )
}
