-- Add base_price_00s column to rounds table (00초 기준가)
ALTER TABLE rounds ADD COLUMN base_price_00s NUMERIC;

-- Create index for performance
CREATE INDEX idx_rounds_created_at ON rounds(created_at DESC);
