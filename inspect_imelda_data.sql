-- Inspect delivery_items for Toko Imelda (AQV-0301-006)
SELECT 
    di.id,
    di.delivery_id,
    d.delivery_number,
    di.product_id,
    di.product_name,
    di.quantity_delivered,
    di.is_bonus,
    di.created_at
FROM delivery_items di
JOIN deliveries d ON d.id = di.delivery_id
WHERE d.transaction_id LIKE '%0301-006%'
ORDER BY d.delivery_number, di.id;

-- Also check the transaction items themselves
SELECT id, items FROM transactions WHERE id LIKE '%0301-006%' OR ref LIKE '%0301-006%';
