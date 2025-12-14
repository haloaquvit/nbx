-- ============================================
-- MANUAL MIGRATION: Add Retasi to Transactions
-- ============================================
--
-- Instructions:
-- 1. Open Supabase Dashboard > SQL Editor
-- 2. Copy and paste this entire SQL script
-- 3. Click "Run" to execute
--
-- This migration adds retasi tracking to transactions
-- for driver POS integration
--
-- ============================================

-- Add retasi columns to transactions table
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS retasi_id uuid REFERENCES retasi(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS retasi_number text;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_retasi_id
ON transactions(retasi_id);

CREATE INDEX IF NOT EXISTS idx_transactions_retasi_number
ON transactions(retasi_number);

-- Add comments to explain the purpose
COMMENT ON COLUMN transactions.retasi_id IS
  'Reference to retasi table - links driver transactions to their active retasi';

COMMENT ON COLUMN transactions.retasi_number IS
  'Retasi number for display purposes (e.g., RET-20251213-001)';

-- Verify the migration
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'transactions'
  AND column_name IN ('retasi_id', 'retasi_number')
ORDER BY column_name;

-- Check for existing transactions with retasi data
SELECT
  COUNT(*) as total_transactions,
  COUNT(retasi_id) as transactions_with_retasi,
  COUNT(DISTINCT retasi_number) as unique_retasi_numbers
FROM transactions;

-- ============================================
-- Migration completed successfully!
-- ============================================
