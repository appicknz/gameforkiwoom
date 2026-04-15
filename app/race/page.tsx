// Server Component — force-dynamic으로 static export 방지
export const dynamic = "force-dynamic"

import { RaceClient } from "./race-client"

export default function RacePage() {
  return <RaceClient />
}
