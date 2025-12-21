-- ============================================================================
-- SCRIPT: Add expense_account_id columns to expenses and cash_history tables
-- ============================================================================
-- This script adds the missing columns for COA integration
-- ============================================================================

-- Step 1: Check current structure of expenses table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'expenses'
ORDER BY ordinal_position;

-- Step 2: Add expense_account_id and expense_account_name columns to expenses table
-- Note: accounts.id is TEXT type, not UUID
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS expense_account_id TEXT REFERENCES accounts(id),
ADD COLUMN IF NOT EXISTS expense_account_name TEXT;

-- Step 3: Add expense_account_id and expense_account_name columns to cash_history table
ALTER TABLE cash_history
ADD COLUMN IF NOT EXISTS expense_account_id TEXT REFERENCES accounts(id),
ADD COLUMN IF NOT EXISTS expense_account_name TEXT;

-- Step 4: Verify columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'expenses' AND column_name LIKE '%expense%'
ORDER BY ordinal_position;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'cash_history' AND column_name LIKE '%expense%'
ORDER BY ordinal_position;

-- Step 5: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_expenses_expense_account_id ON expenses(expense_account_id);
CREATE INDEX IF NOT EXISTS idx_cash_history_expense_account_id ON cash_history(expense_account_id);

SELECT 'Columns added successfully!' as status;
