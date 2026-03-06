"use client"

import { useEffect, useRef, useState, useCallback } from "react"

/* ─── 거래대금 레벨 ─────────────────────────────────────────── */
type VolumeLevel = "mega" | "high" | "mid" | "low" | "tiny"

function getVolumeLevel(qv: number): VolumeLevel {
  if (qv > 5_000_000_000) return "mega"
  if (qv > 2_000_000_000) return "high"
  if (qv > 800_000_000)   return "mid"
  if (qv > 200_000_000)   return "low"
  return "tiny"
}

const LEVEL_LABEL: Record<VolumeLevel, string> = {
  mega: "만루홈런",
  high: "솔로홈런",
  mid:  "안타",
  low:  "번트",
  tiny: "삼진아웃",
}

/* ─── 야구공 SVG ─────────────────────────────────────────────── */
function BaseballSVG({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="15" fill="#f5f0e8" stroke="#e8dcc8" strokeWidth="1" />
      {/* 실밥 왼쪽 */}
      <path d="M10 7 Q8 12 10 16 Q8 20 10 25"
        stroke="#cc2200" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M13 6 Q11 11 13 15 Q11 19 13 24"
        stroke="#cc2200" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6" />
      {/* 실밥 오른쪽 */}
      <path d="M22 7 Q24 12 22 16 Q24 20 22 25"
        stroke="#cc2200" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M19 6 Q21 11 19 15 Q21 19 19 24"
        stroke="#cc2200" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6" />
    </svg>
  )
}

/* ─── 야구방망이 SVG ─────────────────────────────────────────── */
function BatSVG({ angle = 0 }: { angle?: number }) {
  return (
    <svg width="60" height="20" viewBox="0 0 60 20"
      style={{ transform: `rotate(${angle}deg)`, transformOrigin: "50% 50%" }}>
      {/* 배럴 */}
      <ellipse cx="50" cy="10" rx="10" ry="7" fill="#8B4513" />
      <ellipse cx="50" cy="10" rx="10" ry="7" fill="url(#batGrad)" />
      {/* 손잡이 */}
      <rect x="4" y="8" width="40" height="4" rx="2" fill="#6B3410" />
      <rect x="0" y="7" width="8" height="6" rx="3" fill="#5a2d0c" />
      <defs>
        <linearGradient id="batGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cd853f" />
          <stop offset="100%" stopColor="#8B4513" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* ─── 애니메이션 이벤트 타입 ──────────────────────────────────── */
interface BaseballEvent {
  id: number
  type: VolumeLevel
  startTime: number
  duration: number
  // 공 위치
  ballX: number
  ballY: number
  // 타자 위치
  batterX: number
  batterY: number
  phase: "idle" | "pitch" | "hit" | "fly" | "done"
}

let eid = 0

/* ─── 투수 SVG ─────────────────────────────────────────────── */
function PitcherSVG({ phase }: { phase: BaseballEvent["phase"] }) {
  const armAngle = phase === "pitch" ? -60 : -20
  return (
    <svg width="28" height="52" viewBox="0 0 28 52">
      {/* 모자 */}
      <ellipse cx="14" cy="8" rx="9" ry="4" fill="#1a3a5c" />
      <rect x="8" y="4" width="12" height="6" rx="2" fill="#1a3a5c" />
      <rect x="4" y="7" width="6" height="2" rx="1" fill="#1a3a5c" />
      {/* 얼굴 */}
      <circle cx="14" cy="14" r="7" fill="#fcd9b0" />
      {/* 유니폼 몸통 */}
      <ellipse cx="14" cy="32" rx="9" ry="12" fill="#f0f0f0" />
      {/* 번호 */}
      <text x="14" y="36" textAnchor="middle" fontSize="8" fill="#1a3a5c" fontWeight="bold">21</text>
      {/* 투구 팔 */}
      <line x1="14" y1="24"
        x2={14 + Math.cos((armAngle * Math.PI) / 180) * 14}
        y2={24 + Math.sin((armAngle * Math.PI) / 180) * 14}
        stroke="#1a3a5c" strokeWidth="4" strokeLinecap="round" />
      {/* 글러브 팔 */}
      <line x1="14" y1="24" x2="2" y2="32"
        stroke="#1a3a5c" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="2" cy="33" rx="5" ry="4" fill="#8B4513" />
      {/* 다리 */}
      <line x1="10" y1="44" x2="8" y2="52" stroke="#1a3a5c" strokeWidth="4" strokeLinecap="round" />
      <line x1="18" y1="44" x2={phase === "pitch" ? 22 : 20} y2="52"
        stroke="#1a3a5c" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

/* ─── 타자 SVG ─────────────────────────────────────────────── */
function BatterSVG({ phase }: { phase: BaseballEvent["phase"] }) {
  const swinging = phase === "hit"
  return (
    <svg width="36" height="56" viewBox="0 0 36 56">
      {/* 헬멧 */}
      <ellipse cx="20" cy="9" rx="10" ry="8" fill="#cc2200" />
      <rect x="10" y="12" width="14" height="5" rx="2" fill="#cc2200" />
      <rect x="24" y="10" width="8" height="3" rx="1" fill="#cc2200" />
      {/* 얼굴 */}
      <circle cx="20" cy="17" r="7" fill="#fcd9b0" />
      {/* 유니폼 */}
      <ellipse cx="18" cy="36" rx="10" ry="13" fill="#1a3a5c" />
      {/* 배팅 자세 */}
      {swinging ? (
        <>
          {/* 스윙 중 */}
          <line x1="18" y1="26" x2="32" y2="20" stroke="#cc2200" strokeWidth="4" strokeLinecap="round" />
          <line x1="18" y1="26" x2="4"  y2="22" stroke="#1a3a5c" strokeWidth="4" strokeLinecap="round" />
          {/* 방망이 */}
          <line x1="32" y1="20" x2="8" y2="10" stroke="#8B4513" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="7" cy="9" rx="5" ry="3.5" fill="#8B4513" transform="rotate(-30,7,9)" />
        </>
      ) : (
        <>
          {/* 대기 자세 */}
          <line x1="18" y1="26" x2="28" y2="30" stroke="#cc2200" strokeWidth="4" strokeLinecap="round" />
          <line x1="18" y1="26" x2="8"  y2="30" stroke="#1a3a5c" strokeWidth="4" strokeLinecap="round" />
          {/* 방망이 세움 */}
          <line x1="28" y1="30" x2="30" y2="12" stroke="#8B4513" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="30" cy="11" rx="3" ry="5" fill="#8B4513" />
        </>
      )}
      {/* 다리 */}
      <line x1="14" y1="48" x2={swinging ? 8 : 12}  y2="56" stroke="#1a3a5c" strokeWidth="5" strokeLinecap="round" />
      <line x1="22" y1="48" x2={swinging ? 28 : 24} y2="56" stroke="#1a3a5c" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}

/* ─── 포수 SVG (삼진 시) ─────────────────────────────────────── */
function CatcherSVG() {
  return (
    <svg width="30" height="48" viewBox="0 0 30 48">
      <ellipse cx="15" cy="8" rx="9" ry="7" fill="#333" />
      <circle cx="15" cy="15" r="6" fill="#fcd9b0" />
      <ellipse cx="15" cy="32" rx="9" ry="11" fill="#444" />
      <line x1="15" y1="24" x2="2" y2="32" stroke="#333" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="2" cy="33" rx="7" ry="5" fill="#6B3A10" />
      <line x1="15" y1="24" x2="26" y2="30" stroke="#333" strokeWidth="4" strokeLinecap="round" />
      <line x1="11" y1="42" x2="9"  y2="48" stroke="#333" strokeWidth="4" strokeLinecap="round" />
      <line x1="19" y1="42" x2="21" y2="48" stroke="#333" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

/* ─── 관중 환호 이펙트 ─────────────────────────────────────── */
function CrowdEffect({ level }: { level: VolumeLevel }) {
  const colors = ["#fbbf24", "#f97316", "#ef4444", "#a3e635", "#38bdf8"]
  const count = level === "mega" ? 20 : level === "high" ? 14 : level === "mid" ? 8 : 4
  return (
    <div className="absolute inset-0 pointer-events-none">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 4 + Math.random() * 6,
            height: 4 + Math.random() * 6,
            background: colors[i % colors.length],
            left: `${10 + Math.random() * 80}%`,
            top: `${5 + Math.random() * 40}%`,
            animation: `confettiFall ${1.5 + Math.random() * 2}s ${Math.random() * 0.5}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  )
}

/* ─── 메인 컴포넌트 ─────────────────────────────────────────── */
export function BaseballOverlay() {
  const [volumeLevel, setVolumeLevel] = useState<VolumeLevel>("mid")
  const [events, setEvents] = useState<BaseballEvent[]>([])
  const [showCrowd, setShowCrowd] = useState(false)
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // 거래대금 폴링
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof window !== "undefined") {
        const d = (window as any).__tickerData
        if (d?.quoteAssetVolume) setVolumeLevel(getVolumeLevel(d.quoteAssetVolume))
      }
    }, 2000)
    return () => clearInterval(id)
  }, [])

  // 이벤트 발생
  const triggerPlay = useCallback(() => {
    const W = containerRef.current?.clientWidth ?? 700
    const H = containerRef.current?.clientHeight ?? 260

    const batterX = W * 0.55
    const batterY = H * 0.45
    const pitcherX = W * 0.25
    const pitcherY = H * 0.38

    const ev: BaseballEvent = {
      id: eid++,
      type: volumeLevel,
      startTime: Date.now(),
      duration: volumeLevel === "mega" ? 3800 : volumeLevel === "high" ? 3200 : 2600,
      ballX: pitcherX,
      ballY: pitcherY,
      batterX,
      batterY,
      phase: "pitch",
    }

    setEvents(prev => [...prev.slice(-2), ev])
    setAnnouncement(LEVEL_LABEL[volumeLevel])
    if (volumeLevel === "mega" || volumeLevel === "high") setShowCrowd(true)

    setTimeout(() => setAnnouncement(null), 2200)
    setTimeout(() => setShowCrowd(false), 3000)
    setTimeout(() => setEvents(prev => prev.filter(e => e.id !== ev.id)), ev.duration + 500)
  }, [volumeLevel])

  // 주기적 이벤트 트리거
  useEffect(() => {
    const interval: Record<VolumeLevel, number> = {
      mega: 3000, high: 4500, mid: 7000, low: 10000, tiny: 13000,
    }
    timerRef.current = setInterval(triggerPlay, interval[volumeLevel])
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [volumeLevel, triggerPlay])

  // 공 애니메이션
  useEffect(() => {
    if (events.length === 0) return
    const frame = requestAnimationFrame(() => {
      const now = Date.now()
      setEvents(prev => prev.map(ev => {
        const elapsed = now - ev.startTime
        const W = containerRef.current?.clientWidth ?? 700
        const H = containerRef.current?.clientHeight ?? 260
        const t = elapsed / ev.duration

        let bx = ev.ballX, by = ev.ballY, phase = ev.phase

        if (t < 0.35) {
          // 투구: 투수 → 타자
          phase = "pitch"
          const pt = t / 0.35
          bx = ev.batterX + (ev.ballX - ev.batterX) * (1 - pt)
          by = ev.batterY + (ev.ballY - ev.batterY) * (1 - pt)
        } else if (t < 0.45) {
          // 임팩트
          phase = "hit"
          bx = ev.batterX
          by = ev.batterY
        } else {
          // 타구 비행
          phase = "fly"
          const ft = (t - 0.45) / 0.55
          if (ev.type === "mega") {
            // 만루홈런: 크게 포물선
            bx = ev.batterX + ft * W * 0.7
            by = ev.batterY - Math.sin(ft * Math.PI) * H * 0.85
          } else if (ev.type === "high") {
            // 솔로홈런
            bx = ev.batterX + ft * W * 0.5
            by = ev.batterY - Math.sin(ft * Math.PI) * H * 0.65
          } else if (ev.type === "mid") {
            // 안타: 낮게 날아감
            bx = ev.batterX + ft * W * 0.35
            by = ev.batterY - Math.sin(ft * Math.PI) * H * 0.25
          } else if (ev.type === "low") {
            // 번트: 짧게
            bx = ev.batterX + ft * W * 0.12
            by = ev.batterY + ft * 8
          } else {
            // 삼진: 공이 포수 방향 (화면 왼쪽)
            bx = ev.batterX - ft * W * 0.15
            by = ev.batterY + Math.sin(ft * Math.PI) * 15
          }
        }

        return { ...ev, ballX: bx, ballY: by, phase }
      }))
    })
    return () => cancelAnimationFrame(frame)
  }, [events])

  // 야구장 배경 요소
  const foulLines = [
    { x1: "55%", y1: "55%", x2: "5%",  y2: "100%" },
    { x1: "55%", y1: "55%", x2: "95%", y2: "100%" },
  ]

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">

      {/* 야구장 배경 */}
      <div className="absolute inset-0 rounded-xl" style={{
        background: "linear-gradient(180deg, rgba(15,30,10,0.22) 0%, rgba(20,50,15,0.12) 60%, rgba(10,20,5,0.05) 100%)"
      }} />

      {/* 잔디 패턴 (줄무늬) */}
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="absolute bottom-0 left-0 right-0"
          style={{
            height: `${(i + 1) * 14}%`,
            background: i % 2 === 0
              ? "rgba(34,197,94,0.04)"
              : "rgba(22,163,74,0.03)",
            clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)",
          }}
        />
      ))}

      {/* 내야 다이아몬드 */}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.18 }}>
        {/* 파울라인 */}
        {foulLines.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="#f5f0e8" strokeWidth="1" strokeDasharray="4 3" />
        ))}
        {/* 다이아몬드 */}
        <polygon points="55%,30% 68%,50% 55%,65% 42%,50%"
          fill="none" stroke="#f5f0e8" strokeWidth="1.2" />
        {/* 베이스 */}
        <rect x="53%" y="28%" width="4%" height="3%" fill="#f5f0e8" rx="1" />
        <rect x="66%" y="48%" width="4%" height="3%" fill="#f5f0e8" rx="1" />
        <rect x="53%" y="63%" width="4%" height="3%" fill="#f5f0e8" rx="1" />
        <rect x="40%" y="48%" width="4%" height="3%" fill="#f5f0e8" rx="1" />
        {/* 마운드 */}
        <ellipse cx="55%" cy="48%" rx="2.5%" ry="1.5%" fill="#c8a96e" opacity="0.5" />
        {/* 타석 */}
        <rect x="52%" y="58%" width="6%" height="4%" fill="none"
          stroke="#f5f0e8" strokeWidth="0.8" rx="1" opacity="0.7" />
      </svg>

      {/* 조명 효과 (스타디움 라이트) */}
      {[10, 90].map((x, i) => (
        <div key={i} className="absolute top-0 pointer-events-none"
          style={{
            left: `${x}%`,
            width: "200px",
            height: "100%",
            background: `radial-gradient(ellipse 100px 60% at ${i === 0 ? "right" : "left"} top, rgba(255,200,50,0.06), transparent)`,
          }}
        />
      ))}

      {/* 투수 */}
      <div className="absolute" style={{
        left: "23%", bottom: "38%",
        transform: "translateX(-50%)",
      }}>
        <PitcherSVG phase={events[0]?.phase ?? "idle"} />
      </div>

      {/* 타자 */}
      <div className="absolute" style={{
        left: "54%", bottom: "30%",
        transform: "translateX(-50%)",
      }}>
        <BatterSVG phase={events[0]?.phase ?? "idle"} />
      </div>

      {/* 포수 (삼진 시) */}
      {events[0]?.type === "tiny" && (
        <div className="absolute" style={{ left: "62%", bottom: "28%", transform: "translateX(-50%)" }}>
          <CatcherSVG />
        </div>
      )}

      {/* 야구공 */}
      {events.map(ev => (
        <div key={ev.id} className="absolute"
          style={{
            left: ev.ballX,
            top: ev.ballY,
            transform: "translate(-50%, -50%)",
            filter: ev.phase === "fly" && (ev.type === "mega" || ev.type === "high")
              ? "drop-shadow(0 0 6px rgba(255,200,50,0.9))"
              : "none",
          }}
        >
          <BaseballSVG
            size={
              ev.type === "mega" ? 22 :
              ev.type === "high" ? 18 :
              ev.type === "mid"  ? 15 : 12
            }
          />
          {/* 타구 궤적 */}
          {ev.phase === "fly" && (
            <div className="absolute inset-0 rounded-full"
              style={{
                width: ev.type === "mega" ? 22 : 16,
                height: ev.type === "mega" ? 22 : 16,
                background: "rgba(255,200,50,0.15)",
                boxShadow: ev.type === "mega"
                  ? "0 0 20px 8px rgba(255,180,0,0.25)"
                  : "0 0 10px 4px rgba(255,200,50,0.15)",
              }}
            />
          )}
        </div>
      ))}

      {/* 관중 환호 (홈런/만루) */}
      {showCrowd && <CrowdEffect level={volumeLevel} />}

      {/* 타격 이벤트 안내판 */}
      {announcement && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <div
            className="px-5 py-2 rounded-full text-sm font-bold tracking-wide shadow-lg"
            style={{
              background: volumeLevel === "mega" ? "rgba(239,68,68,0.92)" :
                          volumeLevel === "high" ? "rgba(251,146,60,0.92)" :
                          volumeLevel === "mid"  ? "rgba(234,179,8,0.92)"  :
                          volumeLevel === "low"  ? "rgba(34,197,94,0.85)"  :
                                                   "rgba(100,116,139,0.85)",
              color: "white",
              animation: "popIn 0.25s ease-out",
              boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
            }}
          >
            {announcement}
          </div>
        </div>
      )}

      {/* 거래량 레벨 뱃지 */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-md"
        style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}>
        <div className="w-1.5 h-1.5 rounded-full"
          style={{
            background: volumeLevel === "mega" ? "#ef4444" :
                        volumeLevel === "high" ? "#f97316" :
                        volumeLevel === "mid"  ? "#eab308" :
                        volumeLevel === "low"  ? "#22c55e" : "#94a3b8"
          }}
        />
        <span className="text-[9px] text-white/70 font-medium tracking-wider uppercase">
          {LEVEL_LABEL[volumeLevel]}
        </span>
      </div>

      <style jsx>{`
        @keyframes confettiFall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(120px) rotate(360deg); opacity: 0; }
        }
        @keyframes popIn {
          0%   { transform: translateX(-50%) scale(0.6); opacity: 0; }
          100% { transform: translateX(-50%) scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  )
}
