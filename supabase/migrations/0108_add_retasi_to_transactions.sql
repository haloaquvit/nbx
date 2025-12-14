-- Add retasi columns to transactions table
-- This allows linking driver transactions to their active retasi

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS retasi_id uuid REFERENCES retasi(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS retasi_number text;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_retasi_id ON transactions(retasi_id);
CREATE INDEX IF NOT EXISTS idx_transactions_retasi_number ON transactions(retasi_number);

-- Add comment to explain the purpose
COMMENT ON COLUMN transactions.retasi_id IS 'Reference to retasi table - links driver transactions to their active retasi';
COMMENT ON COLUMN transactions.retasi_number IS 'Retasi number for display purposes (e.g., RET-20251213-001)';
