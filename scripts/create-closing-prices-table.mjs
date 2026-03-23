import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { error } = await supabase.rpc("exec_sql", {
  sql: `
    CREATE TABLE IF NOT EXISTS btc_closing_prices (
      id         BIGSERIAL PRIMARY KEY,
      time       BIGINT NOT NULL UNIQUE,
      price      NUMERIC(16, 2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_btc_closing_prices_time ON btc_closing_prices (time DESC);
  `
})

if (error) {
  // exec_sql RPC가 없으면 직접 insert로 테이블 존재 여부 확인
  console.log("[v0] exec_sql not available, trying direct approach:", error.message)

  // 테이블이 없으면 postgres extension으로 생성
  const { error: e2 } = await supabase.from("btc_closing_prices").select("id").limit(1)
  if (e2 && e2.code === "42P01") {
    console.log("[v0] Table does not exist - please create manually via Supabase dashboard:")
    console.log(`
CREATE TABLE IF NOT EXISTS btc_closing_prices (
  id         BIGSERIAL PRIMARY KEY,
  time       BIGINT NOT NULL UNIQUE,
  price      NUMERIC(16, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_btc_closing_prices_time ON btc_closing_prices (time DESC);
    `)
  } else if (!e2) {
    console.log("[v0] btc_closing_prices table already exists!")
  } else {
    console.log("[v0] Unexpected error:", e2)
  }
} else {
  console.log("[v0] btc_closing_prices table created successfully!")
}
