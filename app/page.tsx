"use client"

import { Sidebar } from "@/components/dashboard/sidebar"
import { TopBar } from "@/components/dashboard/top-bar"
import dynamic from "next/dynamic"
import Link from "next/link"
import { UserPlus, LogIn, Zap, TrendingUp, Dice6 } from "lucide-react"
import { Button } from "@/components/ui/button"

// lightweight-charts는 브라우저 전용 — SSR 비활성화 필수
const BitcoinChart = dynamic(
  () => import("@/components/dashboard/bitcoin-chart").then(m => m.BitcoinChart),
  { ssr: false }
)

// 게임 목록 — 최대 8개, 준비중인 게임은 href: null
const GAMES = [
  {
    id: "baccarat",
    name: "바카라",
    description: "비트코인 30초 바카라",
    href: "/baka",
    icon: "🃏",
    color: "bg-blue-600",
    users: "48,480",
    live: true,
  },
  {
    id: "chartchart",
    name: "차트차트",
    description: "비트코인 끝자리 배팅",
    href: "/race",
    icon: "📈",
    color: "bg-emerald-600",
    users: "19,025",
    live: true,
  },
  {
    id: "slots",
    name: "슬롯",
    description: "다양한 슬롯 머신",
    href: null,
    icon: "🎰",
    color: "bg-purple-600",
    users: null,
    live: false,
  },
  {
    id: "roulette",
    name: "룰렛",
    description: "클래식 룰렛",
    href: null,
    icon: "🎡",
    color: "bg-red-600",
    users: null,
    live: false,
  },
  {
    id: "blackjack",
    name: "블랙잭",
    description: "21 카드 게임",
    href: null,
    icon: "🂡",
    color: "bg-gray-700",
    users: null,
    live: false,
  },
  {
    id: "poker",
    name: "포커",
    description: "텍사스 홀덤",
    href: null,
    icon: "♠️",
    color: "bg-zinc-800",
    users: null,
    live: false,
  },
  {
    id: "dice",
    name: "주사위",
    description: "비트코인 주사위 게임",
    href: null,
    icon: "🎲",
    color: "bg-amber-600",
    users: null,
    live: false,
  },
  {
    id: "crash",
    name: "크래시",
    description: "배당 폭발 게임",
    href: null,
    icon: "🚀",
    color: "bg-orange-600",
    users: null,
    live: false,
  },
]

const features = [
  {
    icon: <Zap className="w-5 h-5" />,
    title: "즉시 거래",
    description: "하루 평균 20조원 규모 거래소의 101% 실시간 가격",
  },
  {
    icon: <TrendingUp className="w-5 h-5" />,
    title: "투명한 결과",
    description: "블록체인 기반 공정한 결과 판정",
  },
  {
    icon: <Dice6 className="w-5 h-5" />,
    title: "낮은 하우스 엣지",
    description: "업계 최고의 배팅 배당률 제공",
  },
]

function openAuth(tab: "login" | "register") {
  window.dispatchEvent(new CustomEvent("open:auth", { detail: tab }))
}

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto lg:ml-64">

          {/* ── 히어로 섹션: 좌측 카피 + 우측 비트코인 차트 ── */}
          <section className="relative border-b border-border px-4 md:px-6 lg:px-8 py-10 md:py-14 lg:py-18">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start max-w-7xl mx-auto">

              {/* 좌측: 헤드카피 + 로그인/회원가입 */}
              <div className="space-y-6 lg:pt-4">
                <div className="space-y-3">
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-balance leading-tight">
                    세계 최대 규모의 비트코인 끝자리로 하는 공정 게임
                  </h1>
                  <p className="text-lg md:text-xl text-muted-foreground">
                    수수료 없음. 최대 1000배의 배당을 경험하세요.
                  </p>
                </div>

                <div className="flex gap-3 flex-wrap">
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-none gap-2 h-11"
                    onClick={() => openAuth("register")}
                  >
                    <UserPlus className="w-4 h-4" />
                    회원가입
                  </Button>
                  <Button
                    className="flex-1 sm:flex-none gap-2 h-11 bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={() => openAuth("login")}
                  >
                    <LogIn className="w-4 h-4" />
                    로그인
                  </Button>
                </div>
              </div>

              {/* 우측: 비트코인 실시간 차트 */}
              <div className="rounded-2xl overflow-hidden border border-border">
                <div className="px-4 pt-3 pb-1 flex items-center gap-2 border-b border-border bg-muted/30">
                  <span className="text-sm font-semibold text-foreground">비트코인 실시간 차트</span>
                  <span className="text-xs text-muted-foreground">· 30초마다 게임 진행</span>
                </div>
                <BitcoinChart />
              </div>
            </div>
          </section>

          {/* ── 게임 섹션: 모바일 2열, 최대 8개 ── */}
          <section className="border-b border-border px-4 md:px-6 lg:px-8 py-10 md:py-14">
            <div className="max-w-7xl mx-auto">
              <div className="mb-6">
                <h2 className="text-2xl md:text-3xl font-bold">게임</h2>
                <p className="text-muted-foreground mt-1 text-sm">비트코인 끝자리 기반의 공정한 게임들</p>
              </div>

              {/* 모바일: grid-cols-2 / 태블릿: 3 / 데스크탑: 4 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                {GAMES.map((game) => {
                  const card = (
                    <div
                      className={`relative rounded-2xl overflow-hidden border transition-all duration-200 ${
                        game.live
                          ? "border-transparent hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
                          : "border-border cursor-default opacity-75"
                      }`}
                    >
                      {/* 컬러 헤더 */}
                      <div className={`${game.color} h-24 flex items-center justify-center`}>
                        <span className="text-5xl">{game.icon}</span>
                      </div>

                      {/* 정보 */}
                      <div className="bg-card px-3 py-3">
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <p className="font-bold text-sm text-foreground">{game.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{game.description}</p>
                          </div>
                          {!game.live && (
                            <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                              준비중
                            </span>
                          )}
                        </div>
                        {game.live && game.users && (
                          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                            {game.users} 플레이중
                          </p>
                        )}
                      </div>
                    </div>
                  )

                  return game.href ? (
                    <Link key={game.id} href={game.href}>{card}</Link>
                  ) : (
                    <div key={game.id}>{card}</div>
                  )
                })}
              </div>
            </div>
          </section>

          {/* ── 피처 카드 섹션 ── */}
          <section className="px-4 md:px-6 lg:px-8 py-10 md:py-14">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-3xl md:text-4xl font-bold mb-2">왜 우리를 선택할까요?</h2>
                <p className="text-lg text-muted-foreground">가장 투명하고 공정한 게임 환경</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {features.map((feature, idx) => (
                  <div key={idx} className="border border-border rounded-xl p-6 hover:border-primary/50 hover:bg-primary/5 transition-all duration-300">
                    <div className="text-primary mb-3">{feature.icon}</div>
                    <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground text-sm">{feature.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

        </main>
      </div>
    </div>
  )
}
