import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  TrendingUp, TrendingDown, ArrowUp, ArrowDown,
  Hash, Timer, DollarSign, AlertTriangle, CheckCircle, BookOpen,
} from "lucide-react"

const gameTypes = [
  {
    icon: TrendingUp,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    title: "롱 / 숏",
    subtitle: "가격 방향 예측",
    desc: "30초 라운드 시작 시점의 기준가 대비 종료 시점 마감가의 방향을 예측합니다.",
    rules: [
      { label: "롱 (Long)", desc: "마감가 ≥ 기준가일 때 승리", badge: "green" },
      { label: "숏 (Short)", desc: "마감가 < 기준가일 때 승리", badge: "red" },
    ],
    tip: "기준가와 마감가가 동일하면 롱이 승리합니다.",
  },
  {
    icon: ArrowUp,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    title: "오버 / 언더",
    subtitle: "소수점 첫째 자리 범위 예측",
    desc: "마감가의 소수점 첫째 자리(0~9)가 5 이상인지 4 이하인지를 예측합니다.",
    rules: [
      { label: "오버 (5~9)", desc: "끝자리가 5, 6, 7, 8, 9일 때 승리", badge: "green" },
      { label: "언더 (0~4)", desc: "끝자리가 0, 1, 2, 3, 4일 때 승리", badge: "amber" },
    ],
    tip: "오버와 언더는 각각 5/10 확률로 이론상 동일합니다.",
  },
  {
    icon: Hash,
    color: "text-sky-500",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    title: "홀 / 짝",
    subtitle: "소수점 첫째 자리 홀짝 예측",
    desc: "마감가의 소수점 첫째 자리가 홀수인지 짝수인지를 예측합니다.",
    rules: [
      { label: "홀 (1·3·5·7·9)", desc: "끝자리가 홀수일 때 승리", badge: "green" },
      { label: "짝 (0·2·4·6·8)", desc: "끝자리가 짝수(0 포함)일 때 승리", badge: "sky" },
    ],
    tip: "0은 짝수로 처리됩니다. 이론상 5/10 확률입니다.",
  },
]

const badgeClass: Record<string, string> = {
  green: "bg-primary/10 text-primary border-primary/20",
  red:   "bg-destructive/10 text-destructive border-destructive/20",
  amber: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  sky:   "bg-sky-500/10 text-sky-500 border-sky-500/20",
}

export default function AnalyticsPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-6 lg:ml-64">
        <Header
          title="게임방법"
          description="비트벳의 모든 게임 방식과 규칙을 설명합니다."
        />

        {/* 공통 규칙 */}
        <Card className="mt-6 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Timer className="w-4 h-4 text-primary" />
              기본 진행 방식
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  step: "1",
                  title: "배팅 기준가 확인",
                  desc: "매 30초마다 새로운 라운드가 시작됩니다. 라운드 시작 시점의 BTC 가격이 배팅 기준가가 됩니다.",
                  icon: DollarSign,
                },
                {
                  step: "2",
                  title: "배팅 진행",
                  desc: "롱/숏, 오버/언더, 홀/짝 중 원하는 항목에 보유 포인트를 배팅합니다. 복수 배팅 가능합니다.",
                  icon: TrendingUp,
                },
                {
                  step: "3",
                  title: "결과 확인",
                  desc: "30초 후 마감가를 기준으로 승패가 결정되고 배당이 지급됩니다. 배당률은 1.95배입니다.",
                  icon: CheckCircle,
                },
              ].map((s) => (
                <div key={s.step} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
                    {s.step}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{s.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-start gap-2">
              <DollarSign className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-foreground leading-relaxed">
                <span className="font-semibold">배당률 1.95배</span> — 100 포인트 배팅 시 승리하면 195 포인트를 받습니다.
                (배팅금 + 수익 95 포인트)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 게임 유형별 설명 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {gameTypes.map((g) => (
            <Card key={g.title} className={`border ${g.border}`}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className={`w-7 h-7 rounded-lg ${g.bg} flex items-center justify-center`}>
                    <g.icon className={`w-4 h-4 ${g.color}`} />
                  </div>
                  <div>
                    <div>{g.title}</div>
                    <div className="text-xs text-muted-foreground font-normal">{g.subtitle}</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">{g.desc}</p>

                <div className="space-y-2">
                  {g.rules.map((r) => (
                    <div key={r.label} className="flex items-start gap-2">
                      <Badge variant="outline" className={`text-[10px] px-1.5 shrink-0 ${badgeClass[r.badge]}`}>
                        {r.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{r.desc}</span>
                    </div>
                  ))}
                </div>

                <div className={`p-2 rounded-lg ${g.bg} flex items-start gap-1.5`}>
                  <AlertTriangle className={`w-3 h-3 ${g.color} mt-0.5 shrink-0`} />
                  <p className={`text-[11px] ${g.color}`}>{g.tip}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 끝자리 표 */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="w-4 h-4 text-primary" />
              끝자리 판정 기준표
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-center">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 px-3 text-muted-foreground font-medium">끝자리</th>
                    {[0,1,2,3,4,5,6,7,8,9].map((d) => (
                      <th key={d} className="py-2 px-3 font-bold">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-3 text-muted-foreground text-xs">오버/언더</td>
                    {[0,1,2,3,4,5,6,7,8,9].map((d) => (
                      <td key={d} className="py-2 px-3">
                        <Badge variant="outline" className={`text-[10px] px-1 ${d >= 5 ? "text-primary border-primary/30" : "text-amber-500 border-amber-500/30"}`}>
                          {d >= 5 ? "오버" : "언더"}
                        </Badge>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-muted-foreground text-xs">홀/짝</td>
                    {[0,1,2,3,4,5,6,7,8,9].map((d) => (
                      <td key={d} className="py-2 px-3">
                        <Badge variant="outline" className={`text-[10px] px-1 ${d % 2 !== 0 ? "text-primary border-primary/30" : "text-sky-500 border-sky-500/30"}`}>
                          {d % 2 !== 0 ? "홀" : "짝"}
                        </Badge>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
