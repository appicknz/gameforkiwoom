"use client"

import { Sidebar } from "@/components/dashboard/sidebar"
import { TopBar } from "@/components/dashboard/top-bar"
import { BitcoinChart } from "@/components/dashboard/bitcoin-chart"
import Link from "next/link"
import { ArrowRight, Zap, TrendingUp, Dice6 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function DashboardPage() {
  const gameCategories = [
    {
      id: "baccarat",
      name: "바카라",
      description: "비트코인 30초 바카라",
      href: "/baka",
      icon: "🃏",
      gradient: "from-blue-600 to-cyan-500",
      users: "48,480",
    },
    {
      id: "sports",
      name: "스포츠",
      description: "라이브 스포츠 배팅",
      href: "#",
      icon: "⚽",
      gradient: "from-green-600 to-emerald-500",
      users: "19,025",
    },
  ]

  const features = [
    {
      icon: <Zap className="w-5 h-5" />,
      title: "즉시 거래",
      description: "비트코인 가격 변동에 따른 실시간 게임",
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto lg:ml-64">
          {/* BitcoinChart 섹션 - 맨 위 */}
          <section className="border-b border-border px-4 md:px-6 lg:px-8 py-12 md:py-16">
            <div className="max-w-7xl mx-auto">
              <div className="mb-6">
                <h2 className="text-2xl md:text-3xl font-bold">비트코인 실시간 차트</h2>
                <p className="text-muted-foreground mt-2">30초마다 게임이 진행되는 비트코인 가격 차트</p>
              </div>
              <BitcoinChart />
            </div>
          </section>

          {/* 히어로 섹션 */}
          <section className="relative border-b border-border px-4 md:px-6 lg:px-8 py-12 md:py-16 lg:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center max-w-7xl mx-auto">
              {/* 좌측: 제목 + 설명 + CTA */}
              <div className="space-y-6">
                <div className="space-y-3">
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-balance leading-tight">
                    세계 최대 규모의 온라인 카지노 및 스포츠북
                  </h1>
                  <p className="text-lg md:text-xl text-muted-foreground">
                    비트코인으로 즉시 게임하세요. 낮은 수수료, 높은 배당률.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <Link href="/baka">
                    <Button size="lg" className="w-full sm:w-auto gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                      지금 시작하기
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                  <p className="text-sm text-muted-foreground">또는 다른 방법으로 가입</p>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1 sm:flex-none">
                      <span className="mr-2">🔍</span> Google
                    </Button>
                    <Button variant="outline" className="flex-1 sm:flex-none">
                      <span className="mr-2">📘</span> Facebook
                    </Button>
                  </div>
                </div>
              </div>

              {/* 우측: 게임 카테고리 썸네일 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
                {gameCategories.map((game) => (
                  <Link key={game.id} href={game.href}>
                    <div className={`relative group cursor-pointer rounded-2xl overflow-hidden h-48 md:h-56 bg-gradient-to-br ${game.gradient} p-6 flex flex-col justify-between hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1`}>
                      {/* 배경 그라데이션 오버레이 */}
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors duration-300" />
                      
                      <div className="relative z-10">
                        <div className="text-6xl mb-2">{game.icon}</div>
                        <h3 className="text-2xl font-bold text-white">{game.name}</h3>
                        <p className="text-sm text-white/80">{game.description}</p>
                      </div>

                      <div className="relative z-10 flex items-center justify-between pt-4 border-t border-white/20">
                        <span className="text-sm text-white/90">👥 {game.users}</span>
                        <span className="text-white/60 group-hover:text-white transition-colors">→</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* 피처 카드 섹션 */}
          <section className="border-b border-border px-4 md:px-6 lg:px-8 py-12 md:py-16">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold mb-3">왜 우리를 선택할까요?</h2>
                <p className="text-lg text-muted-foreground">가장 투명하고 공정한 게임 환경</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
