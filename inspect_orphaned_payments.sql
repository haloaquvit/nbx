-- Inspect orphaned payment history records (Corrected)
SELECT 
  ph.id, 
  ph.payment_date, 
  ph.amount, 
  ph.transaction_id, 
  t.branch_id as tx_branch_id
FROM payment_history ph
LEFT JOIN transactions t ON ph.transaction_id = t.id
WHERE ph.branch_id IS NULL;
