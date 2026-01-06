SELECT count(1) as total_payments 
FROM payment_history 
WHERE branch_id = '00000000-0000-0000-0000-000000000001';

SELECT id, payment_date, amount, transaction_id 
FROM payment_history 
WHERE branch_id = '00000000-0000-0000-0000-000000000001'
LIMIT 5;
