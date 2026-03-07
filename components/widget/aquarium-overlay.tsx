"use client"

import { useEffect, useRef, useState } from "react"

interface Radar {
  id: number
  x: number
  y: number
  size: number // 0.6 ~ 2.0
  rotation: number // 0 ~ 360
  targetAngle: number // 0 ~ 360
  targetColor: "red" | "yellow"
  spawnTime: number
  duration: number // 1000 ~ 6000ms based on volume
  opacity: number
  wavePhase: number
}

interface Aircraft {
  id: number
  radarId: number
  x: number
  y: number
  size: number
  type: "fighter" | "bomber" | "jet"
  angle: number // facing direction
  isFiring: boolean
  firingStartTime: number
}

interface Missile {
  id: number
  aircraftId: number
  x: number
  y: number
  targetX: number
  targetY: number
  progress: number // 0 ~ 1
  startTime: number
}

const MAX_RADARS = 8
const MAX_AIRCRAFT_PER_RADAR = 1

function getDeltaLevel(deltaUsdt: number): "mega" | "high" | "mid" | "low" | "tiny" {
  if (deltaUsdt >= 740_000) return "mega"
  if (deltaUsdt >= 220_000) return "high"
  if (deltaUsdt >= 74_000) return "mid"
  if (deltaUsdt >= 15_000) return "low"
  return "tiny"
}

function getRadarDuration(level: "mega" | "high" | "mid" | "low" | "tiny"): number {
  // 거래대금 변동률 클수록 빠르게 회전 (duration 짧음)
  const speeds: Record<string, number> = {
    mega: 1000,
    high: 1800,
    mid: 2800,
    low: 4000,
    tiny: 6000,
  }
  return speeds[level] ?? 2800
}

function getRadarSize(): number {
  return 0.6 + Math.random() * 1.4
}

function getAircraftType(): "fighter" | "bomber" | "jet" {
  const r = Math.random()
  if (r < 0.5) return "fighter"
  if (r < 0.8) return "bomber"
  return "jet"
}

export default function RadarOverlay({ priceData }: { priceData?: { volume: number; deltaVolume: number } }) {
  const [mounted, setMounted] = useState(false)
  const [radars, setRadars] = useState<Radar[]>([])
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [missiles, setMissiles] = useState<Missile[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const animFrameRef = useRef<number>(0)
  const radarIdRef = useRef(0)
  const aircraftIdRef = useRef(0)
  const missileIdRef = useRef(0)
  const lastSpawnRef = useRef<number>(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  // 레이더 및 항공기 spawn
  useEffect(() => {
    if (!mounted || !priceData) return

    const level = getDeltaLevel(priceData.deltaVolume)
    const spawnInterval = level === "mega" ? 1200 : level === "high" ? 2000 : level === "mid" ? 3000 : 4500
    const now = Date.now()

    if (now - lastSpawnRef.current > spawnInterval && radars.length < MAX_RADARS) {
      const W = containerRef.current?.clientWidth ?? 800
      const H = containerRef.current?.clientHeight ?? 400

      const newRadar: Radar = {
        id: radarIdRef.current++,
        x: Math.random() * W,
        y: Math.random() * H,
        size: getRadarSize(),
        rotation: 0,
        targetAngle: Math.random() * 360,
        targetColor: Math.random() > 0.3 ? "red" : "yellow",
        spawnTime: now,
        duration: getRadarDuration(level),
        opacity: 1,
        wavePhase: 0,
      }

      setRadars((prev) => [...prev, newRadar])
      lastSpawnRef.current = now

      // 항공기 spawn (레이더 주변)
      const newAircraft: Aircraft = {
        id: aircraftIdRef.current++,
        radarId: newRadar.id,
        x: newRadar.x + Math.cos((newRadar.targetAngle * Math.PI) / 180) * 80,
        y: newRadar.y + Math.sin((newRadar.targetAngle * Math.PI) / 180) * 80,
        size: 0.7 + Math.random() * 0.6,
        type: getAircraftType(),
        angle: newRadar.targetAngle,
        isFiring: false,
        firingStartTime: 0,
      }

      setAircraft((prev) => [...prev, newAircraft])
    }
  }, [mounted, priceData, radars.length])

  // 애니메이션 루프
  useEffect(() => {
    if (!mounted) return

    const animate = () => {
      const now = Date.now()

      // 레이더 업데이트
      setRadars((prev) =>
        prev
          .map((r) => {
            const elapsed = now - r.spawnTime
            const progress = elapsed / r.duration

            if (progress > 1) return null

            return {
              ...r,
              rotation: (progress * 360) % 360,
              wavePhase: progress,
              opacity: Math.max(0, 1 - progress * 0.3), // 천천히 페이드 아웃
            }
          })
          .filter((r) => r !== null) as Radar[]
      )

      // 항공기 업데이트 및 자동 사격
      setAircraft((prev) =>
        prev.map((a) => {
          const radar = radars.find((r) => r.id === a.radarId)
          if (!radar) return a

          const elapsed = now - radar.spawnTime
          const progress = elapsed / radar.duration

          if (progress > 1) return a

          // 2초 후 자동으로 사격 시작
          if (!a.isFiring && elapsed > 2000 && progress < 0.8) {
            return {
              ...a,
              isFiring: true,
              firingStartTime: now,
            }
          }

          return a
        })
      )

      // 미사일 업데이트
      setMissiles((prev) =>
        prev
          .map((m) => {
            const elapsed = now - m.startTime
            const flightTime = 800 // 미사일 비행 시간 800ms

            if (elapsed > flightTime) return null

            const progress = elapsed / flightTime
            const x = m.x + (m.targetX - m.x) * progress
            const y = m.y + (m.targetY - m.y) * progress

            // 목표 근처 도달 시 히트 판정 (거리 30px 이내)
            const dist = Math.hypot(x - m.targetX, y - m.targetY)
            if (dist < 30) {
              // 히트! 레이더 제거
              setRadars((r) => r.filter((radar) => {
                const aircraftWithThisRadar = aircraft.find((ac) => ac.id === m.aircraftId)
                if (!aircraftWithThisRadar) return true
                return radar.id !== aircraftWithThisRadar.radarId
              }))
              return null
            }

            return {
              ...m,
              x,
              y,
              progress,
            }
          })
          .filter((m) => m !== null) as Missile[]
      )

      // 항공기 사격 중인 경우 미사일 생성
      aircraft.forEach((a) => {
        if (a.isFiring && now - a.firingStartTime < 3000) {
          // 3초 동안 주기적으로 사격 (200ms 간격)
          if ((now - a.firingStartTime) % 200 < 50) {
            const radar = radars.find((r) => r.id === a.radarId)
            if (radar) {
              const targetX = radar.x + Math.cos((radar.targetAngle * Math.PI) / 180) * 100
              const targetY = radar.y + Math.sin((radar.targetAngle * Math.PI) / 180) * 100

              const newMissile: Missile = {
                id: missileIdRef.current++,
                aircraftId: a.id,
                x: a.x,
                y: a.y,
                targetX,
                targetY,
                progress: 0,
                startTime: now,
              }

              setMissiles((prev) => [...prev, newMissile])
            }
          }
        }
      })

      animFrameRef.current = requestAnimationFrame(animate)
    }

    animFrameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [mounted, radars, aircraft])

  if (!mounted) return <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl" />

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* 그리드 배경 */}
      <svg className="absolute inset-0 w-full h-full opacity-20" preserveAspectRatio="none">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* 레이더 렌더링 */}
      {radars.map((radar) => (
        <div
          key={radar.id}
          className="absolute pointer-events-none"
          style={{
            left: radar.x,
            top: radar.y,
            width: 200 * radar.size,
            height: 200 * radar.size,
            transform: "translate(-50%, -50%)",
            opacity: radar.opacity,
          }}
        >
          {/* 배경 원 */}
          <svg
            viewBox="0 0 200 200"
            className="absolute inset-0 w-full h-full"
            style={{ filter: "drop-shadow(0 0 8px rgba(34,197,94,0.4))" }}
          >
            {/* 정적 그리드 원 */}
            <circle cx="100" cy="100" r="30" fill="none" stroke="rgba(34,197,94,0.3)" strokeWidth="0.5" />
            <circle cx="100" cy="100" r="60" fill="none" stroke="rgba(34,197,94,0.25)" strokeWidth="0.5" />
            <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(34,197,94,0.2)" strokeWidth="0.5" />

            {/* 회전하는 스윕 라인 */}
            <g
              style={{
                transform: `rotate(${radar.rotation}deg)`,
                transformOrigin: "100px 100px",
                transformBox: "fill-box",
              }}
            >
              <line x1="100" y1="100" x2="100" y2="10" stroke="rgba(34,197,94,0.8)" strokeWidth="1.5" />
              <line
                x1="100"
                y1="100"
                x2="100"
                y2="10"
                stroke="rgba(34,197,94,1)"
                strokeWidth="0.8"
                opacity={1 - radar.wavePhase}
              />
            </g>

            {/* 파동 (wave) */}
            <circle
              cx="100"
              cy="100"
              r={radar.wavePhase * 95}
              fill="none"
              stroke="rgba(34,197,94,0.6)"
              strokeWidth="2"
              opacity={Math.cos(radar.wavePhase * Math.PI) * 0.5 + 0.5}
            />

            {/* 대상 포인트 */}
            <circle
              cx={100 + Math.cos((radar.targetAngle * Math.PI) / 180) * 80}
              cy={100 + Math.sin((radar.targetAngle * Math.PI) / 180) * 80}
              r="5"
              fill={radar.targetColor === "red" ? "#ef4444" : "#eab308"}
              opacity={1 - radar.wavePhase * 0.5}
            />
          </svg>
        </div>
      ))}

      {/* 항공기 렌더링 */}
      {aircraft.map((ac) => (
        <div
          key={ac.id}
          className="absolute pointer-events-none"
          style={{
            left: ac.x,
            top: ac.y,
            width: 40 * ac.size,
            height: 40 * ac.size,
            transform: `translate(-50%, -50%) rotate(${ac.angle}deg)`,
          }}
        >
          <svg viewBox="0 0 40 40" className="w-full h-full" style={{ filter: "drop-shadow(0 0 4px rgba(59,130,246,0.6))" }}>
            {ac.type === "fighter" && (
              <>
                <polygon points="20,5 28,20 20,15 12,20" fill="#3b82f6" />
                <rect x="18" y="20" width="4" height="18" fill="#3b82f6" />
                <circle cx="20" cy="12" r="3" fill="#60a5fa" />
              </>
            )}
            {ac.type === "bomber" && (
              <>
                <ellipse cx="20" cy="18" rx="12" ry="8" fill="#3b82f6" />
                <rect x="18" y="8" width="4" height="10" fill="#3b82f6" />
                <polygon points="10,20 14,22 26,22 30,20" fill="#1e40af" opacity="0.6" />
              </>
            )}
            {ac.type === "jet" && (
              <>
                <polygon points="20,4 30,18 20,20 10,18" fill="#3b82f6" />
                <rect x="18" y="20" width="4" height="16" fill="#3b82f6" />
                <polygon points="8,22 12,24 20,24 14,22" fill="#60a5fa" opacity="0.7" />
              </>
            )}
          </svg>
        </div>
      ))}

      {/* 미사일 렌더링 */}
      {missiles.map((missile) => (
        <div
          key={missile.id}
          className="absolute pointer-events-none"
          style={{
            left: missile.x,
            top: missile.y,
            width: 12,
            height: 12,
            transform: "translate(-50%, -50%)",
          }}
        >
          <svg
            viewBox="0 0 12 12"
            className="w-full h-full"
            style={{ filter: "drop-shadow(0 0 6px rgba(168,85,247,1))" }}
          >
            <circle cx="6" cy="6" r="4" fill="#a855f7" />
            <circle cx="6" cy="6" r="2" fill="#e879f9" />
          </svg>
        </div>
      ))}
    </div>
  )
}

export { RadarOverlay as AquariumOverlay }
