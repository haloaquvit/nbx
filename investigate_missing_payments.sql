-- Check transactions in Kantor Pusat
SELECT count(*) as tx_count, status
FROM transactions
WHERE branch_id = '00000000-0000-0000-0000-000000000001'
GROUP BY status;

-- Check if there are journal entries for payments in Kantor Pusat
SELECT count(*) as journal_payment_count
FROM journal_entries
WHERE branch_id = '00000000-0000-0000-0000-000000000001'
  AND reference_type IN ('transaction_payment', 'payment');

-- Check if there are any payment histories at all in the DB (maybe other branches?)
SELECT branch_id, count(*) 
FROM payment_history 
GROUP BY branch_id;
