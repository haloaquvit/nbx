-- ============================================================================
-- SCRIPT 1: Add expense_account columns to database
-- ============================================================================
-- Run this FIRST to add the missing columns
-- ============================================================================

-- Add columns to expenses table
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS expense_account_id TEXT,
ADD COLUMN IF NOT EXISTS expense_account_name TEXT;

-- Add columns to cash_history table
ALTER TABLE cash_history
ADD COLUMN IF NOT EXISTS expense_account_id TEXT,
ADD COLUMN IF NOT EXISTS expense_account_name TEXT;

-- Verify columns were added
SELECT 'expenses table columns:' as info;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'expenses'
  AND column_name LIKE '%expense_account%'
ORDER BY column_name;

SELECT 'cash_history table columns:' as info;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'cash_history'
  AND column_name LIKE '%expense_account%'
ORDER BY column_name;

SELECT 'Columns added successfully!' as status;
