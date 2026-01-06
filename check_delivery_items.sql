-- Check delivery items for transaction AAQ-0301-006
SELECT 
    d.id as delivery_id,
    d.delivery_number,
    d.transaction_id,
    di.product_id,
    di.product_name,
    di.quantity_delivered,
    di.is_bonus,
    di.created_at
FROM deliveries d
JOIN delivery_items di ON di.delivery_id = d.id
WHERE d.transaction_id = 'AAQ-0301-006'
ORDER BY d.delivery_number, di.product_name;
