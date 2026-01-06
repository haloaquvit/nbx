-- Fix missing branch_id in transaction_payments
UPDATE transaction_payments tp
SET branch_id = t.branch_id
FROM transactions t
WHERE tp.transaction_id = t.id
  AND tp.branch_id IS NULL;
