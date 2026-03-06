"use client"

import { useEffect, useRef, useState } from "react"

interface Creature {
  id: number
  type: "whale" | "shark" | "dolphin" | "fish" | "smallfish" | "shrimp" | "seahorse" | "clione" | "jellyfish" | "crab" | "tuna" | "puffer" | "tropical" | "ray" | "octopus"
  x: number
  y: number
  speed: number
  dir: 1 | -1
  scale: number
  opacity: number
  yDrift: number
  yPhase: number
}

const MAX_CREATURES = 6

// 1초당 거래대금 변화량(KRW 기준: USDT * 1350)
// 10억 원 = ~740,000 USDT/s
function getDeltaLevel(deltaUsdt: number): "mega" | "high" | "mid" | "low" | "tiny" {
  if (deltaUsdt >= 740_000)  return "mega"  // 10억원/s 이상 → 대형 고래
  if (deltaUsdt >= 220_000)  return "high"  // 3억원/s 이상
  if (deltaUsdt >= 74_000)   return "mid"   // 1억원/s 이상
  if (deltaUsdt >= 15_000)   return "low"   // 2천만원/s 이상
  return "tiny"
}

function pickCreatureType(level: "mega" | "high" | "mid" | "low" | "tiny"): Creature["type"] {
  const pools: Record<string, Creature["type"][]> = {
    mega:  ["whale", "whale", "shark", "dolphin"],
    high:  ["tuna", "dolphin", "shark", "ray"],
    mid:   ["fish", "tuna", "tropical", "clione", "octopus"],
    low:   ["smallfish", "tropical", "puffer", "jellyfish", "seahorse"],
    tiny:  ["shrimp", "crab", "jellyfish", "seahorse", "smallfish"],
  }
  const pool = pools[level]
  return pool[Math.floor(Math.random() * pool.length)]
}

function CreatureSVG({ type, dir }: { type: Creature["type"]; dir: 1 | -1 }) {
  const flip = dir === -1 ? "scale(-1,1)" : undefined

  switch (type) {
    case "whale":
      // 혹등고래 (Humpback Whale) 실측 비율 측면 실루엣
      return (
        <svg width="380" height="160" viewBox="0 0 380 160" style={{ transform: flip ? "scaleX(-1)" : undefined, display: "block" }}>
          <defs>
            <linearGradient id="wbody" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1a3a6e"/>
              <stop offset="55%" stopColor="#1e3f75"/>
              <stop offset="100%" stopColor="#4a85c0"/>
            </linearGradient>
            <linearGradient id="wbelly" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4a85c0" stopOpacity="0"/>
              <stop offset="100%" stopColor="#c8e6fa" stopOpacity="0.7"/>
            </linearGradient>
            <filter id="wglow">
              <feGaussianBlur stdDeviation="3" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* ── 주 동체: 혹등고래 특유의 등이 볼록하고 배가 길게 늘어진 실루엣 ── */}
          <path d="
            M340,72
            C330,55 310,44 285,40
            C260,36 230,38 200,40
            C170,42 140,46 110,52
            C80,58 55,65 38,72
            C24,78 16,84 14,90
            C18,100 26,106 40,108
            C60,112 90,110 120,106
            C150,102 180,96 210,92
            C240,88 268,86 292,86
            C314,86 330,88 342,92
            C350,88 354,82 350,76
            C348,74 344,72 340,72Z
          " fill="url(#wbody)"/>

          {/* ── 배 부분 크림/흰색 줄무늬 (혹등고래 특징) ── */}
          <path d="
            M40,108 C60,116 100,118 140,114
            C180,110 220,104 260,100
            C290,97 315,96 342,96
            C342,92 330,88 292,86
            C268,86 240,88 210,92
            C180,96 150,102 120,106
            C90,110 60,112 40,108Z
          " fill="url(#wbelly)"/>

          {/* 배 홈 줄무늬 (throat grooves) */}
          {[0,4,8,12,16].map((offset,i) => (
            <path key={i}
              d={`M${60+offset*3},106 C${120+offset*2},112 ${200+offset},108 ${300+offset*0.5},96`}
              stroke="#7db8e8" strokeWidth="0.6" fill="none" opacity={0.25 - i*0.04}
              strokeLinecap="round"/>
          ))}

          {/* ── 꼬리 (Fluke): 혹등고래 꼬리는 넓고 중앙에 깊은 노치 ── */}
          {/* 위쪽 플루크 */}
          <path d="
            M38,80 C28,68 10,54 4,42
            C2,36 6,32 12,36
            C20,42 30,56 38,72Z
          " fill="#17304f"/>
          {/* 아래쪽 플루크 */}
          <path d="
            M38,100 C28,112 10,126 4,136
            C2,142 6,144 12,140
            C20,134 30,120 38,108Z
          " fill="#17304f"/>
          {/* 플루크 중앙 노치 */}
          <path d="M38,80 C32,86 30,90 32,90 C30,90 28,94 32,100 C34,102 36,104 38,100" fill="#132840"/>
          {/* 플루크 흰 무늬 (혹등 특징) */}
          <path d="M10,42 C18,50 28,62 36,75" stroke="#c8e6fa" strokeWidth="1.5" fill="none" opacity="0.4" strokeLinecap="round"/>
          <path d="M10,136 C18,128 28,116 36,103" stroke="#c8e6fa" strokeWidth="1.5" fill="none" opacity="0.4" strokeLinecap="round"/>

          {/* ── 등지느러미 (Dorsal fin): 혹등고래는 작고 혹처럼 생긴 등지느러미 ── */}
          <path d="
            M180,40 C186,28 196,22 206,26
            C212,30 214,36 210,40
            C202,40 192,40 180,40Z
          " fill="#16305a"/>

          {/* 등 혹 (hump, 혹등고래 이름의 유래) */}
          <path d="M155,42 C162,38 172,38 180,40 C188,42 190,44 185,45 C175,46 160,45 155,42Z"
            fill="#162d56" opacity="0.7"/>

          {/* ── 가슴지느러미 (Pectoral fin): 혹등고래 특징 — 매우 길고 흰 무늬 ── */}
          <path d="
            M230,68 C240,52 256,36 270,28
            C278,24 284,26 282,34
            C278,44 264,58 248,70
            C242,74 234,74 230,68Z
          " fill="#163060"/>
          {/* 가슴지느러미 흰 선 무늬 */}
          <path d="M234,68 C244,54 258,40 270,32" stroke="#7db8e8" strokeWidth="1.2" fill="none" opacity="0.45" strokeLinecap="round"/>
          <path d="M240,70 C250,57 262,44 272,36" stroke="#7db8e8" strokeWidth="0.8" fill="none" opacity="0.3" strokeLinecap="round"/>

          {/* ── 눈 ── */}
          <circle cx="308" cy="62" r="6" fill="#0f2040"/>
          <circle cx="308" cy="62" r="4.5" fill="#1a1a2e"/>
          <circle cx="310" cy="60" r="1.8" fill="white" opacity="0.9"/>

          {/* ── 입 주름선 ── */}
          <path d="M318,74 C328,80 336,84 340,88" stroke="#2a5080" strokeWidth="1.5" fill="none" opacity="0.6" strokeLinecap="round"/>
          <path d="M320,78 C330,83 337,87 340,90" stroke="#2a5080" strokeWidth="1" fill="none" opacity="0.4" strokeLinecap="round"/>

          {/* ── 따개비 (barnacles) ── */}
          {[[190,44],[200,42],[175,44],[210,43],[165,46]].map(([x,y],i)=>(
            <circle key={i} cx={x} cy={y} r={1.5+i*0.3} fill="#2a5c8a" opacity="0.55"/>
          ))}

          {/* ── 분수공 물줄기 ── */}
          <path d="M312,44 Q316,24 322,10 Q326,4 330,10 Q334,22 330,38"
            stroke="#bae6fd" strokeWidth="4" fill="none" opacity="0.6" strokeLinecap="round"/>
          <path d="M322,10 Q328,2 334,8" stroke="#e0f2fe" strokeWidth="2.5" fill="none" opacity="0.45" strokeLinecap="round"/>
          <path d="M316,38 Q312,26 314,18" stroke="#7dd3fc" strokeWidth="2" fill="none" opacity="0.35" strokeLinecap="round"/>
          {/* 물방울 */}
          {[[326,6],[320,8],[332,12],[318,16]].map(([x,y],i)=>(
            <circle key={i} cx={x} cy={y} r={1.5-i*0.2} fill="#bae6fd" opacity={0.7-i*0.1}/>
          ))}
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
    case "clione":
      // 클리오네 (바다천사) — 반투명 날개와 긴 몸통
      return (
        <svg width="32" height="52" viewBox="0 0 32 52" transform={flip}>
          {/* 몸통 */}
          <ellipse cx="16" cy="32" rx="7" ry="16" fill="#ff9ecb" opacity="0.75"/>
          <ellipse cx="16" cy="30" rx="4.5" ry="12" fill="#ffcce8" opacity="0.45"/>
          {/* 머리 */}
          <circle cx="16" cy="14" r="8" fill="#ff9ecb" opacity="0.8"/>
          <circle cx="16" cy="13" r="5" fill="#ffd6ec" opacity="0.5"/>
          {/* 날개 (왼) */}
          <path d="M9 26 Q1 18 3 28 Q1 36 9 30 Z" fill="#ff9ecb" opacity="0.55"/>
          {/* 날개 (오) */}
          <path d="M23 26 Q31 18 29 28 Q31 36 23 30 Z" fill="#ff9ecb" opacity="0.55"/>
          {/* 꼬리 끝 */}
          <path d="M13 48 Q16 54 19 48" stroke="#ff9ecb" strokeWidth="2" fill="none" strokeLinecap="round"/>
          {/* 눈 */}
          <circle cx="13" cy="12" r="1.8" fill="#c2185b"/>
          <circle cx="19" cy="12" r="1.8" fill="#c2185b"/>
          {/* 내부 발광 */}
          <ellipse cx="16" cy="28" rx="3" ry="7" fill="#ff6fb0" opacity="0.3"/>
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
    case "tuna":
      return (
        <svg width="62" height="28" viewBox="0 0 62 28" transform={flip}>
          <ellipse cx="30" cy="14" rx="26" ry="10" fill="#1d4ed8" opacity="0.85"/>
          <ellipse cx="30" cy="16" rx="18" ry="6" fill="#60a5fa" opacity="0.5"/>
          {/* 초승달 꼬리 */}
          <path d="M4 14 Q0 6 10 10 Q5 14 10 18 Q0 22 4 14Z" fill="#1d4ed8"/>
          {/* 등지느러미 삼각 */}
          <path d="M28 4 Q36 0 42 8 Q36 6 28 4Z" fill="#2563eb" opacity="0.9"/>
          {/* 옆줄 */}
          <path d="M12 13 Q26 11 44 13" stroke="#93c5fd" strokeWidth="0.8" fill="none" opacity="0.6"/>
          <circle cx="46" cy="12" r="2.5" fill="white"/>
          <circle cx="47" cy="12" r="1.2" fill="#1a1a2e"/>
        </svg>
      )
    case "puffer":
      return (
        <svg width="44" height="40" viewBox="0 0 44 40" transform={flip}>
          {/* 둥근 몸 */}
          <circle cx="22" cy="22" r="17" fill="#fbbf24" opacity="0.85"/>
          <circle cx="22" cy="22" r="12" fill="#fde68a" opacity="0.5"/>
          {/* 가시들 */}
          {[30,60,90,120,150,210,240,270,300,330].map((deg, i) => (
            <line key={i}
              x1={22 + Math.cos(deg*Math.PI/180)*17}
              y1={22 + Math.sin(deg*Math.PI/180)*17}
              x2={22 + Math.cos(deg*Math.PI/180)*22}
              y2={22 + Math.sin(deg*Math.PI/180)*22}
              stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
          ))}
          {/* 꼬리 */}
          <path d="M5 22 Q0 16 8 19 Q4 22 8 25 Q0 28 5 22Z" fill="#fbbf24"/>
          {/* 눈 */}
          <circle cx="32" cy="18" r="4" fill="white"/>
          <circle cx="33" cy="18" r="2" fill="#1a1a2e"/>
          <circle cx="34" cy="17" r="0.8" fill="white"/>
          {/* 입 */}
          <path d="M36 23 Q38 25 36 26" stroke="#92400e" strokeWidth="1.2" fill="none"/>
        </svg>
      )
    case "tropical":
      return (
        <svg width="50" height="36" viewBox="0 0 50 36" transform={flip}>
          {/* 몸 */}
          <ellipse cx="25" cy="18" rx="20" ry="14" fill="#ec4899" opacity="0.85"/>
          {/* 세로줄 무늬 */}
          <path d="M20 5 Q20 31 20 31" stroke="#be185d" strokeWidth="3" opacity="0.5"/>
          <path d="M28 5 Q28 31 28 31" stroke="#be185d" strokeWidth="2" opacity="0.4"/>
          {/* 꼬리 */}
          <path d="M5 18 Q0 8 12 13 Q6 18 12 23 Q0 28 5 18Z" fill="#ec4899"/>
          {/* 등지느러미 */}
          <path d="M22 4 Q30 0 36 8 Q30 6 22 4Z" fill="#f472b6" opacity="0.8"/>
          {/* 배지느러미 */}
          <path d="M22 32 Q28 36 32 30 Q28 30 22 32Z" fill="#f472b6" opacity="0.7"/>
          <circle cx="38" cy="15" r="3" fill="white"/>
          <circle cx="39" cy="15" r="1.5" fill="#1a1a2e"/>
        </svg>
      )
    case "ray":
      return (
        <svg width="80" height="50" viewBox="0 0 80 50" transform={flip}>
          {/* 마름모 몸체 */}
          <path d="M70 25 L40 5 L10 25 L40 45 Z" fill="#6366f1" opacity="0.8"/>
          <path d="M70 25 L40 12 L10 25 L40 38 Z" fill="#818cf8" opacity="0.4"/>
          {/* 꼬리 — 길고 얇은 채찍 */}
          <path d="M10 25 Q0 22 -10 28" stroke="#6366f1" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          {/* 눈 두 개 */}
          <circle cx="55" cy="21" r="2.5" fill="white"/>
          <circle cx="55.5" cy="21" r="1.2" fill="#1a1a2e"/>
          <circle cx="55" cy="29" r="2.5" fill="white"/>
          <circle cx="55.5" cy="29" r="1.2" fill="#1a1a2e"/>
          {/* 아가미 선 */}
          <path d="M48 22 Q50 25 48 28" stroke="#4f46e5" strokeWidth="1" fill="none" opacity="0.7"/>
          <path d="M52 22 Q54 25 52 28" stroke="#4f46e5" strokeWidth="1" fill="none" opacity="0.7"/>
        </svg>
      )
    case "octopus":
      return (
        <svg width="52" height="60" viewBox="0 0 52 60" transform={flip}>
          {/* 머리 */}
          <ellipse cx="26" cy="18" rx="18" ry="16" fill="#7c3aed" opacity="0.85"/>
          <ellipse cx="26" cy="16" rx="13" ry="10" fill="#a78bfa" opacity="0.4"/>
          {/* 다리 8개 */}
          {[-3,-1.5,0,1.5,3,4.5,6,7.5].map((offset, i) => (
            <path key={i}
              d={`M${14 + i*3.5} 32 Q${12+i*3.5+offset} 44 ${13+i*3.5} 56`}
              stroke="#7c3aed" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity="0.8"/>
          ))}
          {/* 눈 두 개 */}
          <circle cx="20" cy="14" r="4" fill="white"/>
          <circle cx="20.5" cy="14" r="2" fill="#1a1a2e"/>
          <circle cx="22" cy="12.5" r="0.8" fill="white"/>
          <circle cx="32" cy="14" r="4" fill="white"/>
          <circle cx="32.5" cy="14" r="2" fill="#1a1a2e"/>
          <circle cx="34" cy="12.5" r="0.8" fill="white"/>
        </svg>
      )
    default:
      return null
  }
}

let creatureId = 0

export function AquariumOverlay() {
  const [creatures, setCreatures] = useState<Creature[]>([])
  const [volumeLevel, setVolumeLevel] = useState<"mega" | "high" | "mid" | "low" | "tiny">("tiny")
  const animFrameRef = useRef<number>(0)
  const lastSpawnRef = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevVolRef = useRef<number>(0)
  const prevTimeRef = useRef<number>(Date.now())

  // 1초당 거래대금 변화량으로 레벨 결정
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof window === "undefined") return
      const data = (window as any).__tickerData
      if (!data?.quoteAssetVolume) return
      const now = Date.now()
      const elapsedSec = (now - prevTimeRef.current) / 1000
      const deltaUsdt = elapsedSec > 0
        ? Math.abs(data.quoteAssetVolume - prevVolRef.current) / elapsedSec
        : 0
      prevVolRef.current = data.quoteAssetVolume
      prevTimeRef.current = now
      if (deltaUsdt > 0) setVolumeLevel(getDeltaLevel(deltaUsdt))
    }, 1500)
    return () => clearInterval(id)
  }, [])

  // 애니메이션 루프
  useEffect(() => {
    const W = containerRef.current?.clientWidth ?? 800
    const H = containerRef.current?.clientHeight ?? 280

    const spawnInterval: Record<string, number> = {
      mega: 1200, high: 2000, mid: 3500, low: 5500, tiny: 7000,
    }

    const loop = (ts: number) => {
      // 생성 — 최대 6마리 고정
      if (ts - lastSpawnRef.current > spawnInterval[volumeLevel]) {
        lastSpawnRef.current = ts
        setCreatures(prev => {
          if (prev.length >= MAX_CREATURES) return prev
          const dir: 1 | -1 = Math.random() > 0.5 ? 1 : -1
          const type = pickCreatureType(volumeLevel)
          const sizeMap: Record<Creature["type"], number> = {
            whale: volumeLevel === "mega" ? 1.8 : 1.0,
            shark: 0.85, dolphin: 0.75, clione: 0.75,
            fish: 0.6, smallfish: 0.5, shrimp: 0.45, seahorse: 0.4,
            jellyfish: 0.5, crab: 0.45,
            tuna: 0.7, puffer: 0.55, tropical: 0.65, ray: 0.8, octopus: 0.6,
          }
          const speedMap: Record<Creature["type"], number> = {
            whale: 0.3, shark: 0.7, dolphin: 0.65, clione: 0.18,
            fish: 0.55, smallfish: 0.5, shrimp: 0.3, seahorse: 0.15,
            jellyfish: 0.1, crab: 0.25,
            tuna: 0.75, puffer: 0.3, tropical: 0.5, ray: 0.6, octopus: 0.25,
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

      {/* 산호초 */}
      <svg className="absolute bottom-0 left-0 w-full" height="80" viewBox="0 0 1000 80" preserveAspectRatio="xMidYMax meet" style={{ opacity: 0.9, pointerEvents: "none" }}>
        <defs>
          <radialGradient id="cg1" cx="50%" cy="80%" r="60%"><stop offset="0%" stopColor="#fde68a"/><stop offset="100%" stopColor="#f59e0b" stopOpacity="0"/></radialGradient>
        </defs>
        {/* 모래 바닥 */}
        <ellipse cx="500" cy="82" rx="520" ry="12" fill="rgba(251,191,36,0.1)"/>

        {/* ─ 분홍 가지산호 (대) ─ */}
        <g transform="translate(28,80)">
          <line x1="0" y1="0" x2="-2" y2="-52" stroke="#ec4899" strokeWidth="3.5" strokeLinecap="round"/>
          <line x1="-2" y1="-26" x2="-16" y2="-46" stroke="#ec4899" strokeWidth="2.8" strokeLinecap="round"/>
          <line x1="-2" y1="-26" x2="14" y2="-50" stroke="#ec4899" strokeWidth="2.8" strokeLinecap="round"/>
          <line x1="-2" y1="-40" x2="-12" y2="-58" stroke="#ec4899" strokeWidth="2.2" strokeLinecap="round"/>
          <line x1="-16" y1="-46" x2="-26" y2="-60" stroke="#ec4899" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="14" y1="-50" x2="24" y2="-64" stroke="#ec4899" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="-12" y1="-58" x2="-20" y2="-68" stroke="#ec4899" strokeWidth="1.4" strokeLinecap="round"/>
          {[[0,-52],[-16,-46],[14,-50],[-12,-58],[-26,-60],[24,-64],[-20,-68]].map(([x,y],i)=>(
            <circle key={i} cx={x} cy={y} r={3-i*0.2} fill="#fda4af"/>
          ))}
        </g>

        {/* ─ 해초 (왼쪽) ─ */}
        <g transform="translate(62,80)">
          <path d="M0,0 C-4,-12 4,-20 0,-30 C-4,-40 4,-50 2,-60" stroke="#15803d" strokeWidth="3" fill="none" strokeLinecap="round"/>
          <path d="M0,-18 C-10,-22 -12,-16 -8,-12" stroke="#16a34a" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <path d="M0,-36 C8,-40 10,-34 6,-30" stroke="#16a34a" strokeWidth="2" fill="none" strokeLinecap="round"/>
        </g>
        <g transform="translate(78,80)">
          <path d="M0,0 C5,-10 -3,-18 2,-28 C6,-38 -2,-46 1,-56" stroke="#166534" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <path d="M2,-22 C10,-26 11,-19 7,-16" stroke="#15803d" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
        </g>

        {/* ─ 버섯산호 (오렌지) ─ */}
        <g transform="translate(110,80)">
          <rect x="-5" y="-32" width="10" height="32" rx="4" fill="#ea580c" opacity="0.9"/>
          <ellipse cx="0" cy="-32" rx="22" ry="12" fill="#fb923c" opacity="0.92"/>
          <ellipse cx="0" cy="-32" rx="17" ry="8" fill="#fed7aa" opacity="0.65"/>
          <path d="M-22,-32 Q-10,-42 0,-38 Q10,-42 22,-32" stroke="#ea580c" strokeWidth="1" fill="none" opacity="0.5"/>
        </g>

        {/* ─ 뇌산호 (보라) ─ */}
        <g transform="translate(168,80)">
          <ellipse cx="0" cy="-26" rx="26" ry="22" fill="#7c3aed" opacity="0.82"/>
          <ellipse cx="0" cy="-26" rx="21" ry="17" fill="#a78bfa" opacity="0.45"/>
          <path d="M-18,-26 Q-10,-38 0,-32 Q10,-38 18,-26 Q10,-14 0,-20 Q-10,-14 -18,-26Z" stroke="#5b21b6" strokeWidth="1.4" fill="none" opacity="0.75"/>
          <path d="M-12,-22 Q-5,-32 4,-28 Q10,-22 6,-14" stroke="#5b21b6" strokeWidth="0.9" fill="none" opacity="0.5"/>
          <path d="M-6,-28 Q0,-36 6,-30 Q4,-22 -2,-24" stroke="#5b21b6" strokeWidth="0.9" fill="none" opacity="0.5"/>
          <rect x="-3.5" y="-4" width="7" height="4" rx="2.5" fill="#7c3aed"/>
        </g>

        {/* ─ 빨간 가지산호 (대형) ─ */}
        <g transform="translate(228,80)">
          <line x1="0" y1="0" x2="0" y2="-56" stroke="#dc2626" strokeWidth="3.2" strokeLinecap="round"/>
          <line x1="0" y1="-20" x2="-18" y2="-40" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="0" y1="-20" x2="20" y2="-44" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="0" y1="-38" x2="-14" y2="-58" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/>
          <line x1="0" y1="-38" x2="14" y2="-62" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/>
          <line x1="-18" y1="-40" x2="-28" y2="-56" stroke="#dc2626" strokeWidth="1.6" strokeLinecap="round"/>
          <line x1="20" y1="-44" x2="30" y2="-60" stroke="#dc2626" strokeWidth="1.6" strokeLinecap="round"/>
          <line x1="-14" y1="-58" x2="-22" y2="-70" stroke="#dc2626" strokeWidth="1.3" strokeLinecap="round"/>
          <line x1="14" y1="-62" x2="20" y2="-72" stroke="#dc2626" strokeWidth="1.3" strokeLinecap="round"/>
          {[[-28,-56],[0,-56],[-14,-58],[14,-62],[30,-60],[-22,-70],[20,-72],[-18,-40],[20,-44]].map(([x,y],i)=>(
            <circle key={i} cx={x} cy={y} r={2.8-i*0.2} fill="#fca5a5"/>
          ))}
        </g>

        {/* ─ 관산호 군집 1 (큰 것) ─ */}
        <g transform="translate(310,80)">
          {[0,10,19,29,38,46].map((x, i) => {
            const h = 24+i*6
            const colors = ["#22d3ee","#34d399","#60a5fa","#a78bfa","#f472b6","#fb923c"]
            const tops   = ["#67e8f9","#6ee7b7","#93c5fd","#c4b5fd","#f9a8d4","#fdba74"]
            return (
              <g key={i}>
                <rect x={x-3.5} y={-h} width="7" height={h} rx="3.5" fill={colors[i]} opacity="0.88"/>
                <circle cx={x} cy={-h} r={5} fill={tops[i]}/>
                <circle cx={x} cy={-h} r={3} fill="white" opacity="0.3"/>
              </g>
            )
          })}
        </g>

        {/* ─ 노란 버섯산호 ─ */}
        <g transform="translate(400,80)">
          <rect x="-4" y="-26" width="8" height="26" rx="3.5" fill="#ca8a04" opacity="0.9"/>
          <ellipse cx="0" cy="-26" rx="20" ry="11" fill="#fde047" opacity="0.9"/>
          <ellipse cx="0" cy="-26" rx="15" ry="7" fill="#fef9c3" opacity="0.6"/>
          <path d="M-20,-26 Q-8,-36 0,-32 Q8,-36 20,-26" stroke="#ca8a04" strokeWidth="0.9" fill="none" opacity="0.5"/>
        </g>

        {/* ─ 초록 가지산호 ─ */}
        <g transform="translate(444,80)">
          <line x1="0" y1="0" x2="1" y2="-50" stroke="#059669" strokeWidth="3.2" strokeLinecap="round"/>
          <line x1="1" y1="-22" x2="-14" y2="-40" stroke="#059669" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="1" y1="-22" x2="17" y2="-44" stroke="#059669" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="1" y1="-38" x2="-10" y2="-56" stroke="#059669" strokeWidth="2" strokeLinecap="round"/>
          <line x1="-14" y1="-40" x2="-22" y2="-54" stroke="#059669" strokeWidth="1.7" strokeLinecap="round"/>
          <line x1="17" y1="-44" x2="26" y2="-60" stroke="#059669" strokeWidth="1.7" strokeLinecap="round"/>
          {[[-22,-54],[1,-50],[-10,-56],[17,-44],[26,-60],[-14,-40]].map(([x,y],i)=>(
            <circle key={i} cx={x} cy={y} r={2.8-i*0.2} fill="#6ee7b7"/>
          ))}
        </g>

        {/* ─ 해초 (중앙) ─ */}
        <g transform="translate(494,80)">
          <path d="M0,0 C-5,-14 5,-22 0,-34 C-5,-46 5,-56 1,-66" stroke="#166534" strokeWidth="3.2" fill="none" strokeLinecap="round"/>
          <path d="M0,-20 C-12,-25 -14,-17 -9,-13" stroke="#15803d" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
          <path d="M1,-42 C10,-47 12,-39 7,-35" stroke="#15803d" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
          <path d="M0,-56 C-8,-62 -10,-54 -6,-50" stroke="#166534" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
        </g>
        <g transform="translate(510,80)">
          <path d="M0,0 C4,-12 -4,-20 2,-30 C6,-40 -3,-50 0,-60" stroke="#15803d" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
          <path d="M2,-28 C10,-32 11,-25 7,-22" stroke="#16a34a" strokeWidth="2" fill="none" strokeLinecap="round"/>
        </g>

        {/* ─ 파란 뇌산호 ─ */}
        <g transform="translate(554,80)">
          <ellipse cx="0" cy="-22" rx="22" ry="18" fill="#0284c7" opacity="0.78"/>
          <ellipse cx="0" cy="-22" rx="17" ry="13" fill="#38bdf8" opacity="0.4"/>
          <path d="M-15,-22 Q-8,-34 0,-28 Q8,-34 15,-22 Q8,-10 0,-16 Q-8,-10 -15,-22Z" stroke="#0369a1" strokeWidth="1.3" fill="none" opacity="0.8"/>
          <path d="M-8,-18 Q-2,-28 5,-24 Q8,-16 3,-10" stroke="#0369a1" strokeWidth="0.9" fill="none" opacity="0.55"/>
          <rect x="-3" y="-4" width="6" height="4" rx="2" fill="#0284c7"/>
        </g>

        {/* ─ 관산호 군집 2 (혼합색) ─ */}
        <g transform="translate(618,80)">
          {[0,10,18,27,35].map((x, i) => {
            const h = 18+i*7
            const colors = ["#f472b6","#fb923c","#facc15","#34d399","#818cf8"]
            const tops   = ["#fda4af","#fdba74","#fef08a","#6ee7b7","#a5b4fc"]
            return (
              <g key={i}>
                <rect x={x-3} y={-h} width="6" height={h} rx="3" fill={colors[i]} opacity="0.85"/>
                <circle cx={x} cy={-h} r={4.5} fill={tops[i]}/>
                <circle cx={x} cy={-h} r={2.5} fill="white" opacity="0.25"/>
              </g>
            )
          })}
        </g>

        {/* ─ 보라 가지산호 ─ */}
        <g transform="translate(700,80)">
          <line x1="0" y1="0" x2="-1" y2="-54" stroke="#7c3aed" strokeWidth="3.2" strokeLinecap="round"/>
          <line x1="-1" y1="-24" x2="-17" y2="-44" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="-1" y1="-24" x2="16" y2="-46" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="-1" y1="-40" x2="-11" y2="-58" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round"/>
          <line x1="-17" y1="-44" x2="-25" y2="-60" stroke="#7c3aed" strokeWidth="1.7" strokeLinecap="round"/>
          <line x1="16" y1="-46" x2="24" y2="-62" stroke="#7c3aed" strokeWidth="1.7" strokeLinecap="round"/>
          {[[-25,-60],[-17,-44],[-1,-54],[-11,-58],[16,-46],[24,-62]].map(([x,y],i)=>(
            <circle key={i} cx={x} cy={y} r={3-i*0.2} fill="#c4b5fd"/>
          ))}
        </g>

        {/* ─ 해초 (오른쪽) ─ */}
        <g transform="translate(748,80)">
          <path d="M0,0 C-4,-12 4,-22 -1,-34 C-5,-46 3,-55 0,-64" stroke="#15803d" strokeWidth="3" fill="none" strokeLinecap="round"/>
          <path d="M-1,-30 C-12,-35 -13,-27 -8,-24" stroke="#16a34a" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <path d="M0,-46 C8,-52 10,-44 6,-40" stroke="#16a34a" strokeWidth="2" fill="none" strokeLinecap="round"/>
        </g>

        {/* ─ 오렌지 버섯산호 (대형) ─ */}
        <g transform="translate(795,80)">
          <rect x="-5" y="-30" width="10" height="30" rx="4" fill="#c2410c" opacity="0.9"/>
          <ellipse cx="0" cy="-30" rx="25" ry="13" fill="#f97316" opacity="0.92"/>
          <ellipse cx="0" cy="-30" rx="19" ry="9" fill="#fed7aa" opacity="0.6"/>
          <path d="M-25,-30 Q-10,-44 0,-40 Q10,-44 25,-30" stroke="#c2410c" strokeWidth="1" fill="none" opacity="0.5"/>
        </g>

        {/* ─ 청록 가지산호 ─ */}
        <g transform="translate(852,80)">
          <line x1="0" y1="0" x2="2" y2="-46" stroke="#0891b2" strokeWidth="3" strokeLinecap="round"/>
          <line x1="2" y1="-20" x2="-12" y2="-36" stroke="#0891b2" strokeWidth="2.3" strokeLinecap="round"/>
          <line x1="2" y1="-20" x2="16" y2="-38" stroke="#0891b2" strokeWidth="2.3" strokeLinecap="round"/>
          <line x1="2" y1="-34" x2="-8" y2="-50" stroke="#0891b2" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="16" y1="-38" x2="22" y2="-52" stroke="#0891b2" strokeWidth="1.5" strokeLinecap="round"/>
          {[[-12,-36],[2,-46],[16,-38],[-8,-50],[22,-52]].map(([x,y],i)=>(
            <circle key={i} cx={x} cy={y} r="2.8" fill="#67e8f9"/>
          ))}
        </g>

        {/* ─ 뇌산호 (분홍, 오른쪽) ─ */}
        <g transform="translate(924,80)">
          <ellipse cx="0" cy="-20" rx="20" ry="16" fill="#db2777" opacity="0.75"/>
          <ellipse cx="0" cy="-20" rx="15" ry="11" fill="#f9a8d4" opacity="0.4"/>
          <path d="M-13,-20 Q-6,-30 0,-26 Q6,-30 13,-20 Q6,-10 0,-14 Q-6,-10 -13,-20Z" stroke="#9d174d" strokeWidth="1.2" fill="none" opacity="0.75"/>
          <rect x="-3" y="-4" width="6" height="4" rx="2" fill="#db2777"/>
        </g>

        {/* ─ 관산호 소군집 (맨 오른쪽) ─ */}
        <g transform="translate(968,80)">
          {[0,9,17].map((x, i) => {
            const h = 16+i*8
            const colors = ["#22d3ee","#f472b6","#a78bfa"]
            const tops   = ["#67e8f9","#f9a8d4","#c4b5fd"]
            return (
              <g key={i}>
                <rect x={x-3} y={-h} width="6" height={h} rx="3" fill={colors[i]} opacity="0.85"/>
                <circle cx={x} cy={-h} r="4" fill={tops[i]}/>
              </g>
            )
          })}
        </g>
      </svg>

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
          mega: "고래 출현 (10억+/s)",
          high: "돌고래 떼 (3억+/s)",
          mid:  "물고기 (1억+/s)",
          low:  "새우·해마 (2천만+/s)",
          tiny: "조용한 수족관",
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
