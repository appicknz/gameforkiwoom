import pg from "pg"

const client = new pg.Client({ connectionString: process.env.POSTGRES_URL })
await client.connect()

await client.query(`
  ALTER TABLE btc_closing_prices
    ADD COLUMN IF NOT EXISTS b_score    SMALLINT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS p_score    SMALLINT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS b_raw_sum  SMALLINT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS p_raw_sum  SMALLINT DEFAULT NULL;
`)

console.log("btc_closing_prices: score 컬럼 추가 완료")
await client.end()
