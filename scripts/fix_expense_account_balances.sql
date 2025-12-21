-- ============================================================================
-- SCRIPT: Fix Expense Account Balances
-- ============================================================================
-- This script updates expense account (6xxx) balances based on existing
-- expenses in the expenses table. Run this once to backfill existing data.
-- ============================================================================

-- Step 1: Show current expense account balances (before)
SELECT code, name, balance
FROM accounts
WHERE type = 'Beban' AND is_header = false
ORDER BY code;

-- Step 2: Calculate total expenses per expense_account_id from expenses table
SELECT
  e.expense_account_id,
  e.expense_account_name,
  SUM(e.amount) as total_amount,
  COUNT(*) as expense_count
FROM expenses e
WHERE e.expense_account_id IS NOT NULL
GROUP BY e.expense_account_id, e.expense_account_name
ORDER BY total_amount DESC;

-- Step 3: Update each expense account balance
-- Run this for each expense account that has expenses

-- Option A: Manual update (safer - verify amounts first)
-- UPDATE accounts
-- SET balance = balance + (
--   SELECT COALESCE(SUM(amount), 0)
--   FROM expenses
--   WHERE expense_account_id = accounts.id
-- )
-- WHERE id IN (SELECT DISTINCT expense_account_id FROM expenses WHERE expense_account_id IS NOT NULL);

-- Option B: Reset and recalculate (use with caution)
-- This resets expense account balances and recalculates from expenses table
DO $$
DECLARE
  expense_record RECORD;
  current_balance NUMERIC;
BEGIN
  -- Loop through each unique expense_account_id
  FOR expense_record IN
    SELECT
      expense_account_id,
      SUM(amount) as total_amount
    FROM expenses
    WHERE expense_account_id IS NOT NULL
    GROUP BY expense_account_id
  LOOP
    -- Get current balance
    SELECT balance INTO current_balance
    FROM accounts
    WHERE id = expense_record.expense_account_id;

    -- Update the account balance (add expenses to current balance)
    UPDATE accounts
    SET balance = COALESCE(balance, 0) + expense_record.total_amount
    WHERE id = expense_record.expense_account_id;

    RAISE NOTICE 'Updated account % from % to %',
      expense_record.expense_account_id,
      current_balance,
      COALESCE(current_balance, 0) + expense_record.total_amount;
  END LOOP;
END $$;

-- Step 4: Show updated expense account balances (after)
SELECT code, name, balance
FROM accounts
WHERE type = 'Beban' AND is_header = false AND balance > 0
ORDER BY code;

-- Step 5: Verify totals match
SELECT
  'Expenses Table Total' as source,
  SUM(amount) as total
FROM expenses
WHERE expense_account_id IS NOT NULL

UNION ALL

SELECT
  'Expense Accounts Balance' as source,
  SUM(balance) as total
FROM accounts
WHERE type = 'Beban' AND is_header = false;
