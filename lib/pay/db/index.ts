import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

// 결제 시스템 전용 Neon DB 연결 (NEON_DATABASE_URL 사용)
export const payPool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL,
})

export const payDb = drizzle(payPool, { schema })
