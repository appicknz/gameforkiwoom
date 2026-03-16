"use client"

import useSWR from "swr"

const swrFetcher = (url: string) => fetch(url).then(r => r.json())

interface Card {
  suit: string
  label: string
}

interface CardCharacterDisplayProps {
  roundSeed: number
  card: Card | null
}

export function CardCharacterDisplay({ roundSeed, card }: CardCharacterDisplayProps) {
  const { data } = useSWR<{ images: Array<{ url: string; pathname: string }> }>(
    "/api/card-images",
    swrFetcher,
    { refreshInterval: 60000, revalidateOnFocus: false }
  )

  const images = data?.images ?? []
  const selectedImage = images.length > 0 ? images[roundSeed % images.length] : null
  const imgSrc = selectedImage?.url ?? "/images/baccarat-card-girl.jpg"

  const suitColor = "#ffffff"
  const label = card?.label ?? ""
  const suit  = card?.suit  ?? ""

  return (
    <div style={{
      position: "relative",
      borderRadius: 14,
      overflow: "hidden",
      border: "2px solid rgba(212,175,55,0.35)",
      boxShadow: "0 6px 32px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(212,175,55,0.1)",
      background: "#0d1a14",
      aspectRatio: "2/3",
      width: "100%",
    }}>
      {/* 캐릭터 이미지 */}
      <img
        src={imgSrc}
        alt="Baccarat card character"
        style={{ width: "100%", height: "100%", display: "block", objectFit: "cover", objectPosition: "top" }}
      />

      {/* 카드 정보 오버레이 */}
      {card && (
        <>
          {/* 좌상단 — 숫자 + 무늬 */}
          <div style={{
            position: "absolute", top: 10, left: 12,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
          }}>
            <span style={{ fontSize: 46, fontWeight: 900, lineHeight: 1, color: suitColor, fontFamily: "Georgia, serif" }}>
              {label}
            </span>
            <span style={{ fontSize: 38, lineHeight: 1, color: suitColor }}>
              {suit}
            </span>
          </div>

          {/* 우하단 — 180도 회전 */}
          <div style={{
            position: "absolute", bottom: 10, right: 12,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
            transform: "rotate(180deg)",
          }}>
            <span style={{ fontSize: 46, fontWeight: 900, lineHeight: 1, color: suitColor, fontFamily: "Georgia, serif" }}>
              {label}
            </span>
            <span style={{ fontSize: 38, lineHeight: 1, color: suitColor }}>
              {suit}
            </span>
          </div>
        </>
      )}

      {/* 카드 정보 없을 때: 대기 표시 */}
      {!card && (
        <div style={{
          position: "absolute", top: 10, left: 12,
          fontSize: 11, color: "rgba(212,175,55,0.5)", letterSpacing: "0.06em",
          fontStyle: "italic",
        }}>
          대기 중
        </div>
      )}

      {/* 금장 테두리 장식선 */}
      <div style={{
        position: "absolute", inset: 6,
        borderRadius: 10,
        border: "1px solid rgba(212,175,55,0.3)",
        pointerEvents: "none",
      }} />
    </div>
  )
}
