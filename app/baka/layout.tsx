import { GameAccessGate } from "@/components/dashboard/game-access-gate"

export default function BakaLayout({ children }: { children: React.ReactNode }) {
  return <GameAccessGate>{children}</GameAccessGate>
}
