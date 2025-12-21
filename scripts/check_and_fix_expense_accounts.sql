-- ============================================================================
-- SCRIPT: Check and Fix Expense Account Integration
-- ============================================================================
-- This script checks if expense_account columns exist and updates balances
-- ============================================================================

-- Step 1: Check if columns exist in expenses table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'expenses'
  AND column_name IN ('expense_account_id', 'expense_account_name')
ORDER BY column_name;

-- Step 2: Check if columns exist in cash_history table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'cash_history'
  AND column_name IN ('expense_account_id', 'expense_account_name')
ORDER BY column_name;

-- Step 3: Show current expense accounts (Beban) with their balances
SELECT code, name, balance
FROM accounts
WHERE type = 'Beban' AND is_header = false
ORDER BY code;

-- Step 4: Show expenses that have expense_account_id set
SELECT
  expense_account_id,
  expense_account_name,
  COUNT(*) as count,
  SUM(amount) as total
FROM expenses
WHERE expense_account_id IS NOT NULL
GROUP BY expense_account_id, expense_account_name
ORDER BY total DESC;

-- Step 5: Show expenses that DON'T have expense_account_id (legacy data)
SELECT
  category,
  COUNT(*) as count,
  SUM(amount) as total
FROM expenses
WHERE expense_account_id IS NULL
GROUP BY category
ORDER BY total DESC;
