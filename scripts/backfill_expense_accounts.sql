-- ============================================================================
-- SCRIPT: Backfill Expense Account IDs for Legacy Data
-- ============================================================================
-- This script updates old expenses that have category but no expense_account_id
-- by matching category names to account names in the CoA
-- ============================================================================

-- Step 1: Show mapping between categories and accounts
SELECT DISTINCT
  e.category,
  a.id as account_id,
  a.code as account_code,
  a.name as account_name
FROM expenses e
LEFT JOIN accounts a ON
  a.type = 'Beban'
  AND a.is_header = false
  AND (LOWER(a.name) LIKE '%' || LOWER(e.category) || '%' OR LOWER(e.category) LIKE '%' || LOWER(a.name) || '%')
WHERE e.expense_account_id IS NULL
  AND e.category IS NOT NULL
GROUP BY e.category, a.id, a.code, a.name
ORDER BY e.category;

-- Step 2: Update expenses with matching account (preview first)
-- Uncomment the UPDATE statement after verifying the mapping above

/*
UPDATE expenses e
SET
  expense_account_id = a.id,
  expense_account_name = a.name
FROM accounts a
WHERE e.expense_account_id IS NULL
  AND e.category IS NOT NULL
  AND a.type = 'Beban'
  AND a.is_header = false
  AND (LOWER(a.name) = LOWER(e.category) OR LOWER(a.name) LIKE '%' || LOWER(e.category) || '%');
*/

-- Step 3: For categories that don't have a matching account,
-- you may need to create new expense accounts or manually map them

-- Common mappings (adjust as needed for your CoA):
/*
-- Map "Gaji" category to Beban Gaji account
UPDATE expenses
SET expense_account_id = (SELECT id FROM accounts WHERE name ILIKE '%beban gaji%' LIMIT 1),
    expense_account_name = (SELECT name FROM accounts WHERE name ILIKE '%beban gaji%' LIMIT 1)
WHERE expense_account_id IS NULL AND category ILIKE '%gaji%';

-- Map "Transport" category to Beban Transport account
UPDATE expenses
SET expense_account_id = (SELECT id FROM accounts WHERE name ILIKE '%transport%' LIMIT 1),
    expense_account_name = (SELECT name FROM accounts WHERE name ILIKE '%transport%' LIMIT 1)
WHERE expense_account_id IS NULL AND category ILIKE '%transport%';
*/

-- Step 4: After backfilling, update the expense account balances
-- Run this AFTER updating the expense_account_id fields

/*
DO $$
DECLARE
  expense_record RECORD;
BEGIN
  FOR expense_record IN
    SELECT
      expense_account_id,
      SUM(amount) as total_amount
    FROM expenses
    WHERE expense_account_id IS NOT NULL
    GROUP BY expense_account_id
  LOOP
    UPDATE accounts
    SET balance = COALESCE(balance, 0) + expense_record.total_amount
    WHERE id = expense_record.expense_account_id;

    RAISE NOTICE 'Updated account % with amount %',
      expense_record.expense_account_id,
      expense_record.total_amount;
  END LOOP;
END $$;
*/
