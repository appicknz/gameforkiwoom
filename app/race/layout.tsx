import { GameAccessGate } from "@/components/dashboard/game-access-gate"

export default function RaceLayout({ children }: { children: React.ReactNode }) {
  return <GameAccessGate>{children}</GameAccessGate>
}
