-- Check if transactions have payment_account_id
SELECT 
  id,
  customer_name,
  order_date,
  total,
  payment_account_id,
  payment_status,
  is_office_sale,
  created_at
FROM transactions
WHERE order_date >= '2026-01-06'
  AND payment_account_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

-- Check if payment_account_id exists in old transactions
SELECT 
  COUNT(*) as total_transactions,
  COUNT(payment_account_id) as with_payment_account,
  COUNT(*) - COUNT(payment_account_id) as without_payment_account
FROM transactions
WHERE order_date >= '2026-01-01';

-- Check accounts table
SELECT id, code, name, is_payment_account
FROM accounts
WHERE is_payment_account = TRUE 
   OR code LIKE '11%'
   OR name ILIKE '%kas%'
   OR name ILIKE '%bank%'
ORDER BY code;
