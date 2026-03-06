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
      // 유저 제공 원본 SVG — viewBox 0 0 7908 2987, y축 반전 transform 포함
      return (
        <svg
          width="420" height="160"
          viewBox="0 0 7908 2987"
          style={{ transform: flip ? "scaleX(-1)" : undefined, display: "block" }}
          preserveAspectRatio="xMidYMid meet"
        >
          <g transform="translate(0,2987) scale(0.1,-0.1)" fill="#1a4480" stroke="none">
            <path d="M75660 29409 c-473 -64 -793 -120 -1172 -205 -2167 -484 -4351 -1606 -6172 -3170 -216 -185 -359 -317 -761 -699 -566 -538 -715 -673 -1015 -924 -436 -365 -884 -672 -1241 -852 l-104 -52 -170 12 c-1763 122 -3487 167 -5444 143 -1898 -24 -2876 -57 -6746 -227 -4188 -184 -7438 -191 -10725 -25 -670 34 -1843 108 -2030 128 l-65 7 -3 152 c-4 227 19 308 118 416 77 84 134 122 343 225 217 106 259 133 340 211 83 80 79 91 -43 140 -165 65 -330 91 -630 98 -275 7 -360 1 -1195 -72 -1332 -118 -1714 -167 -2745 -355 -179 -32 -337 -61 -352 -64 -15 -2 -63 -12 -105 -20 -43 -9 -89 -18 -103 -20 -14 -2 -144 -27 -290 -55 -257 -48 -401 -74 -544 -96 -21 -4 -48 -8 -60 -11 -37 -7 -1470 181 -2491 327 -1325 189 -1976 292 -4365 689 -3254 541 -4444 728 -5955 934 -3950 540 -7095 716 -10005 561 -1910 -102 -3684 -350 -5510 -771 -179 -41 -360 -84 -403 -95 l-78 -20 -32 27 c-55 47 -105 64 -188 64 -140 0 -237 -49 -260 -132 -6 -23 -8 -49 -6 -59 6 -22 38 -11 -363 -120 -253 -68 -759 -213 -921 -264 -65 -20 -83 -22 -115 -13 -22 6 -74 8 -117 5 -98 -7 -173 -41 -209 -95 -23 -33 -34 -40 -124 -66 -163 -49 -440 -140 -590 -195 -119 -43 -145 -50 -168 -41 -67 25 -195 -1 -259 -52 -15 -13 -34 -41 -41 -63 -13 -37 -22 -44 -138 -103 -246 -126 -430 -248 -598 -394 -52 -46 -116 -96 -141 -110 -64 -38 -117 -99 -124 -145 -3 -21 -13 -51 -22 -68 -133 -245 -189 -393 -219 -575 -16 -99 -19 -107 -52 -134 -43 -37 -62 -81 -62 -146 0 -68 19 -108 72 -155 40 -35 47 -49 63 -115 24 -100 68 -227 105 -309 l31 -66 150 -59 c335 -131 704 -230 1176 -315 385 -70 730 -114 1528 -196 775 -79 1042 -115 1970 -265 242 -39 584 -93 760 -121 1138 -177 1796 -319 2395 -519 599 -199 947 -398 1287 -737 165 -165 262 -280 449 -538 305 -420 490 -624 854 -946 91 -80 275 -249 410 -375 652 -610 942 -844 1314 -1063 352 -207 979 -442 1621 -606 694 -178 1234 -263 2845 -450 267 -31 616 -75 775 -96 380 -53 403 -56 439 -64 12 -3 37 -7 56 -9 248 -28 1105 -191 1750 -331 92 -20 165 -36 192 -40 17 -3 34 -7 37 -9 3 -2 24 -7 46 -10 22 -4 56 -11 75 -16 19 -5 46 -11 60 -14 67 -13 1408 -309 1625 -359 l100 -23 -120 -8 c-217 -13 -416 -52 -606 -117 -103 -35 -254 -105 -316 -145 -93 -61 -185 -159 -224 -239 -32 -65 -34 -76 -33 -165 0 -67 5 -107 17 -134 10 -22 16 -40 14 -42 -1 -2 -31 6 -66 17 -35 10 -67 17 -70 14 -3 -4 -6 -31 -6 -62 l0 -56 117 -36 117 -36 62 -75 c34 -41 146 -160 248 -265 103 -104 216 -228 251 -275 64 -83 214 -300 208 -300 -2 0 -181 58 -398 129 -217 71 -396 128 -398 126 -7 -6 57 -140 70 -147 13 -8 813 -268 823 -268 14 0 284 -498 337 -621 7 -19 -4 -16 -562 156 -184 57 -336 103 -337 102 -1 -1 8 -31 19 -66 17 -53 26 -65 52 -76 17 -7 227 -73 468 -146 l436 -132 38 -86 c20 -47 57 -131 81 -186 61 -138 82 -195 73 -195 -43 0 -591 121 -839 185 -74 19 -136 33 -139 31 -6 -6 18 -115 27 -120 30 -19 743 -171 924 -197 l85 -13 38 -95 c20 -53 52 -127 70 -166 18 -38 91 -214 162 -390 148 -364 201 -486 589 -1360 305 -684 396 -885 562 -1239 60 -127 137 -294 170 -371 64 -145 189 -377 296 -550 34 -55 120 -199 192 -320 310 -523 650 -991 1038 -1430 l125 -141 177 -101 c226 -129 405 -225 409 -220 2 2 -4 13 -13 24 -10 11 -43 48 -73 83 -30 34 -60 68 -66 74 -17 19 -197 240 -224 276 -14 18 -36 47 -49 63 -24 28 -220 289 -336 447 -105 143 -374 541 -464 686 -34 54 -66 106 -71 114 -5 8 -46 76 -91 150 -46 74 -153 248 -239 385 -201 321 -242 391 -393 675 -68 129 -158 296 -200 371 -152 273 -290 569 -273 586 3 3 7 4 8 2 2 -2 32 -62 67 -134 35 -71 123 -229 196 -350 73 -121 210 -357 304 -525 95 -167 255 -433 355 -590 101 -157 237 -370 302 -475 163 -262 330 -509 523 -775 330 -453 587 -780 614 -780 11 0 17 -8 17 -21 0 -21 94 -134 270 -324 80 -87 106 -108 203 -163 754 -430 963 -578 1527 -1087 506 -457 751 -635 1059 -774 195 -87 364 -142 781 -252 1138 -301 1494 -420 2115 -706 349 -162 497 -219 715 -278 228 -61 390 -84 646 -92 295 -9 600 22 972 98 373 76 556 88 754 49 122 -24 119 -23 112 -7 -7 20 38 80 69 91 21 8 31 6 47 -9 27 -25 27 -85 0 -110 -20 -18 -17 -20 172 -88 210 -74 408 -129 531 -146 86 -12 226 -15 252 -5 15 6 15 8 -1 25 -9 10 -19 37 -21 61 -6 51 21 92 73 114 29 12 39 12 73 -2 38 -15 40 -18 47 -70 3 -29 4 -60 0 -69 -18 -49 126 29 200 108 69 75 94 107 94 123 0 6 -20 19 -45 29 -58 22 -95 69 -95 121 0 33 8 48 43 87 37 39 50 47 79 47 44 0 43 7 -12 127 -95 205 -251 374 -509 553 -102 70 -105 71 -120 52 -23 -29 -56 -36 -75 -17 -20 20 -20 35 -2 61 13 19 5 25 -161 124 -213 127 -330 214 -446 328 -76 76 -197 226 -197 246 0 4 46 -25 103 -64 215 -151 557 -376 947 -625 622 -396 979 -640 1246 -853 58 -46 107 -82 109 -80 12 12 -1019 864 -1975 1632 -272 219 -540 435 -595 480 -55 45 -451 363 -880 707 -673 540 -1132 908 -1185 952 -8 7 -49 39 -90 72 -68 54 -467 377 -515 416 -11 10 -184 151 -385 316 -1855 1518 -3156 2674 -3904 3468 -159 169 -624 694 -681 770 -48 62 -272 311 -425 470 -63 66 -133 139 -154 162 l-39 42 59 -14 c32 -7 176 -41 319 -74 143 -33 319 -72 390 -86 72 -14 140 -28 152 -30 17 -4 21 -2 17 10 -3 8 -10 12 -16 9 -5 -3 -15 2 -22 12 -9 11 -20 15 -32 11 -18 -7 -18 -6 0 8 11 8 14 15 7 15 -7 0 -10 4 -6 9 3 5 1 13 -5 16 -6 4 -10 3 -9 -2 7 -43 -55 -41 -98 3 -11 10 -10 12 6 11 11 0 17 -5 15 -9 -3 -4 2 -5 11 -2 9 4 13 10 8 14 -15 15 -48 16 -58 2 -13 -17 -48 -5 -41 14 3 8 -1 14 -10 14 -9 0 -12 -5 -8 -12 4 -7 -1 -6 -12 3 -10 9 -39 22 -64 28 -102 28 -298 73 -504 117 l-220 47 -120 109 c-67 61 -183 160 -258 221 -76 61 -136 112 -135 113 1 2 70 -12 152 -31 373 -85 675 -125 1006 -132 l257 -6 -2 24 c0 13 4 23 10 22 6 -1 11 4 11 11 0 6 -12 13 -26 14 -20 1 -23 0 -11 -8 9 -6 10 -10 3 -10 -6 0 -19 -7 -28 -17 -10 -10 -19 -12 -23 -6 -4 5 -22 17 -41 26 -37 19 -55 22 -31 7 12 -8 11 -10 -7 -10 -13 0 -23 5 -23 11 0 6 -7 8 -16 5 -8 -3 -12 -2 -9 4 3 5 -4 9 -17 9 -29 -2 -299 27 -443 47 -262 36 -548 95 -846 174 -149 40 -209 61 -305 109 -207 103 -329 149 -720 266 -649 196 -922 314 -1074 466 -76 76 -95 125 -95 244 0 90 4 111 39 210 21 61 41 115 45 121 5 11 124 -42 556 -245 64 -30 120 -49 97 -33 -11 7 -11 10 2 15 10 4 16 1 16 -8 0 -8 7 -15 16 -15 9 0 12 -5 8 -12 -4 -7 -3 -8 4 -4 6 4 21 2 32 -4 15 -8 20 -8 20 2 0 9 3 9 9 -2 6 -8 8 -17 5 -21 -2 -4 3 -10 12 -13 8 -3 12 -2 9 4 -10 16 24 70 40 64 8 -4 12 -10 9 -15 -3 -5 -9 -7 -14 -4 -5 3 -11 1 -14 -4 -3 -5 1 -12 10 -15 8 -3 12 -10 9 -16 -3 -5 -1 -10 6 -10 7 0 9 -3 5 -7 -4 -5 -14 1 -22 11 -8 11 -14 15 -14 9 0 -17 33 -48 38 -35 2 7 2 14 0 18 -2 3 14 14 35 23 31 14 35 19 22 25 -10 3 -28 0 -41 -9 -14 -9 -24 -11 -24 -5 0 6 7 13 16 17 13 5 9 10 -17 24 -24 12 -38 14 -46 7 -7 -6 -13 -7 -13 -2 0 5 -5 2 -11 -6 -9 -12 -10 -10 -6 8 4 18 -2 26 -34 42 -21 11 -39 18 -39 14 0 -4 -6 -1 -13 5 -8 6 -17 8 -20 4 -4 -3 -7 0 -7 8 0 12 -2 11 -10 -1 -8 -13 -11 -13 -22 -1 -10 10 -10 12 0 7 6 -4 12 -3 12 2 0 8 -73 46 -90 47 -3 1 -14 6 -25 12 -18 10 -21 9 -22 -10 0 -12 1 -16 4 -9 3 6 9 12 14 12 6 0 7 -5 4 -10 -4 -6 -3 -10 2 -9 20 3 27 -2 13 -11 -9 -6 -10 -10 -3 -10 6 0 15 5 18 10 10 16 23 11 20 -7 -3 -21 -34 -19 -51 3 -6 7 -13 11 -16 9 -3 -3 -27 18 -54 47 -44 47 -70 62 -226 133 l-177 80 7 40 c14 83 6 197 -20 272 -69 195 -289 415 -580 581 -51 28 -91 52 -88 52 3 0 77 -13 165 -29 137 -24 183 -38 320 -93 316 -129 658 -294 1300 -629 779 -406 959 -478 1325 -528 328 -45 495 -73 588 -97 199 -52 347 -127 447 -228 81 -81 88 -91 178 -236 86 -139 111 -173 178 -239 89 -90 181 -148 294 -187 73 -25 92 -28 225 -27 118 0 179 6 325 33 293 52 537 52 742 0 39 -11 208 -71 375 -136 412 -159 649 -242 922 -324 930 -279 1218 -318 1826 -249 226 25 528 30 685 10 55 -7 224 -30 375 -51 385 -55 558 -70 820 -70 446 0 729 52 1117 206 92 36 182 72 198 80 44 19 96 40 230 94 425 171 676 218 1005 191 354 -30 452 -33 573 -22 288 27 484 89 845 267 425 209 483 226 1042 309 434 65 668 139 917 293 46 28 93 60 105 71 12 12 25 21 28 21 4 0 16 8 28 18 11 9 30 24 42 32 12 8 30 22 40 30 10 8 28 22 40 30 12 8 28 20 34 25 6 6 34 26 61 45 28 19 52 37 55 40 6 7 130 88 185 121 161 96 369 156 625 180 210 20 588 0 1480 -75 544 -47 615 -50 1054 -48 642 2 1038 23 1364 73 119 18 165 32 416 123 1086 399 2225 876 3256 1364 317 150 1250 617 1635 817 404 211 689 363 1620 860 1748 934 2536 1344 3505 1819 2101 1032 3909 1759 5585 2246 160 47 183 51 210 41 125 -51 249 -82 495 -125 168 -29 622 -200 1065 -401 484 -219 901 -454 1410 -795 321 -216 480 -330 1195 -865 703 -525 892 -662 1195 -867 482 -326 910 -569 1460 -831 1130 -538 2292 -936 3475 -1188 52 -11 102 -22 110 -24 14 -3 257 -51 305 -60 1179 -226 2576 -314 3748 -235 170 12 228 25 286 63 72 48 95 160 52 251 -47 95 -203 212 -449 335 -255 128 -454 209 -962 392 -555 200 -965 396 -1186 567 -160 124 -242 229 -453 581 -75 125 -162 261 -193 302 -83 110 -200 217 -403 369 -224 169 -351 290 -573 550 -284 332 -421 458 -631 582 -131 76 -226 151 -341 267 -128 130 -240 274 -451 581 -215 312 -270 382 -418 530 -145 145 -248 230 -411 337 -63 42 -119 79 -123 83 -4 4 0 20 9 37 17 29 17 31 -7 69 -30 50 -139 186 -192 241 -29 30 -36 44 -26 47 8 3 50 17 94 32 284 95 580 297 765 523 108 131 188 268 281 480 229 520 282 589 718 927 301 232 446 414 556 697 125 322 148 374 200 462 110 188 242 323 579 595 357 287 492 435 597 655 66 139 108 265 174 525 135 532 180 633 399 888 149 174 191 230 241 325 56 105 71 165 89 359 17 179 31 221 97 292 63 69 160 129 404 250 216 106 348 182 373 214 19 25 14 66 -11 90 -69 65 -301 127 -627 168 -125 15 -239 16 -340 3z"/>
            <path d="M18533 12689 c3 -13 26 -147 51 -297 53 -314 81 -533 96 -747 12 -157 15 -1252 4 -1390 -8 -111 13 -681 31 -845 59 -522 168 -926 490 -1810 138 -380 237 -675 375 -1115 242 -772 395 -1155 635 -1590 278 -504 585 -945 1335 -1920 135 -176 342 -446 460 -600 255 -335 329 -427 521 -650 480 -558 843 -868 1264 -1081 242 -122 412 -178 575 -190 188 -14 324 49 416 193 37 57 84 186 84 230 l0 28 -23 -27 c-96 -114 -246 -154 -426 -113 -99 23 -290 122 -416 217 -208 156 -538 509 -795 852 -19 26 -40 52 -46 59 -20 22 -161 232 -204 302 -24 39 -108 189 -188 335 -180 330 -181 332 -255 460 -226 394 -391 640 -632 942 -294 367 -425 630 -619 1243 -184 581 -262 736 -619 1238 -80 113 -175 249 -211 304 -131 199 -250 457 -326 704 -63 205 -98 376 -215 1039 -86 486 -245 1241 -355 1680 -107 426 -125 556 -117 848 3 134 14 286 32 432 34 275 38 550 11 755 -10 72 -20 149 -22 171 -9 73 -19 97 -45 105 -13 4 -132 39 -265 78 -193 56 -422 126 -588 177 -16 5 -18 2 -13 -17z"/>
          </g>
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
