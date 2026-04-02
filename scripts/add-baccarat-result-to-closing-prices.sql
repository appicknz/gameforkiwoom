-- btc_closing_prices 테이블에 baccarat_result 컬럼 추가
ALTER TABLE btc_closing_prices
  ADD COLUMN IF NOT EXISTS baccarat_result TEXT; -- 'banker' | 'player' | 'tie' | NULL
