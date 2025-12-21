-- ============================================================================
-- SCRIPT 2: Check Expense Account Status
-- ============================================================================
-- Run this AFTER Script 1 to see current state
-- ============================================================================

-- Show current expense accounts (Beban) with their balances
SELECT 'Akun Beban di COA:' as info;
SELECT code, name, balance
FROM accounts
WHERE type = 'Beban' AND is_header = false
ORDER BY code;

-- Show expenses that have expense_account_id set
SELECT 'Expenses dengan expense_account_id:' as info;
SELECT
  expense_account_id,
  expense_account_name,
  COUNT(*) as count,
  SUM(amount) as total
FROM expenses
WHERE expense_account_id IS NOT NULL
GROUP BY expense_account_id, expense_account_name
ORDER BY total DESC;

-- Show expenses that DON'T have expense_account_id (legacy data)
SELECT 'Expenses TANPA expense_account_id (data lama):' as info;
SELECT
  category,
  COUNT(*) as count,
  SUM(amount) as total
FROM expenses
WHERE expense_account_id IS NULL
GROUP BY category
ORDER BY total DESC;
