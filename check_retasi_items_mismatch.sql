-- Check if there are retasi_items for today's retasi
SELECT 
    r.retasi_number,
    r.driver_name,
    r.total_items as stored_total,
    COUNT(ri.id) as actual_items_count,
    SUM(ri.quantity) as actual_total_qty
FROM retasi r
LEFT JOIN retasi_items ri ON r.id = ri.retasi_id
WHERE r.departure_date = CURRENT_DATE
GROUP BY r.id, r.retasi_number, r.driver_name, r.total_items
ORDER BY r.created_at DESC;
