"use client"

import { useEffect, useRef, useState } from "react"

interface Creature {
  id: number
  type: "whale" | "shark" | "dolphin" | "fish" | "smallfish" | "shrimp" | "seahorse" | "diver" | "jellyfish" | "crab"
  x: number
  y: number
  speed: number
  dir: 1 | -1
  scale: number
  opacity: number
  yDrift: number
  yPhase: number
}

function getVolumeLevel(quoteVol: number): "mega" | "high" | "mid" | "low" | "tiny" {
  // quoteAssetVolume은 USD 기준 24시간 거래대금
  if (quoteVol > 5_000_000_000) return "mega"
  if (quoteVol > 2_000_000_000) return "high"
  if (quoteVol > 800_000_000)   return "mid"
  if (quoteVol > 200_000_000)   return "low"
  return "tiny"
}

function pickCreatureType(level: "mega" | "high" | "mid" | "low" | "tiny"): Creature["type"] {
  const pools: Record<string, Creature["type"][]> = {
    mega:  ["whale", "shark", "whale", "dolphin"],
    high:  ["dolphin", "shark", "fish", "dolphin"],
    mid:   ["fish", "fish", "smallfish", "diver"],
    low:   ["shrimp", "seahorse", "smallfish", "jellyfish"],
    tiny:  ["shrimp", "crab", "jellyfish", "seahorse"],
  }
  const pool = pools[level]
  return pool[Math.floor(Math.random() * pool.length)]
}

function CreatureSVG({ type, dir }: { type: Creature["type"]; dir: 1 | -1 }) {
  const flip = dir === -1 ? "scale(-1,1)" : undefined

  switch (type) {
    case "whale":
      return (
        <svg width="120" height="60" viewBox="0 0 120 60" transform={flip}>
          {/* body */}
          <ellipse cx="55" cy="30" rx="50" ry="22" fill="#1e3a5f" opacity="0.9" />
          {/* belly */}
          <ellipse cx="55" cy="36" rx="35" ry="12" fill="#4a7ab5" opacity="0.7" />
          {/* tail */}
          <path d="M5 30 Q0 15 15 20 Q8 30 15 40 Q0 45 5 30Z" fill="#1e3a5f" />
          {/* eye */}
          <circle cx="88" cy="24" r="4" fill="white" />
          <circle cx="89" cy="24" r="2" fill="#1a1a2e" />
          {/* fin */}
          <path d="M55 8 Q65 2 75 14 Q65 12 55 8Z" fill="#1e3a5f" />
          {/* water spout */}
          <path d="M90 10 Q93 2 96 10" stroke="#7dd3fc" strokeWidth="2" fill="none" opacity="0.8" />
        </svg>
      )
    case "shark":
      return (
        <svg width="90" height="50" viewBox="0 0 90 50" transform={flip}>
          <ellipse cx="42" cy="28" rx="38" ry="16" fill="#6b7280" opacity="0.9" />
          <ellipse cx="42" cy="32" rx="28" ry="9" fill="#9ca3af" opacity="0.6" />
          <path d="M4 28 Q0 16 12 22 Q6 28 12 34 Q0 40 4 28Z" fill="#6b7280" />
          <path d="M42 12 Q50 2 58 14 Q50 11 42 12Z" fill="#6b7280" />
          <path d="M20 36 Q22 42 28 38 Q24 36 20 36Z" fill="#6b7280" />
          <circle cx="72" cy="24" r="3" fill="white" />
          <circle cx="73" cy="24" r="1.5" fill="#1a1a2e" />
          <path d="M76 30 Q80 34 76 36 Q79 32 76 30Z" fill="white" opacity="0.8" />
        </svg>
      )
    case "dolphin":
      return (
        <svg width="80" height="45" viewBox="0 0 80 45" transform={flip}>
          <ellipse cx="38" cy="26" rx="32" ry="14" fill="#0ea5e9" opacity="0.85" />
          <ellipse cx="38" cy="30" rx="22" ry="8" fill="#7dd3fc" opacity="0.6" />
          <path d="M6 26 Q0 14 14 20 Q8 26 14 32 Q0 38 6 26Z" fill="#0ea5e9" />
          <path d="M38 12 Q46 4 54 14 Q46 10 38 12Z" fill="#0ea5e9" />
          <path d="M62 22 Q70 18 72 28 Q65 26 62 22Z" fill="#0ea5e9" />
          <circle cx="62" cy="22" r="3" fill="white" />
          <circle cx="63" cy="22" r="1.5" fill="#1a1a2e" />
        </svg>
      )
    case "fish":
      return (
        <svg width="55" height="32" viewBox="0 0 55 32" transform={flip}>
          <ellipse cx="28" cy="16" rx="22" ry="11" fill="#f97316" opacity="0.85" />
          <ellipse cx="28" cy="18" rx="15" ry="6" fill="#fed7aa" opacity="0.6" />
          <path d="M6 16 Q0 8 12 12 Q6 16 12 20 Q0 24 6 16Z" fill="#f97316" />
          <path d="M42 8 Q48 4 50 14 Q44 12 42 8Z" fill="#fb923c" opacity="0.8" />
          <circle cx="42" cy="13" r="2.5" fill="white" />
          <circle cx="43" cy="13" r="1.2" fill="#1a1a2e" />
          {/* scales */}
          <path d="M22 12 Q26 10 30 12" stroke="#ea580c" strokeWidth="0.8" fill="none" opacity="0.6"/>
          <path d="M18 16 Q22 14 26 16" stroke="#ea580c" strokeWidth="0.8" fill="none" opacity="0.6"/>
        </svg>
      )
    case "smallfish":
      return (
        <svg width="36" height="22" viewBox="0 0 36 22" transform={flip}>
          <ellipse cx="18" cy="11" rx="14" ry="7" fill="#a855f7" opacity="0.8" />
          <path d="M4 11 Q0 6 8 8 Q4 11 8 14 Q0 16 4 11Z" fill="#a855f7" />
          <circle cx="26" cy="9" r="2" fill="white" />
          <circle cx="27" cy="9" r="1" fill="#1a1a2e" />
        </svg>
      )
    case "shrimp":
      return (
        <svg width="30" height="28" viewBox="0 0 30 28" transform={flip}>
          <path d="M8 20 Q4 14 8 8 Q14 4 20 8 Q24 12 22 18 Q18 24 12 24 Q8 24 8 20Z" fill="#f87171" opacity="0.85" />
          <path d="M20 8 Q24 4 26 10" stroke="#f87171" strokeWidth="2" fill="none" />
          <path d="M8 20 Q4 24 6 26" stroke="#f87171" strokeWidth="1.5" fill="none" />
          <path d="M12 24 Q10 28 12 28" stroke="#f87171" strokeWidth="1.5" fill="none" />
          <circle cx="20" cy="9" r="1.5" fill="white" />
          <circle cx="20.5" cy="9" r="0.8" fill="#1a1a2e" />
          {/* antennae */}
          <path d="M22 6 Q26 2 28 4" stroke="#fca5a5" strokeWidth="1" fill="none" />
          <path d="M21 5 Q24 0 26 2" stroke="#fca5a5" strokeWidth="1" fill="none" />
        </svg>
      )
    case "seahorse":
      return (
        <svg width="24" height="48" viewBox="0 0 24 48" transform={flip}>
          <path d="M12 6 Q18 6 18 12 Q18 18 12 20 Q8 22 8 28 Q8 36 12 40 Q14 44 12 46 Q10 42 10 38 Q6 32 6 26 Q6 18 12 14 Q16 12 14 8 Q12 4 12 6Z" fill="#22c55e" opacity="0.85" />
          <circle cx="15" cy="7" r="4" fill="#22c55e" />
          <circle cx="16" cy="6" r="1.5" fill="white" />
          <circle cx="16.5" cy="6" r="0.8" fill="#1a1a2e" />
          <path d="M18 6 Q22 4 22 8" stroke="#22c55e" strokeWidth="1.5" fill="none" />
          {/* fin */}
          <path d="M12 18 Q20 16 20 20 Q16 22 12 20Z" fill="#4ade80" opacity="0.7" />
        </svg>
      )
    case "diver":
      return (
        <svg width="44" height="56" viewBox="0 0 44 56" transform={flip}>
          {/* tank */}
          <rect x="16" y="24" width="12" height="20" rx="4" fill="#94a3b8" />
          {/* body */}
          <ellipse cx="22" cy="32" rx="10" ry="14" fill="#0891b2" opacity="0.9" />
          {/* head/mask */}
          <circle cx="22" cy="16" r="9" fill="#0891b2" />
          <ellipse cx="22" cy="16" rx="7" ry="5" fill="#bae6fd" opacity="0.8" />
          <circle cx="22" cy="15" r="3" fill="#0ea5e9" opacity="0.6" />
          {/* arms */}
          <path d="M12 30 Q6 34 8 40" stroke="#0891b2" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M32 30 Q38 34 36 40" stroke="#0891b2" strokeWidth="4" strokeLinecap="round" fill="none" />
          {/* fins */}
          <ellipse cx="16" cy="46" rx="8" ry="4" fill="#0284c7" transform="rotate(-20,16,46)" />
          <ellipse cx="28" cy="46" rx="8" ry="4" fill="#0284c7" transform="rotate(20,28,46)" />
          {/* bubbles */}
          <circle cx="34" cy="18" r="2" fill="white" opacity="0.7" />
          <circle cx="37" cy="14" r="1.5" fill="white" opacity="0.5" />
          <circle cx="35" cy="10" r="1" fill="white" opacity="0.4" />
        </svg>
      )
    case "jellyfish":
      return (
        <svg width="36" height="44" viewBox="0 0 36 44" transform={flip}>
          {/* bell */}
          <ellipse cx="18" cy="16" rx="16" ry="14" fill="#d946ef" opacity="0.6" />
          <ellipse cx="18" cy="14" rx="12" ry="8" fill="#e879f9" opacity="0.4" />
          {/* tentacles */}
          <path d="M8 28 Q6 36 8 44" stroke="#c026d3" strokeWidth="1.5" fill="none" opacity="0.7" />
          <path d="M12 30 Q10 38 12 44" stroke="#c026d3" strokeWidth="1.5" fill="none" opacity="0.7" />
          <path d="M18 30 Q18 38 18 44" stroke="#c026d3" strokeWidth="1.5" fill="none" opacity="0.7" />
          <path d="M24 30 Q26 38 24 44" stroke="#c026d3" strokeWidth="1.5" fill="none" opacity="0.7" />
          <path d="M28 28 Q30 36 28 44" stroke="#c026d3" strokeWidth="1.5" fill="none" opacity="0.7" />
        </svg>
      )
    case "crab":
      return (
        <svg width="40" height="30" viewBox="0 0 40 30" transform={flip}>
          {/* body */}
          <ellipse cx="20" cy="18" rx="12" ry="9" fill="#dc2626" opacity="0.85" />
          {/* claws */}
          <path d="M8 16 Q2 12 2 8 Q6 6 8 10" stroke="#dc2626" strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="2" cy="8" r="4" fill="#ef4444" />
          <path d="M32 16 Q38 12 38 8 Q34 6 32 10" stroke="#dc2626" strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="38" cy="8" r="4" fill="#ef4444" />
          {/* legs */}
          <path d="M10 20 Q6 24 4 28" stroke="#dc2626" strokeWidth="2" fill="none" />
          <path d="M14 22 Q12 26 10 30" stroke="#dc2626" strokeWidth="2" fill="none" />
          <path d="M26 22 Q28 26 30 30" stroke="#dc2626" strokeWidth="2" fill="none" />
          <path d="M30 20 Q34 24 36 28" stroke="#dc2626" strokeWidth="2" fill="none" />
          {/* eyes */}
          <circle cx="16" cy="12" r="2.5" fill="white" />
          <circle cx="16.5" cy="12" r="1.2" fill="#1a1a2e" />
          <circle cx="24" cy="12" r="2.5" fill="white" />
          <circle cx="24.5" cy="12" r="1.2" fill="#1a1a2e" />
        </svg>
      )
    default:
      return null
  }
}

let creatureId = 0

export function AquariumOverlay() {
  const [creatures, setCreatures] = useState<Creature[]>([])
  const [volumeLevel, setVolumeLevel] = useState<"mega" | "high" | "mid" | "low" | "tiny">("mid")
  const animFrameRef = useRef<number>(0)
  const lastSpawnRef = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // 거래대금 폴링
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof window !== "undefined") {
        const data = (window as any).__tickerData
        if (data?.quoteAssetVolume) {
          setVolumeLevel(getVolumeLevel(data.quoteAssetVolume))
        }
      }
    }, 2000)
    return () => clearInterval(id)
  }, [])

  // 애니메이션 루프
  useEffect(() => {
    const W = containerRef.current?.clientWidth ?? 800
    const H = containerRef.current?.clientHeight ?? 280

    const spawnInterval: Record<string, number> = {
      mega: 1500, high: 2500, mid: 4000, low: 6000, tiny: 8000,
    }
    const maxCount: Record<string, number> = {
      mega: 8, high: 6, mid: 4, low: 3, tiny: 2,
    }

    const loop = (ts: number) => {
      // 생성
      if (ts - lastSpawnRef.current > spawnInterval[volumeLevel]) {
        lastSpawnRef.current = ts
        setCreatures(prev => {
          if (prev.length >= maxCount[volumeLevel]) return prev
          const dir: 1 | -1 = Math.random() > 0.5 ? 1 : -1
          const type = pickCreatureType(volumeLevel)
          const sizeMap: Record<Creature["type"], number> = {
            whale: 1.0, shark: 0.85, dolphin: 0.75, diver: 0.65,
            fish: 0.6, smallfish: 0.5, shrimp: 0.45, seahorse: 0.4,
            jellyfish: 0.5, crab: 0.45,
          }
          const speedMap: Record<Creature["type"], number> = {
            whale: 0.4, shark: 0.7, dolphin: 0.65, diver: 0.2,
            fish: 0.55, smallfish: 0.5, shrimp: 0.3, seahorse: 0.15,
            jellyfish: 0.1, crab: 0.25,
          }
          const c: Creature = {
            id: creatureId++,
            type,
            x: dir === 1 ? -150 : W + 150,
            y: H * 0.15 + Math.random() * H * 0.65,
            speed: speedMap[type] * (0.8 + Math.random() * 0.4),
            dir,
            scale: sizeMap[type] * (0.9 + Math.random() * 0.2),
            opacity: 0.75 + Math.random() * 0.25,
            yDrift: 0.3 + Math.random() * 0.4,
            yPhase: Math.random() * Math.PI * 2,
          }
          return [...prev, c]
        })
      }

      // 이동
      setCreatures(prev =>
        prev
          .map(c => ({
            ...c,
            x: c.x + c.speed * c.dir,
            y: c.y + Math.sin(Date.now() / 1200 + c.yPhase) * c.yDrift * 0.1,
          }))
          .filter(c => c.dir === 1 ? c.x < W + 200 : c.x > -200)
      )

      animFrameRef.current = requestAnimationFrame(loop)
    }
    animFrameRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [volumeLevel])

  // 거품 버블
  const [bubbles] = useState(() =>
    Array.from({ length: 14 }, (_, i) => ({
      id: i,
      x: 5 + Math.random() * 90,
      delay: Math.random() * 8,
      dur: 4 + Math.random() * 5,
      size: 3 + Math.random() * 6,
    }))
  )

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
      {/* 수족관 배경 그라데이션 */}
      <div className="absolute inset-0 rounded-xl"
        style={{
          background: "linear-gradient(180deg, rgba(7,89,133,0.18) 0%, rgba(3,105,161,0.08) 50%, rgba(2,132,199,0.04) 100%)",
        }}
      />

      {/* 빛 반사 줄기 */}
      <div className="absolute top-0 left-[15%] w-px h-full opacity-10"
        style={{ background: "linear-gradient(180deg, rgba(186,230,253,0.8) 0%, transparent 100%)" }} />
      <div className="absolute top-0 left-[35%] w-px h-full opacity-8"
        style={{ background: "linear-gradient(180deg, rgba(186,230,253,0.5) 0%, transparent 80%)" }} />
      <div className="absolute top-0 left-[60%] w-px h-full opacity-10"
        style={{ background: "linear-gradient(180deg, rgba(186,230,253,0.7) 0%, transparent 100%)" }} />
      <div className="absolute top-0 left-[80%] w-[2px] h-full opacity-6"
        style={{ background: "linear-gradient(180deg, rgba(186,230,253,0.4) 0%, transparent 70%)" }} />

      {/* 수초 */}
      {[8, 18, 72, 85, 92].map((left, i) => (
        <div key={i} className="absolute bottom-0" style={{ left: `${left}%` }}>
          <svg width="16" height="48" viewBox="0 0 16 48" style={{ opacity: 0.35 + i * 0.05 }}>
            <path d={`M8 48 Q${4 + (i % 2) * 8} 32 8 20 Q${12 - (i % 2) * 8} 10 8 0`}
              stroke="#22c55e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <ellipse cx={i % 2 === 0 ? 4 : 12} cy="18" rx="5" ry="8" fill="#16a34a" opacity="0.7"
              transform={`rotate(${i % 2 === 0 ? -20 : 20}, ${i % 2 === 0 ? 4 : 12}, 18)`} />
          </svg>
        </div>
      ))}

      {/* 모래/바닥 */}
      <div className="absolute bottom-0 left-0 right-0 h-3 rounded-b-xl"
        style={{ background: "linear-gradient(180deg, transparent, rgba(251,191,36,0.08))" }} />

      {/* 버블 */}
      {bubbles.map(b => (
        <div
          key={b.id}
          className="absolute rounded-full border border-sky-300/30"
          style={{
            left: `${b.x}%`,
            bottom: 0,
            width: b.size,
            height: b.size,
            background: "rgba(186,230,253,0.15)",
            animation: `bubbleRise ${b.dur}s ${b.delay}s infinite ease-in`,
          }}
        />
      ))}

      {/* 생물들 */}
      {creatures.map(c => (
        <div
          key={c.id}
          className="absolute"
          style={{
            left: c.x,
            top: c.y,
            transform: `scale(${c.scale})`,
            opacity: c.opacity,
            transition: "opacity 0.5s",
          }}
        >
          <CreatureSVG type={c.type} dir={c.dir} />
        </div>
      ))}

      {/* 거래량 레벨 표시 */}
      <div className="absolute top-2 right-2 text-[9px] text-sky-300/60 font-medium tracking-wider">
        {{
          mega: "🐳 MEGA VOL",
          high: "🐬 HIGH VOL",
          mid:  "🐟 MID VOL",
          low:  "🦐 LOW VOL",
          tiny: "🦀 TINY VOL",
        }[volumeLevel]}
      </div>

      <style jsx>{`
        @keyframes bubbleRise {
          0%   { transform: translateY(0) translateX(0); opacity: 0.6; }
          50%  { transform: translateY(-50vh) translateX(6px); opacity: 0.3; }
          100% { transform: translateY(-100vh) translateX(-3px); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
