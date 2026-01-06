-- Find transaction for Toko Imelda
SELECT 
    id,
    customer_name,
    order_date,
    status,
    total
FROM transactions
WHERE customer_name ILIKE '%Imelda%'
ORDER BY order_date DESC
LIMIT 5;
