-- Fix missing branch_id in payment_history
UPDATE payment_history ph
SET branch_id = t.branch_id
FROM transactions t
WHERE ph.transaction_id = t.id
  AND ph.branch_id IS NULL;
