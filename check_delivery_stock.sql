-- Check recent deliveries and their stock movements
SELECT 
    d.id as delivery_id,
    d.delivery_date,
    d.transaction_id,
    t.ref as transaction_ref,
    t.is_office_sale,
    di.product_id,
    di.product_name,
    di.quantity_delivered,
    psm.quantity as movement_qty,
    psm.created_at as movement_at,
    psm.reference_id
FROM deliveries d
JOIN transactions t ON t.id = d.transaction_id
JOIN delivery_items di ON di.delivery_id = d.id
LEFT JOIN product_stock_movements psm ON 
    psm.product_id = di.product_id AND 
    psm.movement_type = 'OUT' AND
    (
        psm.reference_id = t.ref OR 
        psm.reference_id = 'TR-UNKNOWN' OR
        psm.reference_id = d.id::TEXT
    )
ORDER BY d.created_at DESC
LIMIT 50;
