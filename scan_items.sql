SELECT di.id, d.delivery_number, di.product_name, di.quantity_delivered, COALESCE(di.is_bonus, false) as is_bonus
FROM delivery_items di 
JOIN deliveries d ON d.id = di.delivery_id 
WHERE d.transaction_id LIKE '%0301-006%'
ORDER BY d.delivery_number;
