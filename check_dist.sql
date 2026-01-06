SELECT branch_id, count(1) 
FROM payment_history 
GROUP BY branch_id;
